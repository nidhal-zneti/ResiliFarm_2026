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

@pytest.fixture
def review_case(client, monkeypatch, tmp_path):
    from sqlalchemy import create_engine
    from backend.app import auth, db, main
    engine=create_engine('sqlite:///'+str(tmp_path/'reviews.db'),connect_args={'check_same_thread':False})
    monkeypatch.setattr(db,'engine',engine)
    db.initialize()
    with engine.begin() as c:
        ids=[]
        for name,role in [('farmer','FARMER'),('author','AGRONOMIST'),('colleague','AGRONOMIST'),('admin','ADMIN')]:
            ids.append(c.execute(db.users.insert().values(email=f'{name}@reviews.test',full_name=name,password_hash='unused',role=role)).inserted_primary_key[0])
        owner,author,colleague,admin=ids
        zone=c.execute(db.zones.insert().values(region_id=1,name='Review test zone')).inserted_primary_key[0]
        farm=c.execute(db.farms.insert().values(zone_id=zone,name='Review test farm',owner_id=owner)).inserted_primary_key[0]
        other_farm=c.execute(db.farms.insert().values(zone_id=zone,name='Other review farm',owner_id=owner)).inserted_primary_key[0]
        for agronomist in [author,colleague]:
            c.execute(db.agronomist_farmer_assignments.insert().values(agronomist_id=agronomist,farmer_id=owner))
    actor={'id':author,'role':'AGRONOMIST'}
    app.dependency_overrides[auth.current_user]=lambda:actor
    monkeypatch.setattr(main,'weather',lambda *args,**kwargs:{'current':{'temperature_2m':20},'days':[]})
    base=f'/api/v1/farms/{farm}/recommendation/review'
    def history():
        response=client.get(f'/api/v1/agronomist/dashboard?farmer_id={owner}')
        assert response.status_code==200
        return next(item for item in response.json()['farms'] if item['id']==farm)
    try:
        yield client,actor,ids,farm,other_farm,base,history
    finally:
        app.dependency_overrides.pop(auth.current_user,None)
        engine.dispose()


def test_review_edit_delete_persistence(review_case):
    from sqlalchemy import select
    from backend.app import db
    client,actor,ids,farm,other_farm,base,history=review_case
    for note in ['First review','Second review']:
        assert client.post(base,json={'status':'validated','note':note}).status_code==200
    before=history()
    latest=before['reviews'][0]
    assert latest['can_manage'] is True
    path=f'{base}s/{latest["id"]}'
    assert client.patch(path,json={'status':'modified','note':'Updated irrigation advice'}).status_code==200
    updated=history()
    assert len(updated['reviews'])==2
    assert updated['review']['note']=='Updated irrigation advice'
    assert updated['review']['status']=='modified'
    assert updated['review']['created_at']==latest['created_at']
    assert updated['review']['reviewed_by']==latest['reviewed_by']
    assert client.delete(path).status_code==200
    remaining=history()
    assert len(remaining['reviews'])==1
    assert remaining['review']['note']=='First review'
    assert client.delete(path).status_code==404
    assert client.patch(path,json={'status':'rejected'}).status_code==404
    assert client.delete(f'{base}s/{remaining["review"]["id"]}').status_code==200
    assert history()['review'] is None
    assert history()['reviews']==[]
    with db.engine.connect() as c:
        assert not c.execute(select(db.records['irrigation_recommendations'])).first()


