import csv
import io
import json
import os
import zipfile
from contextlib import asynccontextmanager
from fastapi import Depends, FastAPI, HTTPException, Query
from fastapi.responses import Response, JSONResponse
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import select, func
from sqlalchemy.exc import IntegrityError
from . import auth, db
from .schemas import FarmInput, ScenarioInput, MessageInput, ProjectInput, TelemetryInput, ValidateInput, SignupInput, LoginInput, ProfileInput, PasswordInput, RoleInput, AssignmentInput, ReviewInput
from .services import irrigation, anomalies
from .integrations import weather, WeatherUnavailable
from .studio import CATALOG, generate, validate, UnsupportedRequest, ProviderUnavailable, provider_status

@asynccontextmanager
async def lifespan(app):
    db.initialize()
    with db.engine.begin() as c:
        if not c.execute(select(db.components.c.id)).first():
            c.execute(db.components.insert(),[{'key':k,'specification':v} for k,v in CATALOG.items()])
    yield

app=FastAPI(title='ResiliFarm AI',version='1.0.0',lifespan=lifespan)
app.add_middleware(CORSMiddleware,allow_origins=os.getenv('CORS_ORIGINS','http://localhost:5173,http://127.0.0.1:5173').split(','),allow_methods=['GET','POST'],allow_headers=['Content-Type','Authorization'])

@app.exception_handler(RequestValidationError)
async def invalid(_, exc):
    return JSONResponse(status_code=422,content={'error':{'code':'invalidInput','fields':[{'field':'.'.join(map(str,e['loc'])),'type':e['type']} for e in exc.errors()]}})

@app.exception_handler(HTTPException)
async def http_error(_,exc): return JSONResponse(status_code=exc.status_code,content={'error':{'code':exc.detail}})

@app.exception_handler(UnsupportedRequest)
async def unsupported_request(_, exc):
    return JSONResponse(status_code=422,content={'error':{'code':'unsupportedRequest'}})

@app.exception_handler(ProviderUnavailable)
async def provider_unavailable(_, exc):
    return JSONResponse(status_code=503,content={'error':{'code':'studioAiUnavailable'}})

@app.exception_handler(WeatherUnavailable)
async def weather_unavailable(_, exc):
    return JSONResponse(status_code=503,content={'error':{'code':'weatherUnavailable'}})

@app.get('/api/v1/aiot/provider')
def studio_provider(): return provider_status()

def region(rid):
    with db.engine.connect() as c: r=c.execute(select(db.regions).where(db.regions.c.id==rid)).mappings().first()
    if not r: raise HTTPException(404,'regionNotFound')
    return dict(r)

@app.get('/health')
def health():
    with db.engine.connect() as c: c.execute(select(1))
    return {'status':'ok','database':db.engine.dialect.name}

@app.post('/api/v1/auth/signup',status_code=201)
def signup(x:SignupInput):
    email=x.email.strip().lower()
    role='ADMIN' if email in auth.admin_emails() else 'FARMER'
    with db.engine.begin() as c:
        if c.execute(select(db.users.c.id).where(db.users.c.email==email)).scalar_one_or_none(): raise HTTPException(409,'emailTaken')
        uid=c.execute(db.users.insert().values(email=email,full_name=x.full_name.strip(),password_hash=auth.hash_password(x.password),role=role)).inserted_primary_key[0]
        row=c.execute(select(db.users).where(db.users.c.id==uid)).mappings().first()
    return {'token':auth.create_token(uid),'user':auth.public_user(dict(row))}

@app.post('/api/v1/auth/login')
def login(x:LoginInput):
    with db.engine.connect() as c: row=c.execute(select(db.users).where(db.users.c.email==x.email.strip().lower())).mappings().first()
    if not row or not auth.verify_password(x.password,row['password_hash']): raise HTTPException(401,'invalidCredentials')
    return {'token':auth.create_token(row['id']),'user':auth.public_user(dict(row))}

@app.get('/api/v1/auth/me')
def me(user=Depends(auth.current_user)): return auth.public_user(user)

