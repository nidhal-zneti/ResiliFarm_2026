"""Server-side Open-Meteo connector; fixed deterministic fallback and bounded cache."""
from datetime import datetime, timedelta, timezone
import math
import time
import httpx

_cache={}

def sample_weather(region):
    base={1:(5.8,31,.2,19.8),2:(3.7,25,2.4,16.5),3:(3.2,24,3.2,14.4)}.get(region['id'],(4.5,27,1,18))
    days=[]
    for i in range(14):
        days.append({'date':(datetime(2026,6,1)+timedelta(days=i)).date().isoformat(), 'et0_mm':round(base[0]+.35*math.sin(i),2),'temperature_c':round(base[1]+2*math.sin(i),1),'rain_mm':round(base[2]*(1+i%3),2),'radiation_mj_m2':base[3], 'humidity_pct':round(55-10*math.sin(i)), 'wind_kmh':round(10+3*math.cos(i),1)})
    return {'source':'ResiliFarm deterministic sample','kind':'simulated','is_simulated':True,'updated_at':'2026-06-14T12:00:00Z','coverage':{'lat':region['lat'],'lon':region['lon'],'scope':'regional'},'days':days,'units':{'et0':'mm/day','rain':'mm/day','temperature':'°C','radiation':'MJ/m²/day','humidity':'%','wind':'km/h'}}

def normalize(data, region):
    d=data['daily']
    days=[{'date':date,'et0_mm':float(d['et0_fao_evapotranspiration'][i]),'temperature_c':float(d['temperature_2m_max'][i]),'rain_mm':float(d['precipitation_sum'][i]),'radiation_mj_m2':float(d['shortwave_radiation_sum'][i]),'humidity_pct':float(d['relative_humidity_2m_mean'][i]),'wind_kmh':float(d['wind_speed_10m_max'][i])} for i,date in enumerate(d['time'])]
    if not days or any(not math.isfinite(v) for day in days for k,v in day.items() if k!='date'):
        raise ValueError('Incomplete weather data')
    return {**sample_weather(region),'source':'Open-Meteo (CC BY 4.0)','kind':'forecast','is_simulated':False,'updated_at':datetime.now(timezone.utc).isoformat(),'days':days}

def weather(region, live=False, historical=False):
    if not live and not historical: return sample_weather(region)
    key=(region['id'],historical); cached=_cache.get(key)
    if cached and time.monotonic()-cached[0]<1800: return cached[1]
    try:
        params={'latitude':region['lat'],'longitude':region['lon'],'daily':'temperature_2m_max,precipitation_sum,et0_fao_evapotranspiration,shortwave_radiation_sum,relative_humidity_2m_mean,wind_speed_10m_max','timezone':'auto'}
        endpoint='https://api.open-meteo.com/v1/forecast'
        if historical:
            end=datetime.now(timezone.utc).date()-timedelta(days=7)
            params.update(start_date=(end-timedelta(days=13)).isoformat(),end_date=end.isoformat())
            endpoint='https://archive-api.open-meteo.com/v1/archive'
        else: params['forecast_days']=7
        r=httpx.get(endpoint,params=params,timeout=8)
        r.raise_for_status()
        result=normalize(r.json(),region)
        if historical: result['kind']='reanalysis'
        _cache[key]=(time.monotonic(),result)
        return result
    except (httpx.HTTPError,ValueError,KeyError,TypeError,IndexError):
        return {**sample_weather(region),'fallback_reason':'weatherUnavailable'}