@pytest.mark.parametrize('method',['patch','delete'])
def test_review_mutation_permissions_and_scope(review_case,method):
    from sqlalchemy import select
    from backend.app import auth, db
    client,actor,ids,farm,other_farm,base,history=review_case
    owner,author,colleague,admin=ids
    assert client.post(base,json={'status':'validated','note':'Original'}).status_code==200
    review=history()['review']
    path=f'{base}s/{review["id"]}'
    def mutate(target=path):
        return getattr(client,method)(target,**({'json':{'status':'rejected','note':'Changed'}} if method=='patch' else {}))
    actor.update(id=owner,role='FARMER')
    assert mutate().status_code==403
    actor.update(id=colleague,role='AGRONOMIST')
    assert history()['review']['can_manage'] is False
    assert mutate().status_code==403
    actor.update(id=author)
    assert mutate(f'/api/v1/farms/{other_farm}/recommendation/reviews/{review["id"]}').status_code==404
    invalid_record=db.save_record('irrigation_recommendations',1,{'farm_id':farm,'reviewed_by':author},source='user-input',simulated=False)
    assert mutate(f'{base}s/{invalid_record}').status_code==404
    simulated=db.save_record('irrigation_recommendations',1,{'farm_id':farm,'reviewed_by':author},source='agronomist-review',simulated=True)
    assert mutate(f'{base}s/{simulated}').status_code==404
    with db.engine.begin() as c:
        c.execute(db.agronomist_farmer_assignments.delete().where(db.agronomist_farmer_assignments.c.agronomist_id==author))
    assert mutate().status_code==404
    with db.engine.connect() as c:
        records=db.records['irrigation_recommendations']
        assert c.execute(select(records.c.payload).where(records.c.id==review['id'])).scalar_one()['note']=='Original'
    app.dependency_overrides.pop(auth.current_user)
    assert mutate().status_code==401
    app.dependency_overrides[auth.current_user]=lambda:actor
    actor.update(id=admin,role='ADMIN')
    assert history()['review']['can_manage'] is True
    assert mutate().status_code==200


@pytest.mark.parametrize('payload',[{'status':'unknown'},{'status':'validated','note':'x'*501}])
def test_review_input_limits(review_case,payload):
    client,actor,ids,farm,other_farm,base,history=review_case
    assert client.post(base,json={'status':'validated'}).status_code==200
    review_id=history()['review']['id']
    assert client.post(base,json=payload).status_code==422
    assert client.patch(f'{base}s/{review_id}',json=payload).status_code==422
    assert len(history()['reviews'])==1
    assert history()['review']['status']=='validated'

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

def test_api_end_to_end(client,monkeypatch):
    from backend.app import main
    assert client.get('/health').json()['status']=='ok'
    all_regions=client.get('/api/v1/regions').json()['regions']
    assert len(all_regions)==71
    assert sum(r['country_id']==1 for r in all_regions)==24
    assert sum(r['country_id']==2 for r in all_regions)==47
    fake_weather={'source':'Open-Meteo test response','kind':'current_model','is_simulated':False,
                  'is_measured':False,'updated_at':'2026-01-01T12:00','coverage':{},
                  'current':{'temperature_2m':20},'days':[],'units':{}}
    monkeypatch.setattr(main,'weather',lambda *args,**kwargs: fake_weather)
    for name in ['overview','weather']:
        assert client.get('/api/v1/regions/1/'+name).status_code==200
    for name in ['water-network','energy']:
        assert client.get('/api/v1/regions/1/'+name).status_code==503
    for name in ['predictions/water-demand','predictions/solar','recommendations/irrigation']:
        assert client.post('/api/v1/'+name,json=FarmInput().model_dump()).json()['water_m3']>0
    result=client.post('/api/v1/simulations/scenario',json={'scenario':'leak','intervention':True})
    assert result.status_code==503
    assert client.get('/api/v1/alerts').json()==[]
    p=client.post('/api/v1/aiot/projects',json={'text':'solar irrigation','region_id':1}).json()
    pid=p['id'];base=f'/api/v1/aiot/projects/{pid}'
    edited=client.post(base+'/messages',json={'text':'Add another soil-moisture sensor'}).json()
    assert len(edited['versions'])==2
    assert edited['design']['options']['soil_count']==3
    assert not client.post(base+'/validate',json={'supply_v':5,'soil_count':3}).json()['valid']
    assert client.post(base+'/deploy').status_code==503
    assert client.get('/api/v1/regions/1/overview').json()['devices']==[]
    # Physical deployment remains blocked until a hardware connector exists.
    client.post(base+'/messages',json={'text':'8 soil sensors'})
    assert client.post(base+'/deploy').status_code==503
    client.post(base+'/messages',json={'text':'Replace incompatible components'})
    assert client.post(base+'/deploy').status_code==503
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
    from backend.app.integrations import WeatherUnavailable
    import httpx
    integrations._cache.pop(REGIONS[0]['id'], None)

    def failure(*args, **kwargs):
        raise httpx.ConnectError('offline')

    monkeypatch.setattr(integrations, '_fetch', failure)
    with pytest.raises(WeatherUnavailable):
        integrations.weather(REGIONS[0], True)

    payload = {
        'current': {
            'time': '2026-01-01T12:00', 'temperature_2m': 20, 'relative_humidity_2m': 60,
            'precipitation': 0, 'rain': 0, 'weather_code': 1, 'wind_speed_10m': 10,
            'wind_direction_10m': 180, 'wind_gusts_10m': 12, 'shortwave_radiation': 400,
            'interval': 900,
        },
        'daily': {
            'time': ['2026-01-01'], 'et0_fao_evapotranspiration': [3],
            'temperature_2m_max': [20], 'precipitation_sum': [2],
            'shortwave_radiation_sum': [14], 'relative_humidity_2m_mean': [60],
            'wind_speed_10m_max': [10],
        },
    }
    calls = []

    def success(*args, **kwargs):
        calls.append(1)
        return httpx.Response(
            200, json=payload,
            request=httpx.Request('GET', 'https://api.open-meteo.com/v1/forecast'),
        )

    monkeypatch.setattr(integrations, '_fetch', success)
    assert integrations.weather(REGIONS[0], True)['kind'] == 'current_model'
    integrations.weather(REGIONS[0], True)
    assert len(calls) == 1