@app.post('/api/v1/auth/profile')
def save_profile(x:ProfileInput,user=Depends(auth.current_user)):
    email=x.email.strip().lower()
    with db.engine.begin() as c:
        if c.execute(select(db.users.c.id).where(db.users.c.email==email,db.users.c.id!=user['id'])).scalar_one_or_none(): raise HTTPException(409,'emailTaken')
        c.execute(db.users.update().where(db.users.c.id==user['id']).values(email=email,full_name=x.full_name.strip()))
        row=c.execute(select(db.users).where(db.users.c.id==user['id'])).mappings().first()
    return auth.public_user(dict(row))

@app.post('/api/v1/auth/password')
def change_password(x:PasswordInput,user=Depends(auth.current_user)):
    if not auth.verify_password(x.current_password,user['password_hash']): raise HTTPException(401,'invalidCredentials')
    with db.engine.begin() as c: c.execute(db.users.update().where(db.users.c.id==user['id']).values(password_hash=auth.hash_password(x.new_password)))
    return {'updated':True}

ROLES={'FARMER','AGRONOMIST','ADMIN'}
FIELD_CROPS=('olive','wheat','tomato')

def _number(value,fallback=0.0):
    try: return float(value)
    except (TypeError,ValueError): return fallback

def _visible_farms(c,user):
    cols=[db.farms.c.id,db.farms.c.name,db.zones.c.name.label('zone'),db.regions.c.id.label('region_id'),db.regions.c.name.label('region_name'),db.regions.c.lat.label('lat'),db.regions.c.lon.label('lon'),db.regions.c.climate.label('climate')]
    agronomist=(user.get('role') or 'FARMER')=='AGRONOMIST'
    base=db.farms.join(db.zones,db.farms.c.zone_id==db.zones.c.id).join(db.regions,db.zones.c.region_id==db.regions.c.id)
    if agronomist: base=base.join(db.farm_assignments,db.farms.c.id==db.farm_assignments.c.farm_id)
    stmt=select(*cols).select_from(base)
    if agronomist: stmt=stmt.where(db.farm_assignments.c.user_id==user['id'])
    return c.execute(stmt.order_by(db.farms.c.id)).mappings().all()

def _farm_fields(c,fid):
    stmt=select(db.fields.c.id,db.fields.c.name,db.fields.c.area_ha,db.fields.c.lat,db.fields.c.lon,db.crops.c.name.label('crop')).select_from(db.fields.join(db.crops,db.fields.c.crop_id==db.crops.c.id)).where(db.fields.c.farm_id==fid).order_by(db.fields.c.id)
    return c.execute(stmt).mappings().all()

def _simulated_sensors(w):
    # Deterministic values derived from the regional weather model; never claimed as measured.
    current=w.get('current') or {}
    days=w.get('days') or []
    day0=days[0] if days else {}
    temperature=_number(current.get('temperature_2m'))
    humidity=_number(current.get('relative_humidity_2m'))
    et0=_number(day0.get('et0_mm'))
    rain=_number(day0.get('rain_mm'))
    recent=sum(_number(day.get('rain_mm')) for day in days[:3])
    soil=min(100.0,max(0.0,25.0+recent*2.0))
    sensors={'soil_moisture_pct':round(soil,1),'temperature_c':round(temperature,1),'humidity_pct':round(humidity,1),'et0_mm':round(et0,2),'rain_mm':round(rain,2),'is_simulated':True}
    return sensors,et0,rain,temperature

def _farm_input(fields_rows,et0,rain):
    first=fields_rows[0] if fields_rows else {}
    area=_number(first.get('area_ha'),1.0)
    if not area>0: area=1.0
    crop=first.get('crop')
    if crop not in FIELD_CROPS: crop='olive'
    return FarmInput(area_ha=min(area,10000),crop=crop,et0=min(max(et0,0),30),rainfall=min(max(rain,0),500))

@app.get('/api/v1/users')
def list_users(user=Depends(auth.require_admin)):
    with db.engine.connect() as c:
        return [auth.public_user(dict(r)) for r in c.execute(select(db.users).order_by(db.users.c.id)).mappings()]

@app.post('/api/v1/users/{uid}/role')
def set_role(uid:int,x:RoleInput,user=Depends(auth.require_admin)):
    if x.role not in ROLES: raise HTTPException(422,'invalidRole')
    with db.engine.begin() as c:
        if not c.execute(select(db.users.c.id).where(db.users.c.id==uid)).scalar_one_or_none(): raise HTTPException(404,'userNotFound')
        c.execute(db.users.update().where(db.users.c.id==uid).values(role=x.role))
        row=c.execute(select(db.users).where(db.users.c.id==uid)).mappings().first()
    return auth.public_user(dict(row))

