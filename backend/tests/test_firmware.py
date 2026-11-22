import io
import json
import zipfile
import subprocess
from copy import deepcopy
from pathlib import Path

import httpx
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, func, select
from sqlalchemy.pool import StaticPool

from backend.app import db
from backend.app.firmware_generation import (
    FirmwareConfigurationError, FirmwareUnavailable, generate_firmware, pin_plan, validate_code, compile_sketch,
)
from backend.app.main import app, save_version
from backend.app.schemas import FirmwareInput
from backend.app.studio import generate


CODE = '''const float DRY_PCT = 30.0f;
const float WET_PCT = 50.0f;
void setup() { setControlTiming(60000UL, 600000UL); }
void loop() {
  for (size_t zone = 0; zone < ZONE_COUNT; ++zone) {
    size_t sensor = zone % SOIL_SENSOR_COUNT;
    if (!soilValid[sensor]) { requestWater(zone, false); continue; }
    if (soilMoisturePct[sensor] < DRY_PCT) { requestWater(zone, true); }
    else if (soilMoisturePct[sensor] > WET_PCT) { requestWater(zone, false); }
  }
}
'''
DRAFT = {'code': CODE, 'libraries': [], 'setup_steps': ['Calibrate ADC dry/wet readings.'],
         'assumptions': ['Classic ESP32 with analog soil sensors.'], 'limitations': ['Not hardware-tested.']}


@pytest.fixture(autouse=True)
def isolated_provider(monkeypatch):
    for key in ('STUDIO_AI_BASE_URL', 'STUDIO_AI_MODEL', 'STUDIO_AI_API_KEY'):
        monkeypatch.delenv(key, raising=False)
    def forbidden(*a, **k):
        raise AssertionError('Unexpected network call')
    monkeypatch.setattr(httpx, 'post', forbidden)
    # Unit tests must not depend on whether this workstation has Arduino installed.
    monkeypatch.setattr('backend.app.firmware_generation.compile_sketch', lambda code: 'not_checked')


@pytest.fixture
def design():
    result = generate('irrigation with 2 soil sensors')
    result['farm_context'] = {'zones': 2, 'area_ha': 1}
    return result


def request(**changes):
    return FirmwareInput(version=1, relay_active_low=True, **changes)


def mock_model(monkeypatch, draft=None, finish='stop', native=False):
    monkeypatch.setenv('STUDIO_AI_BASE_URL', 'http://127.0.0.1:11434/v1' if native else 'http://model.invalid/v1')
    monkeypatch.setenv('STUDIO_AI_MODEL', 'test-model')
    calls = []
    def respond(url, **kwargs):
        calls.append((url, kwargs['json']))
        content = json.dumps(DRAFT if draft is None else draft)
        body = ({'message': {'content': content}, 'done_reason': finish} if native else
                {'choices': [{'message': {'content': content}, 'finish_reason': finish}]})
        return httpx.Response(200, request=httpx.Request('POST', url), json=body)
    monkeypatch.setattr(httpx, 'post', respond)
    return calls


@pytest.mark.parametrize('native', [False, True])
def test_model_code_has_provenance_and_disabled_outputs(monkeypatch, design, native):
    calls = mock_model(monkeypatch, native=native)
    original = deepcopy(design)
    result = generate_firmware(design, request())
    assert design == original
    assert result['source'] == 'provider' and result['model'] == 'test-model'
    assert result['compile_status'] == 'not_checked' and result['hardware_tested'] is False
    assert result['outputs_enabled'] is False
    assert 'constexpr bool OUTPUTS_ENABLED = false;' in result['code']
    assert 'constexpr bool RELAY_ACTIVE_LOW = true;' in result['code']
    assert 'constexpr size_t ZONE_COUNT = 2;' in result['code']
    assert 'void generatedSetup()' in result['code'] and 'void generatedLoop()' in result['code']
    assert 'void setup()' in result['code'] and 'void loop()' in result['code']
    assert result['libraries'] == [] and result['setup_steps'] == DRAFT['setup_steps']
    if native:
        assert calls[0][0] == 'http://127.0.0.1:11434/api/chat'
        assert calls[0][1]['options']['num_ctx'] == 8192
        assert calls[0][1]['think'] is False
    else:
        assert calls[0][0] == 'http://model.invalid/v1/chat/completions'


def test_pin_map_resolves_two_zone_flow_conflict(design):
    pins, zones = pin_plan(design, request(temperature_sensor='sht31'))
    by_name = {pin['symbol']: pin['gpio'] for pin in pins}
    assert zones == 2
    assert by_name['PUMP_PIN'] == 26 and by_name['FLOW_PIN'] == 27
    assert by_name['VALVE_1_PIN'] == 25 and by_name['VALVE_2_PIN'] == 14
    assert by_name['I2C_SDA_PIN'] == 21
    assert len(set(by_name.values())) == len(pins)
    assert all(pin['gpio'] < 34 for pin in pins if pin['mode'] == 'output')


