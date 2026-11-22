import csv
import io
import json
import os
import zipfile
from copy import deepcopy
from contextlib import asynccontextmanager
from fastapi import Depends, FastAPI, HTTPException, Query
from fastapi.responses import Response, JSONResponse
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import select, func
from sqlalchemy.exc import IntegrityError
from . import auth, db
from .schemas import FarmInput, ScenarioInput, MessageInput, ProjectInput, TelemetryInput, ValidateInput, SignupInput, LoginInput, ProfileInput, PasswordInput, RoleInput, AssignmentInput, ReviewInput, FarmCreateInput, FarmUpdateInput, AdminUserCreateInput, AdminUserUpdateInput, AccountStatusInput, IoTDeviceInput, AssistantMessageInput, FirmwareInput
from .services import irrigation, anomalies
from .integrations import weather, WeatherUnavailable
from .studio import CATALOG, generate, validate, UnsupportedRequest, ProviderUnavailable, provider_status
from .studio_assistant import AssistantUnavailable, is_design_request, is_design_edit, update_profile, question_turn, answer_agriculture
from .firmware_generation import generate_firmware, FirmwareUnavailable, FirmwareConfigurationError

@asynccontextmanager
async def lifespan(app):
    db.initialize()
    with db.engine.begin() as c:
        if not c.execute(select(db.components.c.id)).first():
            c.execute(db.components.insert(),[{'key':k,'specification':v} for k,v in CATALOG.items()])
    yield

app=FastAPI(title='ResiliFarm AI',version='1.0.0',lifespan=lifespan)
app.add_middleware(CORSMiddleware,allow_origins=os.getenv('CORS_ORIGINS','http://localhost:5173,http://127.0.0.1:5173').split(','),allow_origin_regex=os.getenv('CORS_ORIGIN_REGEX',r'https?://(localhost|127\.0\.0\.1)(:\d+)?'),allow_methods=['GET','POST','PATCH'],allow_headers=['Content-Type','Authorization'])

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

@app.exception_handler(AssistantUnavailable)
async def assistant_unavailable(_, exc):
    return JSONResponse(status_code=503,content={'error':{'code':str(exc)}})

@app.exception_handler(WeatherUnavailable)
async def weather_unavailable(_, exc):
    return JSONResponse(status_code=503,content={'error':{'code':'weatherUnavailable'}})

@app.exception_handler(FirmwareUnavailable)
async def firmware_unavailable(_, exc):
    return JSONResponse(status_code=503,content={'error':{'code':str(exc)}})

@app.exception_handler(FirmwareConfigurationError)
async def firmware_configuration_error(_, exc):
    return JSONResponse(status_code=422,content={'error':{'code':str(exc)}})

@app.get('/api/v1/aiot/provider')
def studio_provider(): return provider_status()

@app.get('/api/v1/aiot/assistant/status')
def assistant_status():
    return {'model':provider_status(),'source_search_configured':bool(os.getenv('TAVILY_API_KEY','').strip())}

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
    try:
        with db.engine.begin() as c:
            uid=c.execute(db.users.insert().values(
                email=email,
                full_name=x.full_name.strip(),
                password_hash=auth.hash_password(x.password),
                role='FARMER',
                is_active=True,
            )).inserted_primary_key[0]
            row=c.execute(select(db.users).where(db.users.c.id==uid)).mappings().first()
    except IntegrityError:
        raise HTTPException(409,'emailTaken')
    public=auth.public_user(dict(row))
    return {'token':auth.create_token(uid),'user':public}

