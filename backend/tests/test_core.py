import io
import json
import os
import tempfile
import zipfile
from pathlib import Path

os.environ['DATABASE_URL']='sqlite:///'+str(Path(tempfile.mkdtemp())/'test.db')
import pytest
from fastapi.testclient import TestClient
from backend.app.main import app
from backend.app.schemas import FarmInput,ScenarioInput
from backend.app.services import irrigation,scenario,network,anomalies
from backend.app.studio import generate,validate
from backend.app import integrations

@pytest.fixture(autouse=True)
def isolated_studio_provider(monkeypatch):
    # Unit/API tests never call a developer's configured model or paid service.
    for key in ['STUDIO_AI_BASE_URL','STUDIO_AI_API_KEY','STUDIO_AI_MODEL']:
        monkeypatch.delenv(key,raising=False)

@pytest.fixture(scope='module')
def client():
    with TestClient(app) as c: yield c

def test_fao_units_efficiency_and_energy():
    r=irrigation(FarmInput(crop='wheat',stage='mid',et0=5,rainfall=1,area_ha=2,efficiency=.8,head_m=30,pump_efficiency=.6))
    assert r['etc_mm']==5.75
    assert r['net_mm']==4.95
    assert r['water_m3']==123.75
    assert r['pump_kwh']==pytest.approx(16.86,.001)
    assert irrigation(FarmInput(rainfall=100))['water_m3']==0
    assert irrigation(FarmInput(solar_kw=0))['solar_kwh']==0

@pytest.mark.parametrize('kind',['drought','heatwave','restriction','leak','pumpFailure','solarShortage','tampering'])
def test_scenarios_reproducible(kind):
    x=ScenarioInput(scenario=kind,intervention=True)
    assert scenario(x)==scenario(x)
    result=scenario(x)
    assert result['after']['water_m3']>=0
    if kind=='restriction':
        assert result['after']['delivered_m3']==result['disturbed']['delivered_m3']
        assert result['after']['unmet_m3']>0
    if kind=='leak':
        assert result['after']['lost_m3']<result['disturbed']['lost_m3']
        assert result['after']['pump_kwh']<result['disturbed']['pump_kwh']
    if kind=='pumpFailure': assert result['disturbed']['pump_kwh']==0

def test_hydraulic_conservation():
    n=network(200,.25)
    assert n['inlet_m3']-n['lost_m3']==pytest.approx(n['delivered_m3'],abs=.01)
    assert n['pressure_bar']<network(200)['pressure_bar']

def test_restriction_network_and_tampering():
    r=scenario(ScenarioInput(scenario='restriction',intervention=True))
    assert r['after']['inlet_m3']==r['after']['delivered_m3']
    t=scenario(ScenarioInput(scenario='tampering',intervention=True))
    assert t['telemetry']['disturbed_moisture_pct']>100
    assert t['telemetry']['after_moisture_pct']==31

def test_telemetry_rules():
    assert anomalies([40]*5+[70],[3]*5+[1.5],[30,31,30,31,30,140])['alerts'][0]['code']=='leakDetected'
    assert len(anomalies([40]*6,[3]*6,[30,31,30,31,30,31])['alerts'])==0
    assert anomalies([40]*6,[3]*6,[30]*6)['alerts'][0]['code']=='sensorFrozen'

@pytest.mark.parametrize('message',['Replace Wi-Fi with LoRa','Remplace le Wi-Fi par LoRa','Wi-FiをLoRaに置き換える'])
def test_lora_language(message):
    d=generate(message,generate('solar irrigation'))
    assert d['options']['lora']
    assert any(p['key']=='lora' for p in d['bom'])

def test_compatibility_and_editing():
    d=generate('solar irrigation')
    assert d['validation']['valid']
    assert not validate(d,supply_v=5)['valid']
    d=generate('8 soil sensors',d)
    assert not d['validation']['valid']
    assert generate('Replace incompatible components',d)['validation']['valid']
    assert generate('reduce cost',d)['cost_usd']<d['cost_usd']
    assert 'digitalWrite(relayPin, LOW)' in d['firmware']

def test_distinct_design_profiles():
    greenhouse=generate('build a greenhouse irrigation controller with 4 soil sensors')
    tank=generate('build a rain tank system with 3 valves and no pressure sensor')
    assert greenhouse['options']['profile']=='greenhouse'
    assert greenhouse['options']['soil_count']==4
    assert greenhouse['options']['weather']
    assert tank['options']['tank']
    assert tank['options']['valves']==3
    assert tank['options']['pressure'] is False
    assert greenhouse['cost_usd'] != tank['cost_usd']

