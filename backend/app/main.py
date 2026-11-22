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
from .schemas import FarmInput, ScenarioInput, MessageInput, ProjectInput, TelemetryInput, ValidateInput, SignupInput, LoginInput, ProfileInput, PasswordInput, AssistantMessageInput, FirmwareInput
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
    with db.engine.begin() as c:
        if c.execute(select(db.users.c.id).where(db.users.c.email==email)).scalar_one_or_none(): raise HTTPException(409,'emailTaken')
        uid=c.execute(db.users.insert().values(email=email,full_name=x.full_name.strip(),password_hash=auth.hash_password(x.password))).inserted_primary_key[0]
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
