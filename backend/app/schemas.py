from typing import Literal
from pydantic import BaseModel, Field, ConfigDict

class Input(BaseModel):
    model_config = ConfigDict(extra='forbid', allow_inf_nan=False)

class FarmInput(Input):
    region_id: int = Field(1, ge=1)
    crop: Literal['olive','wheat','tomato'] = 'olive'
    stage: Literal['initial','mid','late'] = 'mid'
    area_ha: float = Field(5, gt=0, le=10000)
    efficiency: float = Field(.85, ge=.1, le=1)
    et0: float = Field(5.8, ge=0, le=30)
    rainfall: float = Field(.2, ge=0, le=500)
    head_m: float = Field(30, ge=0, le=500)
    pump_efficiency: float = Field(.65, ge=.1, le=1)
    solar_kw: float = Field(12, ge=0, le=10000)
    sun_hours: float = Field(5.5, ge=0, le=24)

class ScenarioInput(FarmInput):
    scenario: Literal['drought','heatwave','restriction','leak','pumpFailure','solarShortage','tampering'] = 'leak'
    severity: float = Field(.35, ge=.05, le=.9)
    intervention: bool = False

class MessageInput(Input):
    text: str = Field(min_length=1, max_length=4000)
    language: Literal['en','fr','ja'] = 'en'

class ProjectInput(MessageInput):
    region_id: int = Field(1, ge=1)
    name: str = Field('Irrigation controller', min_length=1, max_length=160)
    preferences: list[Literal['solar','LoRa','Wi-Fi','greenhouse']] = Field(default_factory=list, max_length=4)

class TelemetryInput(Input):
    flow: list[float] = Field(min_length=5, max_length=1000)
    pressure: list[float] = Field(min_length=5, max_length=1000)
    moisture: list[float] = Field(min_length=5, max_length=1000)

class ValidateInput(Input):
    supply_v: float = Field(3.3, ge=0, le=48)
    soil_count: int = Field(2, ge=1, le=12)