@app.get('/api/v1/farms')
def list_farms(user=Depends(auth.current_user)):
    with db.engine.connect() as c:
        return [{'id':r['id'],'name':r['name'],'region_id':r['region_id'],'region':r['region_name']} for r in _visible_farms(c,user)]

@app.get('/api/v1/farms/{fid}/agronomists')
def farm_agronomists(fid:int,user=Depends(auth.require_admin)):
    with db.engine.connect() as c:
        if not c.execute(select(db.farms.c.id).where(db.farms.c.id==fid)).scalar_one_or_none(): raise HTTPException(404,'farmNotFound')
        stmt=select(db.users).select_from(db.users.join(db.farm_assignments,db.users.c.id==db.farm_assignments.c.user_id)).where(db.farm_assignments.c.farm_id==fid).order_by(db.users.c.id)
        return [auth.public_user(dict(r)) for r in c.execute(stmt).mappings()]

@app.post('/api/v1/farms/{fid}/agronomists')
def assign_agronomist(fid:int,x:AssignmentInput,user=Depends(auth.require_admin)):
    with db.engine.begin() as c:
        if not c.execute(select(db.farms.c.id).where(db.farms.c.id==fid)).scalar_one_or_none(): raise HTTPException(404,'farmNotFound')
        assignee=c.execute(select(db.users).where(db.users.c.id==x.user_id)).mappings().first()
        if not assignee: raise HTTPException(404,'userNotFound')
        if (assignee.get('role') or 'FARMER')!='AGRONOMIST': raise HTTPException(422,'assigneeNotAgronomist')
        existing=c.execute(select(db.farm_assignments.c.id).where(db.farm_assignments.c.farm_id==fid,db.farm_assignments.c.user_id==x.user_id)).scalar_one_or_none()
        if not existing: c.execute(db.farm_assignments.insert().values(farm_id=fid,user_id=x.user_id))
    return {'assigned':True}

@app.post('/api/v1/farms/{fid}/agronomists/remove')
def remove_agronomist(fid:int,x:AssignmentInput,user=Depends(auth.require_admin)):
    with db.engine.begin() as c:
        c.execute(db.farm_assignments.delete().where(db.farm_assignments.c.farm_id==fid,db.farm_assignments.c.user_id==x.user_id))
    return {'removed':True}

@app.get('/api/v1/agronomist/dashboard')
def agronomist_dashboard(user=Depends(auth.require_roles('AGRONOMIST','ADMIN'))):
    with db.engine.connect() as c:
        output=[]
        for farm in _visible_farms(c,user):
            w=weather({'id':farm['region_id'],'lat':farm['lat'],'lon':farm['lon']},live=True)
            sensors,et0,rain,temperature=_simulated_sensors(w)
            fields_rows=_farm_fields(c,farm['id'])
            result=irrigation(_farm_input(fields_rows,et0,rain))
            fields=[{'id':f['id'],'name':f['name'],'area_ha':_number(f['area_ha']),'lat':_number(f['lat']),'lon':_number(f['lon']),'crop':f['crop'],'moisture_pct':sensors['soil_moisture_pct']} for f in fields_rows]
            water=result['water_m3']
            output.append({
                'id':farm['id'],'name':farm['name'],
                'region':{'id':farm['region_id'],'name':farm['region_name'],'lat':farm['lat'],'lon':farm['lon'],'climate':farm['climate']},
                'zone':farm['zone'],
                'fields':fields,
                'sensors':sensors,
                'analysis':{'stress':float(result['stress']),'action':result['action'],'heat_risk':round(min(100.0,max(0.0,(temperature-25.0)*8.0)),1),'drought_risk':round(min(100.0,max(0.0,(et0-rain)*12.0)),1)},
                'recommendation':{'action':result['action'],'water_m3':water,'net_mm':result['net_mm'],'gross_mm':result['gross_mm']},
                'stats':{'water_m3_day':water,'water_m3_7d':round(water*7,2),'pump_kwh_7d':round(result['pump_kwh']*7,2),'solar_kwh_7d':round(result['solar_kwh']*7,2)},
                'review':None,
            })
    return {'farms':output}

