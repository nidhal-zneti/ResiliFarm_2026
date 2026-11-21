"""Open-Meteo current model weather and forecast integration; never substitutes samples."""
from datetime import datetime, timezone
import math
import time
import httpx

_cache={}
_CACHE_SECONDS=300


class WeatherUnavailable(RuntimeError):
    """The external weather provider returned no usable current data."""


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
        'updated_at':current['time'],'coverage':{'lat':region['lat'],'lon':region['lon'],'scope':'regional model grid'},
        'current':now,'days':days,
        'units':{'temperature':'°C','precipitation':'mm','radiation':'W/m²',
                 'et0':'mm/day','wind':'km/h','wind_direction':'°','humidity':'%'},
    }


def weather(region, live=True, historical=False):
    # Historical archive values are not current measurements and are not served
    # by the live dashboard. Keep the parameter for API compatibility but refuse it.
    if historical:
        raise WeatherUnavailable('historicalWeatherNotLive')
    key=region['id']
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
        response=httpx.get('https://api.open-meteo.com/v1/forecast',params=params,timeout=8)
        response.raise_for_status()
        result=normalize(response.json(),region)
        _cache[key]=(time.monotonic(),result)
        return result
    except (httpx.HTTPError,ValueError,KeyError,TypeError,IndexError) as exc:
        _cache.pop(key,None)
        raise WeatherUnavailable('weatherUnavailable') from exc