@pytest.mark.parametrize('currency',['TND','JPY',None])
def test_export_uses_minimum_local_prices(client,monkeypatch,currency):
    import csv
    from backend.app import main
    design=generate('irrigation with 2 soil sensors')
    design['material_estimate']={'currency':currency,'items':[
        {'key':'controller','currency':currency,'unit_price':100,'unit_price_low':80,'unit_price_high':120},
        {'key':'soil_sensor','currency':currency,'unit_price':40,'unit_price_low':30,'unit_price_high':50},
    ]}
    monkeypatch.setattr(main,'project',lambda pid:{'id':pid,'design':design})
    response=client.get('/api/v1/aiot/projects/999/export')
    assert response.status_code==200
    with zipfile.ZipFile(io.BytesIO(response.content)) as z:
        content=z.read('bom.csv').decode()
        assert 'USD' not in content and '$' not in content
        rows={row['component']:row for row in csv.DictReader(io.StringIO(content))}
        assert rows['relay']['price_status']=='unavailable'
        assert rows['relay']['minimum_line_estimate']==''
        if currency:
            assert rows['esp32']['currency']==currency
            assert rows['esp32']['minimum_unit_estimate']=='80'
            assert rows['esp32']['minimum_line_estimate']=='80.00'
            assert float(rows['soil']['minimum_line_estimate'])==30*float(rows['soil']['quantity'])
        else:
            assert all(row['price_status']=='unavailable' for row in rows.values())


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
    sections={'overview','twin','agriculture','water','simulator','fruitRipeness','studio','settings'}
    for dictionary in dictionaries:
        assert set(dictionary['guides'])==sections
        for guide in dictionary['guides'].values():
            assert set(guide)=={'purpose','inputs','steps','results','beginner','professional'}
            assert len(guide['steps'])>=2