@app.post('/api/v1/farms/{fid}/recommendation/review')
def review_recommendation(fid:int,x:ReviewInput,user=Depends(auth.require_roles('AGRONOMIST','ADMIN'))):
    with db.engine.connect() as c:
        region_id=c.execute(select(db.zones.c.region_id).select_from(db.farms.join(db.zones,db.farms.c.zone_id==db.zones.c.id)).where(db.farms.c.id==fid)).scalar_one_or_none()
    if region_id is None: raise HTTPException(404,'farmNotFound')
    db.save_record('irrigation_recommendations',region_id,{'farm_id':fid,'status':x.status,'note':x.note,'reviewed_by':user['id']},source='agronomist-review',simulated=False)
    return {'status':x.status,'note':x.note,'reviewed_by':user['id']}

@app.get('/api/v1/regions')
def regions():
    with db.engine.connect() as c:
        return {'regions':[dict(r) for r in c.execute(select(db.regions).order_by(db.regions.c.country_id, db.regions.c.name)).mappings()], 'countries':[dict(r) for r in c.execute(select(db.countries)).mappings()]}
@app.get('/api/v1/regions/{rid}/weather')
def get_weather(rid:int, live:bool=True, historical:bool=False): return weather(region(rid),live,historical)

@app.get('/api/v1/regions/{rid}/overview')
def overview(rid:int):
    r=region(rid); w=weather(r,live=True)
    # A region is not a farm. Do not attach seeded fields, assumed irrigation
    # hardware, or calculated risks to live weather as if they were measured.
    return {'region':r,'weather':w,'calculation':None,'fields':[],'devices':[],
            'network':None,'risks':None,'is_simulated':False}

@app.get('/api/v1/regions/{rid}/water-network')
def get_network(rid:int, leak:float=Query(0,ge=0,le=.9), volume:float=Query(220,ge=0,le=100000000)):
    region(rid)
    raise HTTPException(503,'liveWaterTelemetryUnavailable')

@app.get('/api/v1/regions/{rid}/energy')
def energy(rid:int):
    region(rid)
    raise HTTPException(503,'liveEnergyTelemetryUnavailable')

@app.post('/api/v1/predictions/water-demand')
@app.post('/api/v1/predictions/solar')
@app.post('/api/v1/recommendations/irrigation')
def calculate(x:FarmInput):
    required=set(FarmInput.model_fields)
    if not required.issubset(x.model_fields_set): raise HTTPException(422,'farmInputsRequired')
    region(x.region_id); result=irrigation(x)
    db.save_record('irrigation_recommendations',x.region_id,{'input':x.model_dump(),'result':result},source='user-input-calculation',simulated=False)
    return result

@app.post('/api/v1/simulations/scenario',status_code=201)
def simulate(x:ScenarioInput):
    region(x.region_id)
    raise HTTPException(503,'liveTelemetryRequired')

@app.get('/api/v1/simulations/{sid}')
def get_simulation(sid:int):
    table=db.records['simulation_runs']
    with db.engine.connect() as c: r=c.execute(select(table).where(table.c.id==sid)).mappings().first()
    if not r: raise HTTPException(404,'simulationNotFound')
    return dict(r)

@app.get('/api/v1/alerts')
def alerts(region_id:int=1):
    region(region_id); t=db.records['alerts']
    with db.engine.connect() as c: return [dict(r) for r in c.execute(select(t).where(t.c.region_id==region_id,t.c.is_simulated==False).order_by(t.c.id.desc()).limit(30)).mappings()]

@app.post('/api/v1/security/analyze')
def analyze(x:TelemetryInput):
    if len({len(x.flow),len(x.pressure),len(x.moisture)})!=1: raise HTTPException(422,'lengthMismatch')
    return anomalies(x.flow,x.pressure,x.moisture)

@app.get('/api/v1/aiot/catalogue')
def catalogue(): return list(CATALOG.values())

