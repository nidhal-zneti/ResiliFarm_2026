export type Region = {
  id: number;
  country_id: number;
  name: string;
  lat: number;
  lon: number;
  climate: string;
};
export type Farm = {
  region_id: number;
  crop: string;
  stage: string;
  area_ha: number;
  efficiency: number;
  et0: number;
  rainfall: number;
  head_m: number;
  pump_efficiency: number;
  solar_kw: number;
  sun_hours: number;
};
export type Calculation = {
  kc: number;
  etc_mm: number;
  effective_rain_mm: number;
  net_mm: number;
  gross_mm: number;
  water_m3: number;
  pump_kwh: number;
  solar_kwh: number;
  deficit_kwh: number;
  stress: number;
  action: string;
};
export type Weather = {
  source: string;
  kind: string;
  is_simulated: boolean;
  updated_at: string;
  fallback_reason?: string;
  days: {
    date: string;
    et0_mm: number;
    rain_mm: number;
    temperature_c: number;
    humidity_pct: number;
    wind_kmh: number;
    radiation_mj_m2: number;
  }[];
};
export type Field = {
  id: number;
  name: string;
  crop_id: number;
  area_ha: number;
  lat: number;
  lon: number;
};
export type Network = {
  inlet_m3: number;
  delivered_m3: number;
  lost_m3: number;
  flow_lpm: number;
  pressure_bar: number;
  alert: string;
};
export type Overview = {
  region: Region;
  weather: Weather;
  calculation: Calculation;
  fields: Field[];
  devices: { id: number; name: string }[];
  network: Network;
  risks: { heat: number; drought: number };
};
export type Scenario = {
  telemetry?: {
    before_moisture_pct: number;
    disturbed_moisture_pct: number;
    after_moisture_pct: number;
  };
  id: number;
  before: Calculation;
  disturbed: Calculation &
    Network & { unmet_m3: number; priority_coverage_pct: number; backup_kwh:number; remaining_deficit_kwh:number };
  after: Calculation &
    Network & { unmet_m3: number; priority_coverage_pct: number; backup_kwh:number; remaining_deficit_kwh:number };
  action: string;
  scenario: string;
  severity: number;
  intervention: boolean;
};
export type Part = {
  key: string;
  quantity: number;
  voltage_v: number;
  current_ma: number;
  power_w: number;
  price_usd: number;
  protocol: string;
  gpio: number;
  operating_c: number[];
  constraint: string;
};
export type Validation = {
  valid: boolean;
  issues: string[];
  checks: string[];
  warnings: string[];
};
export type Design = {
  generation_source?: "provider" | "localRules";
  greenhouse?: {
    area_m2: number; crop: string; zones: number; soil_sensors: number;
    humidity_sensors: number; light_sensors: number; co2_sensors: number;
    fans: number; irrigation_valves: number; vents: number; misters: number;
    ph_sensors: number; ec_sensors: number;
    zone_list: { id: number; soil_sensors: number; irrigation_valves: number;
      humidity_sensor: number; light_sensor: number; fans: number; vents: number;
      setpoints: Record<string, unknown> }[];
    setpoints: Record<string, unknown>; assumptions: string[]; scenarios: string[];
  };
  options: {
    soil_count: number;
    supply_v: number;
    profile?: string;
    valves?: number;
    solar?: boolean;
    lora?: boolean;
    tank?: boolean;
    weather?: boolean;
  };
  bom: Part[];
  connections: {
    source: string;
    target: string;
    signal: string;
    rule: string;
  }[];
  cost_usd: number;
  controller_wh_day: number;
  pump_wh_per_hour: number;
  validation: Validation;
  questions: string[];
  instructions: string[];
  firmware: string;
};
export type Project = {
  id: number;
  name: string;
  region_id: number;
  deployed: boolean;
  design: Design;
  messages: { id: number; role: string; text: string }[];
  versions: { version: number; design: Design }[];
};
