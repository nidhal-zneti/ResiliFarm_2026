import csv
import io
import json
import os
import zipfile
from contextlib import asynccontextmanager
from fastapi import FastAPI, HTTPException, Query
from fastapi.responses import Response, JSONResponse
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import select, func
from sqlalchemy.exc import IntegrityError
from . import db
from .schemas import FarmInput, ScenarioInput, MessageInput, ProjectInput, TelemetryInput, ValidateInput
from .services import irrigation, network, scenario, anomalies
from .integrations import weather
from .studio import CATALOG, generate, validate, UnsupportedRequest, ProviderUnavailable, provider_status

@asynccontextmanager
async def lifespan(app):
    db.initialize()
    with db.engine.begin() as c:
        if not c.execute(select(db.components.c.id)).first():
            c.execute(db.components.insert(),[{'key':k,'specification':v} for k,v in CATALOG.items()])
    yield

app=FastAPI(title='ResiliFarm AI',version='1.0.0',lifespan=lifespan)
app.add_middleware(CORSMiddleware,allow_origins=os.getenv('CORS_ORIGINS','http://localhost:5173,http://127.0.0.1:5173').split(','),allow_methods=['GET','POST'],allow_headers=['Content-Type'])

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

@app.get('/api/v1/regions')
def regions():
    with db.engine.connect() as c:
        return {'regions':[dict(r) for r in c.execute(select(db.regions)).mappings()], 'countries':[dict(r) for r in c.execute(select(db.countries)).mappings()]}
@app.get('/api/v1/regions/{rid}/weather')
def get_weather(rid:int, live:bool=False, historical:bool=False): return weather(region(rid),live,historical)

@app.get('/api/v1/regions/{rid}/overview')
def overview(rid:int):
    r=region(rid); w=weather(r); d=w['days'][-1]
    calc=irrigation(FarmInput(region_id=rid,et0=d['et0_mm'],rainfall=d['rain_mm']))
    with db.engine.connect() as c:
        fs=[dict(f) for f in c.execute(select(db.fields).where(db.fields.c.farm_id==rid)).mappings()]
        devices=[dict(p) for p in c.execute(select(db.projects).where(db.projects.c.region_id==rid,db.projects.c.deployed==True)).mappings()]
    return {'region':r,'weather':w,'calculation':calc,'fields':fs,'devices':devices,'network':network(calc['water_m3']),'risks':{'heat':min(100,max(0,round((d['temperature_c']-25)*6))),'drought':calc['stress']},'is_simulated':True}

@app.get('/api/v1/regions/{rid}/water-network')
def get_network(rid:int, leak:float=Query(0,ge=0,le=.9), volume:float=Query(220,ge=0,le=100000000)):
    region(rid); return network(volume=volume,leak=leak)

@app.get('/api/v1/regions/{rid}/energy')
def energy(rid:int):
    r=region(rid); d=weather(r)['days'][-1]
    return irrigation(FarmInput(region_id=rid,sun_hours=d['radiation_mj_m2']/3.6,et0=d['et0_mm'],rainfall=d['rain_mm']))

@app.post('/api/v1/predictions/water-demand')
@app.post('/api/v1/predictions/solar')
@app.post('/api/v1/recommendations/irrigation')
def calculate(x:FarmInput):
    region(x.region_id); result=irrigation(x)
    db.save_record('irrigation_recommendations',x.region_id,{'input':x.model_dump(),'result':result})
    return result

@app.post('/api/v1/simulations/scenario',status_code=201)
def simulate(x:ScenarioInput):
    region(x.region_id); result=scenario(x)
    result['id']=db.save_record('simulation_runs',x.region_id,{'input':x.model_dump(),'result':result})
    if x.scenario in ['leak','tampering','pumpFailure']:
        db.save_record('alerts',x.region_id,{'code':{'leak':'leakDetected','tampering':'sensorRange','pumpFailure':'pumpOffline'}[x.scenario],'severity':'high','scenario_id':result['id']})
    return result

@app.get('/api/v1/simulations/{sid}')
def get_simulation(sid:int):
    table=db.records['simulation_runs']
    with db.engine.connect() as c: r=c.execute(select(table).where(table.c.id==sid)).mappings().first()
    if not r: raise HTTPException(404,'simulationNotFound')
    return dict(r)

@app.get('/api/v1/alerts')
def alerts(region_id:int=1):
    region(region_id); t=db.records['alerts']
    with db.engine.connect() as c: return [dict(r) for r in c.execute(select(t).where(t.c.region_id==region_id).order_by(t.c.id.desc()).limit(30)).mappings()]

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
    p=project(pid)
    if not validate(p['design'])['valid']: raise HTTPException(422,'incompatibleDesign')
    with db.engine.begin() as c: c.execute(db.projects.update().where(db.projects.c.id==pid).values(deployed=True))
    return {'deployed':True,'is_simulated':True,'project_id':pid}

@app.get('/api/v1/aiot/projects/{pid}/export')
def export(pid:int,language:str=Query('en',pattern='^(en|fr|ja)$'),version:int|None=Query(None,ge=1)):
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