@app.post('/api/v1/auth/login')
def login(x:LoginInput):
    with db.engine.connect() as c: row=c.execute(select(db.users).where(db.users.c.email==x.email.strip().lower())).mappings().first()
    if not row or not auth.verify_password(x.password,row['password_hash']): raise HTTPException(401,'invalidCredentials')
    if not row.get('is_active',True): raise HTTPException(403,'accountInactive')
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
    cols=[db.farms.c.id,db.farms.c.name,db.zones.c.name.label('zone'),db.regions.c.id.label('region_id'),db.regions.c.name.label('region_name'),db.regions.c.lat.label('lat'),db.regions.c.lon.label('lon'),db.regions.c.climate.label('climate'),db.farms.c.owner_id,db.users.c.full_name.label('owner_name')]
    role=user.get('role') or 'FARMER'
    base=db.farms.join(db.zones,db.farms.c.zone_id==db.zones.c.id).join(db.regions,db.zones.c.region_id==db.regions.c.id).outerjoin(db.users,db.farms.c.owner_id==db.users.c.id)
    stmt=select(*cols).select_from(base)
    if role=='AGRONOMIST':
        stmt=stmt.join(db.farm_assignments,db.farms.c.id==db.farm_assignments.c.farm_id).where(db.farm_assignments.c.user_id==user['id'])
    elif role!='ADMIN':
        # A farmer only ever sees the farm that was assigned to them.
        stmt=stmt.where(db.farms.c.owner_id==user['id'])
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
        return [{'id':r['id'],'name':r['name'],'region_id':r['region_id'],'region':r['region_name'],'owner_id':r['owner_id'],'owner':r['owner_name']} for r in _visible_farms(c,user)]

@app.post('/api/v1/farms',status_code=201)
def create_farm(x:FarmCreateInput,user=Depends(auth.require_admin)):
    with db.engine.begin() as c:
        region_row=c.execute(select(db.regions).where(db.regions.c.id==x.region_id)).mappings().first()
        if not region_row: raise HTTPException(404,'regionNotFound')
        if x.owner_id is not None and not c.execute(select(db.users.c.id).where(db.users.c.id==x.owner_id)).scalar_one_or_none():
            raise HTTPException(404,'userNotFound')
        zone_id=c.execute(select(db.zones.c.id).where(db.zones.c.region_id==x.region_id).order_by(db.zones.c.id)).scalar_one_or_none()
        if zone_id is None:
            zone_id=c.execute(db.zones.insert().values(region_id=x.region_id,name=f"{region_row['name']} zone")).inserted_primary_key[0]
        name=x.name.strip()
        fid=c.execute(db.farms.insert().values(zone_id=zone_id,name=name,owner_id=x.owner_id)).inserted_primary_key[0]
        crop_id=c.execute(select(db.crops.c.id).where(db.crops.c.name==x.crop)).scalar_one_or_none()
        if crop_id is not None:
            c.execute(db.fields.insert().values(farm_id=fid,crop_id=crop_id,name=f'{name} · field',area_ha=x.area_ha,lat=region_row['lat'],lon=region_row['lon']))
    return {'id':fid,'name':name,'region_id':x.region_id,'owner_id':x.owner_id}

@app.patch('/api/v1/farms/{fid}')
def update_farm(fid:int,x:FarmUpdateInput,user=Depends(auth.require_admin)):
    with db.engine.begin() as c:
        farm=c.execute(select(db.farms).where(db.farms.c.id==fid)).mappings().first()
        if not farm: raise HTTPException(404,'farmNotFound')
        region=c.execute(select(db.regions).where(db.regions.c.id==x.region_id)).mappings().first()
        if not region: raise HTTPException(404,'regionNotFound')
        if x.owner_id is not None:
            owner=c.execute(select(db.users.c.id).where(db.users.c.id==x.owner_id)).scalar_one_or_none()
            if not owner: raise HTTPException(404,'userNotFound')
        zone_id=c.execute(select(db.zones.c.id).where(db.zones.c.region_id==x.region_id).order_by(db.zones.c.id)).scalar_one_or_none()
        if zone_id is None:
            zone_id=c.execute(db.zones.insert().values(region_id=x.region_id,name=f'{region["name"]} zone')).inserted_primary_key[0]
        c.execute(db.farms.update().where(db.farms.c.id==fid).values(zone_id=zone_id,name=x.name.strip(),owner_id=x.owner_id,governorate=x.governorate or None,address=x.address or None,latitude=x.latitude,longitude=x.longitude,cultivated_area_ha=x.cultivated_area_ha,crop_type=x.crop_type or None,soil_type=x.soil_type or None,irrigation_method=x.irrigation_method or None,water_source=x.water_source or None))
    return {'id':fid,'updated':True}