def test_api_end_to_end(client):
    assert client.get('/health').json()['status']=='ok'
    all_regions=client.get('/api/v1/regions').json()['regions']
    assert len(all_regions)==71
    assert sum(r['country_id']==1 for r in all_regions)==24
    assert sum(r['country_id']==2 for r in all_regions)==47
    for name in ['overview','weather','water-network','energy']:
        assert client.get('/api/v1/regions/1/'+name).status_code==200
    for name in ['predictions/water-demand','predictions/solar','recommendations/irrigation']:
        assert client.post('/api/v1/'+name,json={'area_ha':5}).json()['water_m3']>0
    result=client.post('/api/v1/simulations/scenario',json={'scenario':'leak','intervention':True})
    assert result.status_code==201
    assert client.get('/api/v1/simulations/'+str(result.json()['id'])).status_code==200
    assert client.get('/api/v1/alerts').json()[0]['is_simulated']
    p=client.post('/api/v1/aiot/projects',json={'text':'solar irrigation','region_id':1}).json()
    pid=p['id'];base=f'/api/v1/aiot/projects/{pid}'
    edited=client.post(base+'/messages',json={'text':'Add another soil-moisture sensor'}).json()
    assert len(edited['versions'])==2
    assert edited['design']['options']['soil_count']==3
    assert not client.post(base+'/validate',json={'supply_v':5,'soil_count':3}).json()['valid']
    assert client.post(base+'/deploy').status_code==200
    assert any(d['id']==pid for d in client.get('/api/v1/regions/1/overview').json()['devices'])
    # Edits revoke the old deployment until the new version is revalidated.
    client.post(base+'/messages',json={'text':'8 soil sensors'})
    assert client.post(base+'/deploy').status_code==422
    client.post(base+'/messages',json={'text':'Replace incompatible components'})
    assert client.post(base+'/deploy').status_code==200
    export=client.get(base+'/export?language=ja')
    assert export.status_code==200
    with zipfile.ZipFile(io.BytesIO(export.content)) as z:
        assert set(z.namelist())=={'design.json','bom.csv','starter.ino','assembly.txt','connections.csv'}
        assert '技術提案' in z.read('assembly.txt').decode()
        assert json.loads(z.read('design.json'))['id']==pid

@pytest.mark.parametrize('payload',[{'area_ha':0},{'efficiency':0},{'crop':'unknown'},{'head_m':-1},{'unexpected':1}])
def test_input_validation(client,payload):
    r=client.post('/api/v1/recommendations/irrigation',json=payload)
    assert r.status_code==422 and r.json()['error']['code']=='invalidInput'

def test_error_and_cors(client):
    assert client.get('/api/v1/regions/999/overview').status_code==404
    assert client.get('/api/v1/aiot/projects/999').status_code==404
    r=client.options('/api/v1/regions',headers={'Origin':'https://untrusted.example','Access-Control-Request-Method':'GET'})
    assert r.status_code==400

def test_version_export_and_csv(client):
    import csv
    p=client.post('/api/v1/aiot/projects',json={'text':'solar irrigation'}).json()
    base=f"/api/v1/aiot/projects/{p['id']}"
    client.post(base+'/messages',json={'text':'replace Wi-Fi with LoRa'})
    with zipfile.ZipFile(io.BytesIO(client.get(base+'/export?version=1').content)) as z:
        d=json.loads(z.read('design.json'))
        assert d['exported_version']==1 and not d['design']['options']['lora']
    with zipfile.ZipFile(io.BytesIO(client.get(base+'/export?version=2').content)) as z:
        rows=list(csv.reader(io.StringIO(z.read('connections.csv').decode())))
        assert all(len(row)==3 for row in rows)
        assert any('SPI' in row[2] for row in rows)
    assert client.get(base+'/export?version=999').status_code==404

def test_postgres_schema_compiles():
    from sqlalchemy.schema import CreateTable
    from sqlalchemy.dialects import postgresql
    from backend.app.db import metadata
    schema='\n'.join(str(CreateTable(table).compile(dialect=postgresql.dialect())) for table in metadata.sorted_tables)
    assert 'JSONB' in schema and 'FOREIGN KEY' in schema

