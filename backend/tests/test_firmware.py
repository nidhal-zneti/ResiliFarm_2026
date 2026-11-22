"""The Studio firmware path builds a deterministic, review-required local starter."""
import io
import json
import subprocess
import zipfile
from copy import deepcopy
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, func, select
from sqlalchemy.pool import StaticPool

from backend.app import db, main
from backend.app.firmware_generation import (
    FirmwareConfigurationError,
    FirmwareUnavailable,
    compile_sketch,
    generate_firmware,
    pin_plan,
    validate_code,
)
from backend.app.main import app, save_version
from backend.app.schemas import FirmwareInput
from backend.app.studio import generate


LOGIC = '''const float DRY_PCT = 30.0f;
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


@pytest.fixture(autouse=True)
def local_template_only(monkeypatch):
    monkeypatch.delenv('STUDIO_AI_BASE_URL', raising=False)
    monkeypatch.delenv('STUDIO_AI_MODEL', raising=False)
    monkeypatch.delenv('STUDIO_AI_API_KEY', raising=False)
    monkeypatch.delenv('FIRMWARE_COMPILE', raising=False)
    monkeypatch.setattr('backend.app.firmware_generation.compile_sketch', lambda code: 'not_checked')


@pytest.fixture
def design():
    return generate('irrigation with 2 soil sensors and 2 zones')


def request(**changes):
    values = {
        'version': 1,
        'board': 'esp32-devkit',
        'relay_active_low': True,
        'temperature_sensor': 'none',
        'hardware_notes': '',
        'requirements': '',
        'language': 'en',
    }
    return FirmwareInput(**{**values, **changes})


def test_local_template_has_review_required_outputs(design):
    original = deepcopy(design)
    result = generate_firmware(design, request(relay_active_low=False, temperature_sensor='sht31'))
    assert design == original
    assert result['source'] == 'template'
    assert result['model'] == 'ResiliFarm local irrigation template'
    assert result['compile_status'] == 'not_checked'
    assert result['hardware_tested'] is False and result['outputs_enabled'] is False
    assert 'constexpr bool OUTPUTS_ENABLED = false;' in result['code']
    assert 'constexpr bool RELAY_ACTIVE_LOW = false;' in result['code']
    assert 'void setup()' in result['code'] and 'void loop()' in result['code']
    assert 'CALIBRATION_CONFIRMED = false' in result['code']
    assert 'Adafruit SHT31 Library' in result['libraries']
    assert 'Measure and enter dry/wet ADC calibration values' in result['setup_steps'][0]


def test_pin_plan_maps_two_zones_and_optional_sensor(design):
    pins, zones = pin_plan(design, request(temperature_sensor='sht31'))
    by_name = {pin['symbol']: pin['gpio'] for pin in pins}
    assert zones == 2
    assert by_name['PUMP_PIN'] == 26 and by_name['FLOW_PIN'] == 27
    assert by_name['VALVE_1_PIN'] == 25 and by_name['VALVE_2_PIN'] == 14
    assert by_name['I2C_SDA_PIN'] == 21 and by_name['I2C_SCL_PIN'] == 22
    assert len(set(by_name.values())) == len(pins)


def test_capacity_limits_are_reported_instead_of_unmapped_pins(design):
    design['options']['valves'] = 20
    design['options']['soil_count'] = 24
    next(part for part in design['bom'] if part['key'] == 'soil')['quantity'] = 24
    result = generate_firmware(design, request())
    assert len([pin for pin in result['pin_map'] if pin['component'].startswith('valve:')]) == 6
    assert len([pin for pin in result['pin_map'] if pin['component'].startswith('soil:')]) == 5
    assert any('20 irrigation zones' in note for note in result['limitations'])
    assert any('24 soil sensors' in note for note in result['limitations'])
    assert len({pin['gpio'] for pin in result['pin_map']}) == len(result['pin_map'])


def test_lora_reserves_bus_pins(design):
    design['options']['lora'] = True
    result = generate_firmware(design, request())
    symbols = {pin['symbol']: pin['gpio'] for pin in result['pin_map']}
    assert symbols['LORA_SCK_PIN'] == 18
    assert symbols['LORA_MOSI_PIN'] == 23
    assert len(set(symbols.values())) == len(symbols)
    assert 'LoRa by Sandeep Mistry' in result['libraries']


@pytest.mark.parametrize('bad_code', [
    LOGIC.replace('void loop()', 'void incomplete()'),
    LOGIC + '\n// TODO: implement the real algorithm',
    LOGIC.replace('requestWater(zone, true);', 'digitalWrite(PUMP_PIN, LOW);'),
    LOGIC + '\nvoid setPump(bool on) {}',
    LOGIC + '\nconst bool OUTPUTS_ENABLED = true;',
    LOGIC + '\n#include "../private.h"',
    LOGIC + '\n{',
    '```cpp\n' + LOGIC + '\n```',
    LOGIC.replace('DRY_PCT)', 'UNDEFINED_THRESHOLD)'),
    LOGIC + '\nvoid surprise() {}',
])
def test_firmware_validator_rejects_unsafe_or_incomplete_logic(design, bad_code):
    pins, _ = pin_plan(design, request())
    with pytest.raises(ValueError):
        validate_code(bad_code, pins)


@pytest.mark.parametrize('outcome', ['passed', 'missing', 'error', 'timeout'])
def test_optional_compile_status(monkeypatch, tmp_path, design, outcome):
    monkeypatch.setenv('FIRMWARE_COMPILE', '1')
    monkeypatch.setattr('backend.app.firmware_generation.TOOLCHAIN', tmp_path)
    monkeypatch.setattr('backend.app.firmware_generation.ROOT', tmp_path)
    code = generate_firmware(design, request())['code']
    if outcome != 'missing':
        (tmp_path / 'arduino-cli.exe').touch()
        (tmp_path / 'arduino-cli.yaml').touch()

    def run(command, **kwargs):
        assert command[3] == 'compile' and 'esp32:esp32:esp32' in command
        assert 'upload' not in command
        assert (Path(command[-1]) / 'resilifarm.ino').read_text() == code
        if outcome == 'timeout':
            raise subprocess.TimeoutExpired(command, 180)
        return subprocess.CompletedProcess(command, 0 if outcome == 'passed' else 1)

    monkeypatch.setattr(subprocess, 'run', run)
    if outcome in ('error', 'timeout'):
        with pytest.raises(FirmwareUnavailable, match='firmwareCompileFailed'):
            compile_sketch(code)
    else:
        assert compile_sketch(code) == ('passed' if outcome == 'passed' else 'not_checked')


@pytest.fixture
def project_client(monkeypatch, design):
    engine = create_engine('sqlite://', connect_args={'check_same_thread': False}, poolclass=StaticPool)
    monkeypatch.setattr(db, 'engine', engine)
    try:
        with TestClient(app) as client:
            with engine.begin() as connection:
                pid = connection.execute(db.projects.insert().values(region_id=1, name='Firmware test')).inserted_primary_key[0]
                save_version(connection, pid, 'Irrigation', design, 1)
            yield client, pid
    finally:
        engine.dispose()


def test_api_versions_template_code_and_exports(project_client):
    client, pid = project_client
    before = client.get(f'/api/v1/aiot/projects/{pid}').json()
    response = client.post(f'/api/v1/aiot/projects/{pid}/firmware', json=request().model_dump())
    assert response.status_code == 200, response.text
    project = response.json()
    assert len(project['versions']) == 2
    assert project['versions'][0]['design'] == before['design']
    assert project['design']['firmware_generation']['source'] == 'template'
    assert project['design']['firmware_generation']['outputs_enabled'] is False
    assert project['deployed'] is False
    archive = client.get(f'/api/v1/aiot/projects/{pid}/export?version=2')
    with zipfile.ZipFile(io.BytesIO(archive.content)) as result:
        names = set(result.namelist())
        assert {'resilifarm/resilifarm.ino', 'firmware_manifest.json', 'firmware_pins.csv', 'firmware_setup.txt'} <= names
        assert result.read('resilifarm/resilifarm.ino').decode() == project['design']['firmware']
        assert json.loads(result.read('firmware_manifest.json'))['compile_status'] == 'not_checked'
    old = client.get(f'/api/v1/aiot/projects/{pid}/export?version=1')
    with zipfile.ZipFile(io.BytesIO(old.content)) as result:
        assert 'starter.ino' in result.namelist()


@pytest.mark.parametrize('bad_request', [
    {'version': 1, 'relay_active_low': 'false'},
    {'version': 1, 'board': 'esp32-s3'},
    {'version': 1, 'temperature_sensor': 'unknown'},
    {'version': 1, 'unexpected': True},
])
def test_api_rejects_invalid_hardware_settings_without_writes(project_client, bad_request):
    client, pid = project_client
    response = client.post(f'/api/v1/aiot/projects/{pid}/firmware', json=bad_request)
    assert response.status_code == 422
    assert len(client.get(f'/api/v1/aiot/projects/{pid}').json()['versions']) == 1


def test_api_uses_defaults_and_rejects_stale_versions(project_client):
    client, pid = project_client
    stale = client.post(f'/api/v1/aiot/projects/{pid}/firmware', json={'version': 2})
    assert stale.status_code == 409
    minimal = client.post(f'/api/v1/aiot/projects/{pid}/firmware', json={'version': 1})
    assert minimal.status_code == 200
    assert len(minimal.json()['versions']) == 2


def test_compile_failure_does_not_persist(monkeypatch, project_client):
    client, pid = project_client
    def fail(code):
        raise FirmwareUnavailable('firmwareCompileFailed')
    monkeypatch.setattr('backend.app.firmware_generation.compile_sketch', fail)
    before = client.get(f'/api/v1/aiot/projects/{pid}').json()
    response = client.post(f'/api/v1/aiot/projects/{pid}/firmware', json=request().model_dump())
    assert response.status_code == 503 and response.json()['error']['code'] == 'firmwareCompileFailed'
    assert client.get(f'/api/v1/aiot/projects/{pid}').json() == before


def test_edit_during_generation_rejects_stale_firmware(monkeypatch, project_client, design):
    client, pid = project_client
    def racing_generation(*args):
        with db.engine.begin() as connection:
            save_version(connection, pid, 'Concurrent edit', design, 2)
        return {'code': 'void setup() {}'}
    monkeypatch.setattr(main, 'generate_firmware', racing_generation)
    response = client.post(f'/api/v1/aiot/projects/{pid}/firmware', json=request().model_dump())
    assert response.status_code == 409
    with db.engine.connect() as connection:
        assert connection.execute(select(func.count()).select_from(db.versions)).scalar_one() == 2


def test_firmware_locale_key_parity():
    root = Path(__file__).resolve().parents[2] / 'frontend/src/i18n'
    dictionaries = [json.loads((root / f'{language}.json').read_text(encoding='utf-8'))
                    for language in ('en', 'fr', 'ja', 'ar')]
    keys = {key for key in dictionaries[0] if key.startswith('firmware')}
    assert all({key for key in dictionary if key.startswith('firmware')} == keys for dictionary in dictionaries)