def test_radio_reserves_spi_pins(design):
    design['options']['lora'] = True
    pins, _ = pin_plan(design, request())
    assert len({pin['gpio'] for pin in pins}) == len(pins)
    design['farm_context']['zones'] = 4
    with pytest.raises(FirmwareConfigurationError, match='firmwarePinCapacity'):
        pin_plan(design, request())


@pytest.mark.parametrize('mutation,error', [
    ('zones', 'firmwarePinCapacity'), ('sensors', 'firmwarePinCapacity'),
    ('greenhouse', 'firmwareGreenhouseHardware'),
])
def test_unrepresentable_hardware_is_explicit(design, mutation, error):
    if mutation == 'zones': design['farm_context']['zones'] = 20
    if mutation == 'sensors': design['options']['soil_count'] = 24
    if mutation == 'greenhouse': design['options']['profile'] = 'greenhouse'
    with pytest.raises(FirmwareConfigurationError, match=error):
        pin_plan(design, request())


@pytest.mark.parametrize('bad_code', [
    CODE.replace('void loop()', 'void incomplete()'),
    CODE + '\n// TODO: implement the real algorithm',
    CODE.replace('requestWater(zone, true);', 'digitalWrite(PUMP_PIN, LOW);'),
    CODE + '\nvoid setPump(bool on) {}',
    CODE + '\nconst bool OUTPUTS_ENABLED = true;',
    CODE + '\n#include "../private.h"',
    CODE + '\n{',
    '```cpp\n' + CODE + '\n```',
    CODE.replace('DRY_PCT)', 'UNDEFINED_THRESHOLD)'),
    CODE + '\nvoid surprise() {}',
    CODE.replace('requestWater(zone, true);', 'soilValid[zone] = true;'),
])
def test_invalid_or_incomplete_code_is_rejected(design, bad_code):
    pins, _ = pin_plan(design, request())
    with pytest.raises(ValueError):
        validate_code(bad_code, pins)


def test_truncated_model_output_is_not_accepted(monkeypatch, design):
    mock_model(monkeypatch, finish='length')
    with pytest.raises(FirmwareUnavailable, match='firmwareGenerationFailed'):
        generate_firmware(design, request())


def test_missing_provider_has_no_rule_fallback(design):
    with pytest.raises(FirmwareUnavailable, match='firmwareModelUnavailable'):
        generate_firmware(design, request())


@pytest.mark.parametrize('outcome', ['passed', 'missing', 'error', 'timeout'])
def test_compiler_status_and_failures(monkeypatch, tmp_path, outcome):
    monkeypatch.setattr('backend.app.firmware_generation.TOOLCHAIN', tmp_path)
    monkeypatch.setattr('backend.app.firmware_generation.ROOT', tmp_path)
    if outcome != 'missing':
        (tmp_path / 'arduino-cli.exe').touch()
        (tmp_path / 'arduino-cli.yaml').touch()
    def run(command, **kwargs):
        assert command[3] == 'compile' and 'esp32:esp32:esp32' in command
        assert 'upload' not in command
        assert (Path(command[-1]) / 'resilifarm.ino').read_text() == CODE
        if outcome == 'timeout':
            raise subprocess.TimeoutExpired(command, 180)
        return subprocess.CompletedProcess(command, 0 if outcome == 'passed' else 1)
    monkeypatch.setattr(subprocess, 'run', run)
    if outcome in ('error', 'timeout'):
        with pytest.raises(FirmwareUnavailable, match='firmwareCompileFailed'):
            compile_sketch(CODE)
    else:
        assert compile_sketch(CODE) == ('passed' if outcome == 'passed' else 'not_checked')


@pytest.fixture
def project_client(monkeypatch, design):
    engine = create_engine('sqlite://', connect_args={'check_same_thread': False}, poolclass=StaticPool)
    monkeypatch.setattr(db, 'engine', engine)
    try:
        with TestClient(app) as client:
            with engine.begin() as c:
                pid = c.execute(db.projects.insert().values(region_id=1, name='Firmware test')).inserted_primary_key[0]
                save_version(c, pid, 'Irrigation', design, 1)
            yield client, pid
    finally:
        engine.dispose()