def test_weather_fallback_and_cache(monkeypatch):
    from backend.app.db import REGIONS
    import httpx
    def failure(*a,**k): raise httpx.ConnectError('offline')
    monkeypatch.setattr(integrations.httpx,'get',failure)
    r=integrations.weather(REGIONS[0],True)
    assert r['is_simulated'] and r['fallback_reason']=='weatherUnavailable'
    calls=[]
    class Response:
        def raise_for_status(self): pass
        def json(self):
            return {'daily':{'time':['2026-01-01'],'et0_fao_evapotranspiration':[3],'temperature_2m_max':[20],'precipitation_sum':[2],'shortwave_radiation_sum':[14],'relative_humidity_2m_mean':[60],'wind_speed_10m_max':[10]}}
    def success(*a,**k): calls.append(1);return Response()
    monkeypatch.setattr(integrations.httpx,'get',success)
    assert integrations.weather(REGIONS[0],True)['kind']=='forecast'
    integrations.weather(REGIONS[0],True)
    assert len(calls)==1

def test_translation_parity():
    root=Path(__file__).resolve().parents[2]/'frontend/src/i18n'
    dictionaries=[json.loads((root/f'{lang}.json').read_text(encoding='utf-8')) for lang in ['en','fr','ja','ar']]
    def shape(value):
        if isinstance(value, dict):
            return {key: shape(child) for key, child in value.items()}
        if isinstance(value, list):
            assert value
            return [shape(child) for child in value]
        assert isinstance(value, str) and value.strip()
        return 'text'
    assert shape(dictionaries[0])==shape(dictionaries[1])==shape(dictionaries[2])
    sections={'overview','comparison','twin','agriculture','water','energy','simulator','insights','security','studio','settings'}
    for dictionary in dictionaries:
        assert set(dictionary['guides'])==sections
        for guide in dictionary['guides'].values():
            assert set(guide)=={'purpose','inputs','steps','results','beginner','professional'}
            assert len(guide['steps'])>=3

@pytest.mark.parametrize('prompt',['robot','solar robot','robot\nWi-Fi','drone','ロボット','ドローン','make a pizza','   '])
def test_unsupported_studio_has_no_side_effects(client, monkeypatch, prompt):
    from sqlalchemy import select, func
    from backend.app import db, studio
    # Unsupported requests must never reach the optional provider either.
    monkeypatch.setattr(studio, 'generate_with_provider', lambda *args: None)
    created=client.post('/api/v1/aiot/projects',json={'text':'solar irrigation'}).json()
    base=f"/api/v1/aiot/projects/{created['id']}"
    client.post(base+'/deploy')
    before=client.get(base).json()
    def counts():
        with db.engine.connect() as c:
            return [c.scalar(select(func.count()).select_from(table)) for table in [db.projects,db.versions,db.messages,db.connections]]
    original_counts=counts()
    def unexpected(*args): raise AssertionError('Unsupported prompt reached provider')
    monkeypatch.setattr(studio, 'generate_with_provider', unexpected)
    for endpoint,payload in [('/api/v1/aiot/projects',{'text':prompt,'preferences':['Wi-Fi','solar']}),(base+'/messages',{'text':prompt})]:
        response=client.post(endpoint,json=payload)
        assert response.status_code==422
        assert response.json()=={'error':{'code':'unsupportedRequest'}}
        assert counts()==original_counts
    assert client.get(base).json()==before

@pytest.mark.parametrize('language',['en','fr','ja','ar'])
def test_studio_translated_examples_and_edits(client, monkeypatch, language):
    from backend.app import studio
    monkeypatch.setattr(studio, 'generate_with_provider', lambda *args: None)
    path=Path(__file__).resolve().parents[2]/f'frontend/src/i18n/{language}.json'
    translations=json.loads(path.read_text(encoding='utf-8'))
    result=client.post('/api/v1/aiot/projects',json={'text':translations['promptExample'],'language':language,'preferences':['Wi-Fi']})
    assert result.status_code==201
    pid=result.json()['id']
    for key in ['addSensor','useLora','reduceCost','addSolar','repair','explain']:
        response=client.post(f'/api/v1/aiot/projects/{pid}/messages',json={'text':translations[key],'language':language})
        assert response.status_code==200, (language,key,response.text)
    assert len(response.json()['versions'])==7

def test_greenhouse_crop_profiles_and_zones():
    tomato=generate('Design a 1000 m2 tomato greenhouse with 4 climate zones')
    lettuce=generate('Design a 500 m2 lettuce greenhouse with 2 climate zones')

    assert tomato['greenhouse']['crop']=='tomato'
    assert tomato['greenhouse']['zones']==4
    assert tomato['greenhouse']['soil_sensors']==8
    assert tomato['greenhouse']['setpoints']['temperature_c']==[18,28]
    assert len(tomato['greenhouse']['zone_list'])==4

    assert lettuce['greenhouse']['crop']=='lettuce'
    assert lettuce['greenhouse']['zones']==2
    assert lettuce['greenhouse']['soil_sensors']==4
    assert lettuce['greenhouse']['setpoints']['temperature_c']==[16,22]

    component_keys={p['key'] for p in tomato['bom']}
    assert {'soil_mux','ph','ec','vent','misting','shade'} <= component_keys