@app.post('/api/v1/farms/{fid}/archive')
def archive_farm(fid:int,user=Depends(auth.require_admin)):
    with db.engine.begin() as c:
        if c.execute(select(db.farms.c.id).where(db.farms.c.id==fid)).scalar_one_or_none() is None:
            raise HTTPException(404,'farmNotFound')
        c.execute(db.farms.update().where(db.farms.c.id==fid).values(archived=True))
    return {'archived':True}

@app.get('/api/v1/admin/devices')
def list_devices(user=Depends(auth.require_admin)):
    with db.engine.connect() as c:
        stmt=select(db.iot_devices).order_by(db.iot_devices.c.created_at.desc())
        return [dict(r) for r in c.execute(stmt).mappings()]

@app.post('/api/v1/admin/devices',status_code=201)
def create_device(x:IoTDeviceInput,user=Depends(auth.require_admin)):
    with db.engine.begin() as c:
        if c.execute(select(db.iot_devices.c.id).where(db.iot_devices.c.device_id==x.device_id.strip())).scalar_one_or_none():
            raise HTTPException(409,'deviceIdTaken')
        if x.farm_id is not None and c.execute(select(db.farms.c.id).where(db.farms.c.id==x.farm_id)).scalar_one_or_none() is None:
            raise HTTPException(404,'farmNotFound')
        rid=c.execute(db.iot_devices.insert().values(device_id=x.device_id.strip(),name=x.name.strip(),device_type=x.device_type.strip(),sensor_type=x.sensor_type.strip(),farm_id=x.farm_id,installation_status=x.installation_status,is_active=x.is_active)).inserted_primary_key[0]
        row=c.execute(select(db.iot_devices).where(db.iot_devices.c.id==rid)).mappings().first()
    return dict(row)

@app.patch('/api/v1/admin/devices/{did}')
def update_device(did:int,x:IoTDeviceInput,user=Depends(auth.require_admin)):
    with db.engine.begin() as c:
        if c.execute(select(db.iot_devices.c.id).where(db.iot_devices.c.id==did)).scalar_one_or_none() is None:
            raise HTTPException(404,'deviceNotFound')
        duplicate=c.execute(select(db.iot_devices.c.id).where(db.iot_devices.c.device_id==x.device_id.strip(),db.iot_devices.c.id!=did)).scalar_one_or_none()
        if duplicate: raise HTTPException(409,'deviceIdTaken')
        if x.farm_id is not None and c.execute(select(db.farms.c.id).where(db.farms.c.id==x.farm_id)).scalar_one_or_none() is None:
            raise HTTPException(404,'farmNotFound')
        c.execute(db.iot_devices.update().where(db.iot_devices.c.id==did).values(device_id=x.device_id.strip(),name=x.name.strip(),device_type=x.device_type.strip(),sensor_type=x.sensor_type.strip(),farm_id=x.farm_id,installation_status=x.installation_status,is_active=x.is_active))
        row=c.execute(select(db.iot_devices).where(db.iot_devices.c.id==did)).mappings().first()
    return dict(row)

@app.post('/api/v1/admin/devices/{did}/communication')
def record_device_communication(did:int,user=Depends(auth.require_admin)):
    from datetime import datetime, timezone
    with db.engine.begin() as c:
        if c.execute(select(db.iot_devices.c.id).where(db.iot_devices.c.id==did)).scalar_one_or_none() is None:
            raise HTTPException(404,'deviceNotFound')
        c.execute(db.iot_devices.update().where(db.iot_devices.c.id==did).values(last_communication_at=datetime.now(timezone.utc)))
    return {'updated':True}

@app.post('/api/v1/farms/{fid}/owner')
def set_farm_owner(fid:int,x:AssignmentInput,user=Depends(auth.require_admin)):
    with db.engine.begin() as c:
        if not c.execute(select(db.farms.c.id).where(db.farms.c.id==fid)).scalar_one_or_none(): raise HTTPException(404,'farmNotFound')
        if not c.execute(select(db.users.c.id).where(db.users.c.id==x.user_id)).scalar_one_or_none(): raise HTTPException(404,'userNotFound')
        c.execute(db.farms.update().where(db.farms.c.id==fid).values(owner_id=x.user_id))
    return {'assigned':True,'owner_id':x.user_id}

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