def test_api_versions_code_and_exports_selected_version(monkeypatch, project_client):
    client, pid = project_client
    before = client.get(f'/api/v1/aiot/projects/{pid}').json()
    mock_model(monkeypatch)
    response = client.post(f'/api/v1/aiot/projects/{pid}/firmware', json=request().model_dump())
    assert response.status_code == 200, response.text
    project = response.json()
    assert len(project['versions']) == 2
    assert project['versions'][0]['design'] == before['design']
    assert project['design']['firmware_generation']['source'] == 'provider'
    assert project['deployed'] is False
    archive = client.get(f'/api/v1/aiot/projects/{pid}/export?version=2')
    with zipfile.ZipFile(io.BytesIO(archive.content)) as z:
        assert z.read('resilifarm/resilifarm.ino').decode() == project['design']['firmware']
        assert json.loads(z.read('firmware_manifest.json'))['compile_status'] == 'not_checked'
        assert 'VALVE_2_PIN,14,output' in z.read('firmware_pins.csv').decode()
        assert 'starter.ino' not in z.namelist()
    old = client.get(f'/api/v1/aiot/projects/{pid}/export?version=1')
    with zipfile.ZipFile(io.BytesIO(old.content)) as z:
        assert z.read('starter.ino').decode() == before['design']['firmware']


@pytest.mark.parametrize('bad_request', [
    {'version': 1}, {'version': 1, 'relay_active_low': 'false'},
    {'version': 1, 'relay_active_low': True, 'board': 'esp32-s3'},
    {'version': 1, 'relay_active_low': True, 'temperature_sensor': 'unknown'},
])
def test_api_requires_explicit_supported_hardware(project_client, bad_request):
    client, pid = project_client
    response = client.post(f'/api/v1/aiot/projects/{pid}/firmware', json=bad_request)
    assert response.status_code == 422
    assert len(client.get(f'/api/v1/aiot/projects/{pid}').json()['versions']) == 1


def test_generation_failure_and_stale_version_do_not_write(monkeypatch, project_client):
    client, pid = project_client
    mock_model(monkeypatch, {'code': 'incomplete', **{k: v for k, v in DRAFT.items() if k != 'code'}})
    before = client.get(f'/api/v1/aiot/projects/{pid}').json()
    assert client.post(f'/api/v1/aiot/projects/{pid}/firmware', json=request().model_dump()).status_code == 503
    stale = {**request().model_dump(), 'version': 2}
    assert client.post(f'/api/v1/aiot/projects/{pid}/firmware', json=stale).status_code == 409
    assert client.get(f'/api/v1/aiot/projects/{pid}').json() == before


def test_compile_failure_does_not_persist(monkeypatch, project_client):
    client, pid = project_client
    mock_model(monkeypatch)
    def fail(code):
        raise FirmwareUnavailable('firmwareCompileFailed')
    monkeypatch.setattr('backend.app.firmware_generation.compile_sketch', fail)
    before = client.get(f'/api/v1/aiot/projects/{pid}').json()
    response = client.post(f'/api/v1/aiot/projects/{pid}/firmware', json=request().model_dump())
    assert response.status_code == 503 and response.json()['error']['code'] == 'firmwareCompileFailed'
    assert client.get(f'/api/v1/aiot/projects/{pid}').json() == before


def test_successful_compile_status_reaches_export(monkeypatch, project_client):
    client, pid = project_client
    mock_model(monkeypatch)
    monkeypatch.setattr('backend.app.firmware_generation.compile_sketch', lambda code: 'passed')
    response = client.post(f'/api/v1/aiot/projects/{pid}/firmware', json=request().model_dump())
    assert response.status_code == 200
    assert response.json()['design']['firmware_generation']['compile_status'] == 'passed'
    with zipfile.ZipFile(io.BytesIO(client.get(f'/api/v1/aiot/projects/{pid}/export').content)) as archive:
        assert 'Compilation: passed.' in archive.read('firmware_setup.txt').decode()


def test_edit_during_generation_rejects_stale_firmware(monkeypatch, project_client, design):
    client, pid = project_client
    def racing_generation(*a):
        with db.engine.begin() as c:
            save_version(c, pid, 'Concurrent edit', design, 2)
        return {'code': CODE, 'source': 'provider'}
    monkeypatch.setattr('backend.app.main.generate_firmware', racing_generation)
    assert client.post(f'/api/v1/aiot/projects/{pid}/firmware', json=request().model_dump()).status_code == 409
    with db.engine.connect() as c:
        assert c.execute(select(func.count()).select_from(db.versions)).scalar_one() == 2


def test_firmware_locale_key_parity():
    root = Path(__file__).resolve().parents[2] / 'frontend/src/i18n'
    dictionaries = [json.loads((root / f'{lang}.json').read_text(encoding='utf-8')) for lang in ('en', 'fr', 'ja', 'ar')]
    keys = {key for key in dictionaries[0] if key.startswith('firmware')}
    assert all({key for key in d if key.startswith('firmware')} == keys for d in dictionaries)