def test_fruitvision_endpoints_are_authenticated_and_fail_closed(client, monkeypatch):
    from backend.app import fruitvision
    assert client.get('/api/v1/fruit/status').status_code == 401
    signup = client.post('/api/v1/auth/signup', json={
        'email': 'fruit-check@example.com', 'password': 'test-password-123', 'full_name': 'Fruit Check'
    })
    assert signup.status_code == 201
    headers = {'Authorization': 'Bearer ' + signup.json()['token']}
    monkeypatch.setattr(fruitvision, 'available_fruits', lambda: [])
    def unavailable(*_):
        raise fruitvision.FruitModelUnavailable()
    monkeypatch.setattr(fruitvision, 'predict', unavailable)
    status = client.get('/api/v1/fruit/status', headers=headers)
    assert status.json()['available_fruits'] == []
    assert status.json()['stores_images'] is False
    from PIL import Image
    import io
    image_buffer = io.BytesIO()
    Image.new('RGB', (2, 2), 'red').save(image_buffer, format='PNG')
    image = image_buffer.getvalue()
    response = client.post('/api/v1/fruit/analyze', headers=headers,
                           data={'fruit': 'apple'},
                           files={'image': ('apple.png', image, 'image/png')})
    assert response.status_code == 503
    assert response.json()['error']['code'] == 'fruitModelUnavailable'
    assert client.get('/api/v1/fruit/results', headers=headers).json() == []

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

def test_ai_edit_enforces_explicit_one_more_sensor_if_model_misses_it(monkeypatch):
    d=generate('solar irrigation')
    mock_studio_ai(monkeypatch,{'supported':True,'action':'explain','changes':{}})
    updated=generate('Add exactly one more soil sensor; keep everything else unchanged.',d)
    assert updated['options']['soil_count']==d['options']['soil_count']+1
    assert updated['options']['solar']==d['options']['solar']
    assert updated['options']['lora']==d['options']['lora']

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
    signup = client.post('/api/v1/auth/signup', json={
        'email': 'Farmer@Example.com', 'password': 'secret123', 'full_name': 'Amina Farmer',
    })
    assert signup.status_code == 201
    assert signup.json()['user']['email'] == 'farmer@example.com'
    assert signup.json()['user']['role'] == 'FARMER'
    assert client.get('/api/v1/auth/me', headers={
        'Authorization': 'Bearer ' + signup.json()['token'],
    }).json()['id'] == signup.json()['user']['id']
    duplicate = client.post('/api/v1/auth/signup', json={
        'email': 'farmer@example.com', 'password': 'secret123', 'full_name': 'Duplicate',
    })
    assert duplicate.status_code == 409
    assert duplicate.json()['error']['code'] == 'emailTaken'

    from backend.app import auth, db
    assert client.post('/api/v1/auth/login', json={
        'email': 'farmer@example.com', 'password': 'wrong',
    }).status_code == 401
    login = client.post('/api/v1/auth/login', json={
        'email': 'Farmer@Example.com', 'password': 'secret123',
    })
    assert login.status_code == 200
    token = login.json()['token']
    user = login.json()['user']
    assert user['email'] == 'farmer@example.com'
    assert set(user) == {'id', 'email', 'full_name', 'phone', 'is_active', 'role', 'created_at'}
    headers = {'Authorization': 'Bearer ' + token}
    assert client.get('/api/v1/auth/me').status_code == 401
    assert client.get('/api/v1/auth/me', headers={'Authorization': 'Bearer invalid'}).status_code == 401
    assert client.get('/api/v1/auth/me', headers=headers).json()['full_name'] == 'Amina Farmer'
    assert client.post('/api/v1/auth/profile', json={
        'email': 'amina@example.com', 'full_name': 'Amina B',
    }, headers=headers).json()['email'] == 'amina@example.com'
    assert client.post('/api/v1/auth/password', json={
        'current_password': 'wrong', 'new_password': 'longenough',
    }, headers=headers).status_code == 401
    assert client.post('/api/v1/auth/password', json={
        'current_password': 'secret123', 'new_password': 'longenough',
    }, headers=headers).status_code == 200
    assert client.post('/api/v1/auth/login', json={
        'email': 'amina@example.com', 'password': 'longenough',
    }).status_code == 200
    assert client.post('/api/v1/auth/signup', json={
        'email': 'not-an-email', 'password': 'short', 'full_name': 'x',
    }).status_code == 422
