"""Open-Meteo current model weather and forecast integration; never substitutes samples."""
from datetime import datetime, timezone
from zoneinfo import ZoneInfo
import math
import os
import time
import httpx

_cache={}
_CACHE_SECONDS=300


class WeatherUnavailable(RuntimeError):
    """The external weather provider returned no usable current data."""


def _fetch(params):
    # Ignore inherited proxy variables by default. Local development and the
    # desktop demo often run with a placeholder proxy that cannot reach the
    # internet. Deployments that require a proxy can set OPEN_METEO_PROXY.
    proxy = os.getenv('OPEN_METEO_PROXY', '').strip() or None
    with httpx.Client(timeout=8, trust_env=False, proxy=proxy) as client:
        return client.get('https://api.open-meteo.com/v1/forecast', params=params)


def normalize(data, region):
    current=data['current']
    daily=data['daily']
    required_current=(
        'time','temperature_2m','relative_humidity_2m','precipitation',
        'rain','weather_code','wind_speed_10m','wind_direction_10m',
        'wind_gusts_10m','shortwave_radiation',
    )
    if any(key not in current for key in required_current):
        raise ValueError('Incomplete current weather')
    fields=('et0_fao_evapotranspiration','temperature_2m_max','precipitation_sum',
            'shortwave_radiation_sum','relative_humidity_2m_mean','wind_speed_10m_max')
    if not daily.get('time') or any(key not in daily for key in fields):
        raise ValueError('Incomplete weather forecast')
    days=[]
    for i,date in enumerate(daily['time']):
        day={'date':date,'et0_mm':float(daily['et0_fao_evapotranspiration'][i]),
             'temperature_c':float(daily['temperature_2m_max'][i]),
             'rain_mm':float(daily['precipitation_sum'][i]),
             'radiation_mj_m2':float(daily['shortwave_radiation_sum'][i]),
             'humidity_pct':float(daily['relative_humidity_2m_mean'][i]),
             'wind_kmh':float(daily['wind_speed_10m_max'][i])}
        if any(not math.isfinite(v) for v in day.values() if isinstance(v,(int,float))):
            raise ValueError('Non-finite weather value')
        days.append(day)
    now={key:current[key] for key in required_current if key!='time'}
    now['interval_seconds']=int(current.get('interval',900))
    if any(not math.isfinite(float(v)) for v in now.values()):
        raise ValueError('Non-finite current weather value')
    return {
        'source':'Open-Meteo weather model (15-minute current conditions)',
        'kind':'current_model','is_simulated':False,'is_measured':False,
        'updated_at':current['time'],'coverage':{'lat':region['lat'],'lon':region['lon'],'scope':region.get('scope','regional model grid')},
        'current':now,'days':days,
        'units':{'temperature':'°C','precipitation':'mm','radiation':'W/m²',
                 'et0':'mm/day','wind':'km/h','wind_direction':'°','humidity':'%'},
    }


def weather(region, live=True, historical=False):
    # Historical archive values are not current measurements and are not served
    # by the live dashboard. Keep the parameter for API compatibility but refuse it.
    if historical:
        raise WeatherUnavailable('historicalWeatherNotLive')
    key=('weather',round(float(region['lat']),5),round(float(region['lon']),5))
    cached=_cache.get(key)
    if cached and time.monotonic()-cached[0]<_CACHE_SECONDS:
        return cached[1]
    params={
        'latitude':region['lat'],'longitude':region['lon'],
        'current':'temperature_2m,relative_humidity_2m,precipitation,rain,weather_code,wind_speed_10m,wind_direction_10m,wind_gusts_10m,shortwave_radiation',
        'daily':'temperature_2m_max,precipitation_sum,et0_fao_evapotranspiration,shortwave_radiation_sum,relative_humidity_2m_mean,wind_speed_10m_max',
        'timezone':'auto','forecast_days':7,
    }
    try:
        response=_fetch(params)
        response.raise_for_status()
        result=normalize(response.json(),region)
        _cache[key]=(time.monotonic(),result)
        return result
    except (httpx.HTTPError,ValueError,KeyError,TypeError,IndexError) as exc:
        _cache.pop(key,None)
        raise WeatherUnavailable('weatherUnavailable') from exc


def soil_model(location):
    """Return Open-Meteo model soil moisture and temperature, never sensor readings."""
    key=('soil',round(float(location['lat']),5),round(float(location['lon']),5))
    cached=_cache.get(key)
    if cached and time.monotonic()-cached[0]<_CACHE_SECONDS:
        return cached[1]
    moisture=('soil_moisture_0_to_1cm','soil_moisture_1_to_3cm',
              'soil_moisture_3_to_9cm','soil_moisture_9_to_27cm',
              'soil_moisture_27_to_81cm')
    temperature=('soil_temperature_0cm','soil_temperature_6cm',
                  'soil_temperature_18cm','soil_temperature_54cm')
    params={'latitude':location['lat'],'longitude':location['lon'],
            'hourly':','.join((*moisture,*temperature)),
            'past_days':1,'forecast_days':1,'timezone':'auto'}
    try:
        response=_fetch(params)
        response.raise_for_status()
        data=response.json(); hourly=data['hourly']; times=hourly['time']
        if not times or any(name not in hourly for name in (*moisture,*temperature)):
            raise ValueError('Incomplete soil model')
        rows=[]
        for i,stamp in enumerate(times):
            values={name:hourly[name][i] for name in (*moisture,*temperature)}
            if all(value is None or math.isfinite(float(value)) for value in values.values()):
                rows.append({'time':stamp,**values})
        if not rows: raise ValueError('No soil model data')
        zone=ZoneInfo(data.get('timezone','UTC'))
        now=datetime.now(zone)
        current=min(rows,key=lambda row:abs(datetime.fromisoformat(row['time']).replace(tzinfo=zone)-now))
        result={'source':'Open-Meteo weather model soil variables','kind':'soil_model',
                'is_simulated':False,'is_measured':False,
                'coverage':{'lat':location['lat'],'lon':location['lon'],'scope':location.get('scope','farm-coordinate model grid')},
                'units':{'soil_moisture':'m³/m³','soil_temperature':'°C'},
                'updated_at':current['time'],'current':{k:v for k,v in current.items() if k!='time'},'hourly':rows}
        _cache[key]=(time.monotonic(),result)
        return result
    except (httpx.HTTPError,ValueError,KeyError,TypeError,IndexError) as exc:
        _cache.pop(key,None)
        raise WeatherUnavailable('soilModelUnavailable') from exc