def assistant_region(rid):
    with db.engine.connect() as c:
        row=c.execute(select(db.regions,db.countries.c.code.label('country_code'),db.countries.c.name.label('country_name'))
                      .join(db.countries,db.countries.c.id==db.regions.c.country_id)
                      .where(db.regions.c.id==rid)).mappings().first()
    if not row: raise HTTPException(404,'regionNotFound')
    return dict(row)

def assistant_thread(cid,user_id):
    with db.engine.connect() as c:
        row=c.execute(select(db.studio_conversations).where(db.studio_conversations.c.id==cid,
                         db.studio_conversations.c.user_id==user_id)).mappings().first()
        if not row: raise HTTPException(404,'conversationNotFound')
        messages=[dict(m) for m in c.execute(select(db.studio_chat_messages)
                  .where(db.studio_chat_messages.c.conversation_id==cid)
                  .order_by(db.studio_chat_messages.c.id)).mappings()]
    return {**dict(row),'messages':messages}

@app.get('/api/v1/aiot/assistant/conversations')
def assistant_conversations(user=Depends(auth.current_user)):
    with db.engine.connect() as c:
        return [dict(r) for r in c.execute(select(db.studio_conversations)
                .where(db.studio_conversations.c.user_id==user['id'])
                .order_by(db.studio_conversations.c.id.desc())).mappings()]

@app.get('/api/v1/aiot/assistant/conversations/{cid}')
def get_assistant_conversation(cid:int,user=Depends(auth.current_user)):
    return assistant_thread(cid,user['id'])

def create_assistant_design(text, context, rid):
    pid=context.get('project_id')
    previous=project(pid)['design'] if pid else None
    design=generate(context['design_request'],previous)
    material_estimate=context.get('estimate')
    design['farm_context']=context.get('farm_profile',{})
    design['material_estimate']=material_estimate
    if pid:
        with db.engine.begin() as c:
            version=c.execute(select(func.max(db.versions.c.version)).where(db.versions.c.project_id==pid)).scalar_one() or 0
            save_version(c,pid,text,design,version+1)
            c.execute(db.projects.update().where(db.projects.c.id==pid).values(deployed=False))
    else:
        with db.engine.begin() as c:
            pid=c.execute(db.projects.insert().values(region_id=rid,name='ResiliFarm Studio')).inserted_primary_key[0]
            save_version(c,pid,text,design,1)
    context['project_id']=pid
    return project(pid)

@app.post('/api/v1/aiot/assistant/messages')
def assistant_message(x:AssistantMessageInput,user=Depends(auth.current_user)):
    r=assistant_region(x.region_id)
    existing=assistant_thread(x.conversation_id,user['id']) if x.conversation_id else None
    context=dict(existing['context'] or {}) if existing else {}
    prior_messages=existing['messages'] if existing else []
    region_changed=existing is not None and existing['region_id']!=x.region_id
    if region_changed:
        context['region_changed']=True
    pending=context.get('pending_field')
    profile=dict(context.get('farm_profile') or {})
    result=None
    design_project=None

    if context.get('design_intake'):
        updated=update_profile(x.text,profile,pending)
        field_answered=(pending is None or updated.get(pending) is not None
                        or pending in updated.get('unknown_fields',[]))
        if field_answered:
            profile=updated
            context['farm_profile']=profile
            result=question_turn(profile,r,x.language)
        else:
            # Keep an invalid intake answer in the structured flow. Sending it to
            # free-form generation can produce a plausible-sounding but unrelated
            # design instead of resolving the missing input.
            result=question_turn(profile,r,x.language)
            result['reply_key']='farmAnswerUnclear'
    elif context.get('project_id') and is_design_edit(x.text):
        context['design_request']=x.text
        context['design_intake']=True
        profile=update_profile(x.text,profile)
        context['farm_profile']=profile
        result=question_turn(profile,r,x.language)
    elif is_design_request(x.text):
        context['design_request']=x.text
        context['design_intake']=True
        profile=update_profile(x.text,profile)
        context['farm_profile']=profile
        result=question_turn(profile,r,x.language)
    else:
        result=answer_agriculture(x.text,prior_messages,r,x.language)

    if result['intent']=='followup':
        context['pending_field']=result.get('pending_field')
    elif result['intent']=='estimate':
        context.pop('pending_field',None)
        context['estimate']=result['estimate']
        context['design_intake']=False
        design_project=create_assistant_design(x.text,context,x.region_id)
        result['project']=design_project
        result['estimate']=design_project['design']['material_estimate']

    text_value=result.get('reply') or result.get('reply_key') or result.get('question_key') or ''
    message_payload={k:v for k,v in result.items() if k not in ('reply','project')}
    with db.engine.begin() as c:
        if existing:
            cid=existing['id']
            c.execute(db.studio_conversations.update().where(db.studio_conversations.c.id==cid)
                      .values(region_id=x.region_id,context=context,project_id=context.get('project_id')))
        else:
            cid=c.execute(db.studio_conversations.insert().values(
                user_id=user['id'],region_id=x.region_id,title=x.text[:160],context=context,
                project_id=context.get('project_id'))).inserted_primary_key[0]
        c.execute(db.studio_chat_messages.insert(),[
            {'conversation_id':cid,'role':'user','text':x.text,'payload':None},
            {'conversation_id':cid,'role':'assistant','text':text_value,'payload':message_payload},
        ])
    return {'conversation':assistant_thread(cid,user['id']),'result':result}

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