def mock_studio_ai(monkeypatch, result):
    import httpx
    from backend.app import studio
    monkeypatch.setenv('STUDIO_AI_BASE_URL','http://127.0.0.1:11434/v1')
    monkeypatch.setenv('STUDIO_AI_MODEL','qwen3:4b-instruct')
    requests=[]
    def respond(url, **kwargs):
        requests.append(kwargs)
        return httpx.Response(200,json={'choices':[{'message':{'content':json.dumps(result)}}]},request=httpx.Request('POST',url))
    monkeypatch.setattr(studio.httpx,'post',respond)
    return requests

def test_ai_interprets_options_without_keyword_overrides(monkeypatch):
    requests=mock_studio_ai(monkeypatch,{'supported':True,'action':'design','changes':{'solar':True,'lora':True}})
    d=generate('My field has no Wi-Fi and I want solar power')
    assert d['generation_source']=='provider'
    assert d['options']['lora'] and d['options']['solar']
    assert {'solar','charger','battery','lora'} <= {part['key'] for part in d['bom']}
    assert 'digitalWrite(relayPin, LOW)' in d['firmware']
    assert requests[0]['json']['response_format']['type']=='json_schema'
    assert requests[0]['timeout'].read==90
    assert 'Authorization' not in requests[0]['headers']  # Local Ollama needs no key.

def test_ai_edit_preserves_context_and_increments_once(monkeypatch):
    d=generate('solar irrigation')
    requests=mock_studio_ai(monkeypatch,{'supported':True,'action':'design','changes':{'soil_count':3}})
    updated=generate('Add another soil sensor',d)
    assert updated['options']['soil_count']==3
    assert updated['options']['solar'] and d['options']['soil_count']==2
    context=json.loads(requests[0]['json']['messages'][1]['content'])
    assert context['is_edit'] and context['current_options']['solar']
    mock_studio_ai(monkeypatch,{'supported':True,'action':'design','changes':{'solar':False}})
    assert generate('I do not want solar power',updated)['options']['solar'] is False

def test_ai_paraphrase_and_greenhouse_share_catalogue_builder(monkeypatch):
    mock_studio_ai(monkeypatch,{'supported':True,'action':'design','changes':{'lora':True}})
    assert generate('Keep the roots damp far from any router')['options']['lora']
    mock_studio_ai(monkeypatch,{'supported':True,'action':'design','changes':{
        'profile':'greenhouse','crop':'lettuce','zones':2,'area_m2':500,'soil_count':4}})
    d=generate('Une serre de laitue de 500 m² avec deux zones')
    assert d['greenhouse']['crop']=='lettuce' and d['greenhouse']['zones']==2
    assert d['greenhouse']['soil_sensors']==4
    assert {'humidity','co2','fan','ph','ec'} <= {part['key'] for part in d['bom']}

@pytest.mark.parametrize('changes',[
    {'solar':'false'},{'soil_count':0},{'soil_count':25},{'soil_count':True},
    {'profile':'robot'},{'supply_v':48},{'firmware':'run anything'},{'zones':13},
])
def test_ai_rejects_invalid_model_output(monkeypatch, changes):
    from backend.app.studio import ProviderUnavailable
    mock_studio_ai(monkeypatch,{'supported':True,'action':'design','changes':changes})
    with pytest.raises(ProviderUnavailable): generate('solar irrigation')

def test_ai_failures_and_semantic_rejection_do_not_save(client,monkeypatch):
    from backend.app import studio, db
    from sqlalchemy import select, func
    import httpx
    created=client.post('/api/v1/aiot/projects',json={'text':'solar irrigation'}).json()
    base=f"/api/v1/aiot/projects/{created['id']}"
    client.post(base+'/deploy')
    before=client.get(base).json()
    def counts():
        with db.engine.connect() as c:
            return [c.scalar(select(func.count()).select_from(table)) for table in [db.projects,db.versions,db.messages,db.connections]]
    original_counts=counts()
    mock_studio_ai(monkeypatch,{'supported':False,'action':'design','changes':{}})
    for endpoint,payload in [('/api/v1/aiot/projects',{'text':'design a spaceship','preferences':['solar','Wi-Fi']}),(base+'/messages',{'text':'design a spaceship'})]:
        r=client.post(endpoint,json=payload)
        assert r.status_code==422 and r.json()=={'error':{'code':'unsupportedRequest'}}
        assert counts()==original_counts
    def timeout(*a,**k): raise httpx.ReadTimeout('private provider details')
    monkeypatch.setattr(studio.httpx,'post',timeout)
    for endpoint in ['/api/v1/aiot/projects',base+'/messages']:
        r=client.post(endpoint,json={'text':'solar irrigation'})
        assert r.status_code==503 and r.json()=={'error':{'code':'studioAiUnavailable'}}
        assert counts()==original_counts
    assert client.get(base).json()==before