def project(pid):
    with db.engine.connect() as c:
        p=c.execute(select(db.projects).where(db.projects.c.id==pid)).mappings().first()
        if not p: raise HTTPException(404,'projectNotFound')
        vs=[dict(v) for v in c.execute(select(db.versions).where(db.versions.c.project_id==pid).order_by(db.versions.c.version)).mappings()]
        ms=[dict(m) for m in c.execute(select(db.messages).where(db.messages.c.project_id==pid).order_by(db.messages.c.id)).mappings()]
    return {**dict(p),'versions':vs,'messages':ms,'design':vs[-1]['design']}

def save_version(c,pid,text,design,version):
    vid=c.execute(db.versions.insert().values(project_id=pid,version=version,design=design)).inserted_primary_key[0]
    c.execute(db.messages.insert(),[{'project_id':pid,'role':'user','text':text},{'project_id':pid,'role':'assistant','text':design['response']}])
    c.execute(db.connections.insert(),[{'version_id':vid,**{k:w[k] for k in ['source','target','signal']}} for w in design['connections']])

@app.get('/api/v1/aiot/projects')
def list_projects():
    with db.engine.connect() as c: return [dict(r) for r in c.execute(select(db.projects).order_by(db.projects.c.id.desc())).mappings()]

@app.post('/api/v1/aiot/projects',status_code=201)
def create_project(x:ProjectInput):
    region(x.region_id)
    design=generate(x.text,preferences=x.preferences)
    with db.engine.begin() as c:
        pid=c.execute(db.projects.insert().values(region_id=x.region_id,name=x.name)).inserted_primary_key[0]
        save_version(c,pid,x.text,design,1)
    return project(pid)

@app.get('/api/v1/aiot/projects/{pid}')
def get_project(pid:int): return project(pid)

@app.post('/api/v1/aiot/projects/{pid}/messages')
def message(pid:int,x:MessageInput):
    p=project(pid); design=generate(x.text,p['design'])
    try:
        with db.engine.begin() as c:
            save_version(c,pid,x.text,design,p['versions'][-1]['version']+1)
            c.execute(db.projects.update().where(db.projects.c.id==pid).values(deployed=False))
    except IntegrityError: raise HTTPException(409,'versionConflict')
    return project(pid)

@app.post('/api/v1/aiot/projects/{pid}/validate')
def validate_project(pid:int,x:ValidateInput): return validate(project(pid)['design'],x.supply_v,x.soil_count)

@app.post('/api/v1/aiot/projects/{pid}/deploy')
def deploy(pid:int):
    project(pid)
    raise HTTPException(503,'hardwareConnectorUnavailable')

@app.get('/api/v1/aiot/projects/{pid}/export')
def export(pid:int,language:str=Query('en',pattern='^(en|fr|ja|ar)$'),version:int|None=Query(None,ge=1)):
    p=project(pid); data=io.BytesIO(); bom=io.StringIO(); writer=csv.writer(bom)
    if version is not None:
        selected=next((v for v in p['versions'] if v['version']==version),None)
        if not selected: raise HTTPException(404,'versionNotFound')
        p['design']=selected['design']
        p['exported_version']=version
    writer.writerow(['component','quantity','unit_USD','voltage_V','power_W'])
    for b in p['design']['bom']: writer.writerow([b['key'],b['quantity'],b['price_usd'],b['voltage_v'],b['power_w']])
    # Same translation resources serve the application and exported instructions.
    from pathlib import Path
    translations=Path(__file__).resolve().parents[2]/'frontend'/'src'/'i18n'/f'{language}.json'
    tr=json.loads(translations.read_text(encoding='utf-8')) if translations.exists() else {}
    with zipfile.ZipFile(data,'w',zipfile.ZIP_DEFLATED) as z:
        z.writestr('design.json',json.dumps(p,default=str,ensure_ascii=False,indent=2))
        z.writestr('bom.csv',bom.getvalue()); z.writestr('starter.ino',p['design']['firmware'])
        z.writestr('assembly.txt','\n\n'.join(tr.get(k,k) for k in p['design']['instructions']))
        wires=io.StringIO(); wire_writer=csv.writer(wires)
        wire_writer.writerow(['source','target','signal'])
        wire_writer.writerows([[w[k] for k in ['source','target','signal']] for w in p['design']['connections']])
        z.writestr('connections.csv',wires.getvalue())
    return Response(data.getvalue(),media_type='application/zip',headers={'Content-Disposition':f'attachment; filename="resilifarm-{pid}.zip"'})