@app.post('/api/v1/aiot/projects/{pid}/firmware')
def project_firmware(pid:int,x:FirmwareInput):
    p=project(pid)
    if p['versions'][-1]['version']!=x.version:
        raise HTTPException(409,'versionConflict')
    generated=generate_firmware(p['design'],x)
    design=deepcopy(p['design'])
    design['firmware']=generated.pop('code')
    design['firmware_generation']=generated
    design['response']='firmwareGenerated'
    try:
        with db.engine.begin() as c:
            latest=c.execute(select(func.max(db.versions.c.version)).where(db.versions.c.project_id==pid)).scalar_one()
            if latest!=x.version:
                raise HTTPException(409,'versionConflict')
            save_version(c,pid,'Generate microcontroller code',design,latest+1)
            c.execute(db.projects.update().where(db.projects.c.id==pid).values(deployed=False))
    except IntegrityError:
        raise HTTPException(409,'versionConflict')
    return project(pid)

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
        z.writestr('bom.csv',bom.getvalue())
        firmware_info=p['design'].get('firmware_generation')
        if firmware_info:
            z.writestr('resilifarm/resilifarm.ino',p['design']['firmware'])
            z.writestr('firmware_manifest.json',json.dumps(firmware_info,ensure_ascii=False,indent=2))
            pin_csv=io.StringIO(); pin_writer=csv.writer(pin_csv)
            pin_writer.writerow(['component','signal','gpio','mode'])
            pin_writer.writerows([[pin['name'],pin['symbol'],pin['gpio'],pin['mode']] for pin in firmware_info['pin_map']])
            z.writestr('firmware_pins.csv',pin_csv.getvalue())
            z.writestr('firmware_setup.txt','\n\n'.join([
                'ESP32 Dev Module (classic ESP32), Arduino framework.',
                'Use firmware_pins.csv for this sketch; conceptual connections.csv may differ.',
                'Compilation: '+firmware_info['compile_status']+'. Not hardware-tested. Outputs are disabled by default.',
                'Libraries: '+', '.join(firmware_info['libraries']),
                tr.get('firmwareRunInstructions', 'Use ESP32 Dev Module; install the listed libraries. Serial: 115200 baud, newline, STOP/RESET.'),
                tr.get('firmwareCalibrationNote', 'Measure sensors and edit calibration constants before enabling outputs.'),
                *firmware_info['setup_steps'], *firmware_info['assumptions'], *firmware_info['limitations'],
            ]))
        else:
            z.writestr('starter.ino',p['design']['firmware'])
        z.writestr('assembly.txt','\n\n'.join(tr.get(k,k) for k in p['design']['instructions']))
        wires=io.StringIO(); wire_writer=csv.writer(wires)
        wire_writer.writerow(['source','target','signal'])
        wire_writer.writerows([[w[k] for k in ['source','target','signal']] for w in p['design']['connections']])
        z.writestr('connections.csv',wires.getvalue())
    return Response(data.getvalue(),media_type='application/zip',headers={'Content-Disposition':f'attachment; filename="resilifarm-{pid}.zip"'})

