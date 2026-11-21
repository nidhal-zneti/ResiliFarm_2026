"""Explicit engineering estimates, not trained AI or calibrated field models."""
import math
from statistics import median
from .db import KC
from .schemas import FarmInput, ScenarioInput

def irrigation(x: FarmInput):
    kc = KC[x.crop][['initial','mid','late'].index(x.stage)]
    etc = kc*x.et0
    effective = .8*x.rainfall
    net = max(0, etc-effective)
    gross = net/x.efficiency
    volume = 10*gross*x.area_ha
    energy = 1000*9.81*volume*x.head_m/(x.pump_efficiency*3600000)
    solar = x.solar_kw*x.sun_hours*.8
    return dict(kc=kc, etc_mm=round(etc,3), effective_rain_mm=round(effective,3), net_mm=round(net,3), gross_mm=round(gross,3), water_m3=round(volume,2), pump_kwh=round(energy,2), solar_kwh=round(solar,2), deficit_kwh=round(max(0,energy-solar),2), stress=round(min(100,net/8*100)), method='fao56', is_simulated=True, action='solarWindow' if solar>=energy else 'backupEnergy')

def network(volume=220.0, leak=0.0, pump=True):
    # Steady flow over an assumed eight-hour pumping day; Darcy-Weisbach, f=0.025.
    delivered = volume if pump else 0
    inlet = delivered/(1-leak)
    flow = inlet/(8*3600)
    velocity = flow/(math.pi*.08**2/4)
    head_loss = .025*(300/.08)*velocity**2/(2*9.81)
    pressure = max(0,(30-head_loss)*.0980665) if pump else 0
    return {'inlet_m3':round(inlet,2),'delivered_m3':round(delivered,2),'lost_m3':round(inlet-delivered,2), 'flow_lpm':round(flow*60000,2), 'pressure_bar':round(pressure,2),'head_loss_m':round(head_loss,2), 'method':'darcy', 'is_simulated':True, 'nodes':['reservoir','pump','field'], 'pipes':[{'from':'reservoir','to':'pump','length_m':150},{'from':'pump','to':'field','length_m':150}], 'alert':'leakDetected' if leak>.1 else ('pumpOffline' if not pump else 'normal')}

def scenario(x: ScenarioInput):
    before = irrigation(x)
    changed = x.model_dump(include=set(FarmInput.model_fields))
    s=x.severity
    if x.scenario=='drought': changed.update(et0=x.et0*(1+s), rainfall=x.rainfall*(1-s))
    if x.scenario=='heatwave': changed['et0']=x.et0*(1+.6*s)
    if x.scenario=='solarShortage': changed['sun_hours']=x.sun_hours*(1-s)
    impact=irrigation(FarmInput(**changed))
    action={'drought':'mulch','heatwave':'coolHours','restriction':'prioritize','leak':'isolateLeak','pumpFailure':'repairPump','solarShortage':'backupEnergy','tampering':'verifySensor'}[x.scenario]
    def outcome(intervene):
        r=impact.copy()
        if intervene and x.scenario in ['drought','heatwave']:
            r=irrigation(FarmInput(**{**changed,'et0':changed['et0']*.9}))
        leak=s if x.scenario=='leak' else 0
        if intervene: leak=(.1*leak)/(1-.9*leak)
        available=r['water_m3']
        if x.scenario=='restriction': available=before['water_m3']*(1-s)
        if x.scenario=='pumpFailure': available=r['water_m3']*.8 if intervene else 0
        served=min(r['water_m3'],available)
        r.update(network(served,leak,x.scenario!='pumpFailure' or intervene))
        r['delivered_m3']=round(served,2)
        r['unmet_m3']=round(max(0,r['water_m3']-served),2)
        r['priority_coverage_pct']=round(100*min(1,served/max(.01,r['water_m3']*(.7 if intervene and x.scenario=='restriction' else 1))),1)
        r['pump_kwh']=round(1000*9.81*r['inlet_m3']*x.head_m/(x.pump_efficiency*3600000),2) if available else 0
        r['deficit_kwh']=round(max(0,r['pump_kwh']-r['solar_kwh']),2)
        r['backup_kwh']=r['deficit_kwh'] if intervene and x.scenario=='solarShortage' else 0
        r['remaining_deficit_kwh']=round(max(0,r['deficit_kwh']-r['backup_kwh']),2)
        return r
    result = {'before':before,'disturbed':outcome(False),'after':outcome(x.intervention),'scenario':x.scenario,'severity':s,'intervention':x.intervention,'action':action,'assumption':'scenarioAssumptions','is_simulated':True}
    if x.scenario=='tampering':
        result['telemetry']={'before_moisture_pct':31,'disturbed_moisture_pct':round(100+s*100), 'after_moisture_pct':31 if x.intervention else round(100+s*100), 'action':action}
    return result

def anomalies(flow, pressure, moisture):
    alerts=[]
    fbase=median(flow[:-1]); pbase=median(pressure[:-1])
    if flow[-1]>fbase*1.3 and pressure[-1]<pbase*.8: alerts.append({'code':'leakDetected','severity':'high','evidence':{'flow_lpm':flow[-1],'baseline_lpm':fbase,'pressure_bar':pressure[-1]}})
    if any(x<0 or x>100 for x in moisture): alerts.append({'code':'sensorRange','severity':'high','evidence':{'min':min(moisture),'max':max(moisture)}})
    elif len(set(moisture[-5:]))==1: alerts.append({'code':'sensorFrozen','severity':'medium','evidence':{'samples':5}})
    elif abs(moisture[-1]-median(moisture[:-1]))>25: alerts.append({'code':'sensorJump','severity':'high','evidence':{'last':moisture[-1]}})
    return {'alerts':alerts,'method':'thresholds','is_simulated':True}