def test_ai_prohibited_requests_never_call_provider(monkeypatch):
    from backend.app.studio import UnsupportedRequest
    requests=mock_studio_ai(monkeypatch,{'supported':True,'action':'design','changes':{}})
    for text in ['robot','solar drone','ロボット','make a pizza','   ']:
        with pytest.raises(UnsupportedRequest): generate(text,preferences=['solar'])
    assert not requests

def test_ai_partial_config_is_not_silent_fallback(monkeypatch):
    from backend.app.studio import ProviderUnavailable
    monkeypatch.setenv('STUDIO_AI_MODEL','qwen3:4b-instruct')
    with pytest.raises(ProviderUnavailable): generate('solar irrigation')

def test_ai_project_export_and_original_intent(client,monkeypatch):
    requests=mock_studio_ai(monkeypatch,{'supported':True,'action':'design','changes':{'solar':True,'lora':True}})
    r=client.post('/api/v1/aiot/projects',json={'text':'My field has no Wi-Fi and I want solar power','preferences':['Wi-Fi']})
    assert r.status_code==201
    context=json.loads(requests[0]['json']['messages'][1]['content'])
    assert context['original_request']=='my field has no wi-fi and i want solar power'
    assert context['planning_preferences']==['Wi-Fi']
    project=r.json()
    with zipfile.ZipFile(io.BytesIO(client.get(f"/api/v1/aiot/projects/{project['id']}/export").content)) as z:
        d=json.loads(z.read('design.json'))['design']
        assert d['generation_source']=='provider' and d['options']['lora']
        assert 'solar' in z.read('bom.csv').decode()

def test_ai_status_reports_actual_model_availability(client,monkeypatch):
    from backend.app import studio
    import httpx
    assert client.get('/api/v1/aiot/provider').json()=={'configured':False,'available':False,'model':''}
    mock_studio_ai(monkeypatch,{'supported':True,'action':'design','changes':{}})
    monkeypatch.setattr(studio.httpx,'get',lambda url,**kw: httpx.Response(200,json={'data':[{'id':'qwen3:4b-instruct'}]},request=httpx.Request('GET',url)))
    assert client.get('/api/v1/aiot/provider').json()['available']

def test_account_signup_login_profile_and_password(client):
    created=client.post('/api/v1/auth/signup',json={'email':'Farmer@Example.com','password':'secret123','full_name':'Amina Farmer'})
    assert created.status_code==201
    token=created.json()['token']
    assert created.json()['user']['email']=='farmer@example.com'
    assert set(created.json()['user'])=={'id','email','full_name','created_at'}  # Never expose the password hash.
    assert client.post('/api/v1/auth/signup',json={'email':'farmer@example.com','password':'secret123','full_name':'Dup'}).status_code==409
    assert client.post('/api/v1/auth/login',json={'email':'farmer@example.com','password':'wrong'}).status_code==401
    headers={'Authorization':'Bearer '+token}
    assert client.get('/api/v1/auth/me').status_code==401
    assert client.get('/api/v1/auth/me',headers={'Authorization':'Bearer invalid'}).status_code==401
    assert client.get('/api/v1/auth/me',headers=headers).json()['full_name']=='Amina Farmer'
    assert client.post('/api/v1/auth/profile',json={'email':'amina@example.com','full_name':'Amina B'},headers=headers).json()['email']=='amina@example.com'
    assert client.post('/api/v1/auth/password',json={'current_password':'wrong','new_password':'longenough'},headers=headers).status_code==401
    assert client.post('/api/v1/auth/password',json={'current_password':'secret123','new_password':'longenough'},headers=headers).status_code==200
    assert client.post('/api/v1/auth/login',json={'email':'amina@example.com','password':'longenough'}).status_code==200
    assert client.post('/api/v1/auth/signup',json={'email':'not-an-email','password':'short','full_name':'x'}).status_code==422