@app.post('/api/v1/admin/users', status_code=201)
def admin_create_user(x:AdminUserCreateInput, user=Depends(auth.require_admin)):
    email=x.email.strip().lower()
    with db.engine.begin() as c:
        if c.execute(select(db.users.c.id).where(db.users.c.email==email)).scalar_one_or_none():
            raise HTTPException(409,'emailTaken')
        uid=c.execute(db.users.insert().values(email=email,full_name=x.full_name.strip(),phone=x.phone.strip() if x.phone else None,password_hash=auth.hash_password(x.password),role=x.role,is_active=True)).inserted_primary_key[0]
        row=c.execute(select(db.users).where(db.users.c.id==uid)).mappings().first()
    return auth.public_user(dict(row))

@app.patch('/api/v1/admin/users/{uid}')
def admin_update_user(uid:int,x:AdminUserUpdateInput,user=Depends(auth.require_admin)):
    email=x.email.strip().lower()
    with db.engine.begin() as c:
        if c.execute(select(db.users.c.id).where(db.users.c.id==uid)).scalar_one_or_none() is None:
            raise HTTPException(404,'userNotFound')
        duplicate=c.execute(select(db.users.c.id).where(db.users.c.email==email,db.users.c.id!=uid)).scalar_one_or_none()
        if duplicate: raise HTTPException(409,'emailTaken')
        c.execute(db.users.update().where(db.users.c.id==uid).values(email=email,full_name=x.full_name.strip(),phone=x.phone.strip() if x.phone else None))
        row=c.execute(select(db.users).where(db.users.c.id==uid)).mappings().first()
    return auth.public_user(dict(row))

@app.post('/api/v1/admin/users/{uid}/status')
def set_account_status(uid:int,x:AccountStatusInput,user=Depends(auth.require_admin)):
    with db.engine.begin() as c:
        if uid==user['id'] and not x.is_active:
            raise HTTPException(422,'cannotDeactivateSelf')
        if c.execute(select(db.users.c.id).where(db.users.c.id==uid)).scalar_one_or_none() is None:
            raise HTTPException(404,'userNotFound')
        c.execute(db.users.update().where(db.users.c.id==uid).values(is_active=x.is_active))
        row=c.execute(select(db.users).where(db.users.c.id==uid)).mappings().first()
    return auth.public_user(dict(row))

@app.get('/api/v1/admin/overview')
def admin_overview(user=Depends(auth.require_admin)):
    with db.engine.connect() as c:
        total_farmers=c.execute(select(func.count()).select_from(db.users).where(db.users.c.role=='FARMER')).scalar() or 0
        total_agronomists=c.execute(select(func.count()).select_from(db.users).where(db.users.c.role=='AGRONOMIST')).scalar() or 0
        total_farms=c.execute(select(func.count()).select_from(db.farms).where(db.farms.c.archived==False)).scalar() or 0
        assigned_farms=c.execute(select(func.count()).select_from(db.farms).where(db.farms.c.archived==False,db.farms.c.owner_id.is_not(None))).scalar() or 0
        iot_count=c.execute(select(func.count()).select_from(db.iot_devices)).scalar() or 0
        recent_users=c.execute(select(db.users).where(db.users.c.role=='FARMER').order_by(db.users.c.created_at.desc()).limit(5)).mappings().all()
        recent_farms=c.execute(select(db.farms).where(db.farms.c.archived==False).order_by(db.farms.c.created_at.desc()).limit(5)).mappings().all()
        unassigned_farms=c.execute(select(db.farms).where(db.farms.c.archived==False,db.farms.c.owner_id.is_(None)).order_by(db.farms.c.created_at.desc()).limit(10)).mappings().all()
    return {'total_farmers':total_farmers,'total_agronomists':total_agronomists,'total_farms':total_farms,'assigned_farms':assigned_farms,'unassigned_farms':total_farms-assigned_farms,'iot_devices':iot_count,'recent_farmers':[auth.public_user(dict(r)) for r in recent_users],'recent_farms':[{'id':r['id'],'name':r['name'],'created_at':r['created_at']} for r in recent_farms],'farms_without_owner':[{'id':r['id'],'name':r['name']} for r in unassigned_farms]}
