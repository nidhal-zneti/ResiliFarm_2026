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
export type FarmDraft = { region_id: number } & Partial<Omit<Farm, "region_id">>;
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
  is_measured: boolean;
  updated_at: string;
  current: {
    temperature_2m: number;
    relative_humidity_2m: number;
    precipitation: number;
    rain: number;
    weather_code: number;
    wind_speed_10m: number;
    wind_direction_10m: number;
    wind_gusts_10m: number;
    shortwave_radiation: number;
    interval_seconds: number;
  };
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
export type SoilModel = {
  source: string;
  kind: "soil_model";
  is_simulated: false;
  is_measured: false;
  coverage: { lat: number; lon: number; scope: string };
  units: { soil_moisture: string; soil_temperature: string };
  updated_at: string;
  current: Record<string, number | null>;
  hourly: ({ time: string } & Record<string, number | null>)[];
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
  calculation: Calculation | null;
  fields: Field[];
  devices: { id: number; name: string }[];
  network: Network | null;
  risks: { heat: number; drought: number } | null;
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
  material_estimate?: MaterialEstimate;
  farm_context?: Record<string, unknown>;
  controller_wh_day: number;
  pump_wh_per_hour: number;
  validation: Validation;
  questions: string[];
  instructions: string[];
  firmware: string;
  firmware_generation?: FirmwareGeneration;
};
export type FirmwareGeneration = {
  source: "provider" | "template";
  model: string;
  generated_at: string;
  based_on_version: number;
  board: "esp32-devkit";
  relay_active_low: boolean;
  temperature_sensor: "none" | "sht31";
  hardware_notes: string;
  requirements: string;
  libraries: string[];
  setup_steps: string[];
  assumptions: string[];
  limitations: string[];
  pin_map: { name: string; symbol: string; gpio: number; mode: string; component: string }[];
  compile_status: "not_checked" | "passed";
  hardware_tested: boolean;
  outputs_enabled: boolean;
};
export type MaterialEstimate = {
  currency: "TND" | "JPY" | null;
  priced_subtotal: number | null;
  subtotal_low?: number | null;
  subtotal_high?: number | null;
  accuracy_validated?: boolean;
  model_estimate_status?: string;
  complete: boolean;
  status: string;
  warnings: string[];
  irrigation_sizing?: {
    area_ha: number | null;
    geometry_area_ha: number | null;
    area_difference_pct: number | null;
    row_count: number | null;
    rows_per_zone: number[];
    lateral_lines_per_row: number | null;
    total_lateral_length_m: number | null;
    emitters_per_lateral: number | null;
    total_emitters: number | null;
    zone_flows_lpm: number[];
    max_zone_flow_lpm: number | null;
    source_flow_lpm: number | null;
    source_flow_sufficient: boolean | null;
    assumptions: string[];
    warnings: string[];
  } | null;
  items: {
    key: string;
    label: string;
    quantity: number | null;
    unit: string;
    unit_price: number | null;
    unit_price_low?: number | null;
    unit_price_high?: number | null;
    line_total: number | null;
    line_total_low?: number | null;
    line_total_high?: number | null;
    price_basis?: "comparable_listings" | "model_estimate" | "unpriced";
    assumptions?: string[];
    sources?: { title: string; url: string; fetched_at: number | null }[];
    currency: string;
    source_url: string | null;
    source_title: string | null;
    price_checked_at: string | null;
    source_fetched_at: number | null;
  }[];
};
export type StudioAssistantPayload = {
  answer_basis?: "sources_and_model" | "model_estimate";
  source_status?: string;
  intent?: "answer" | "followup" | "estimate";
  question_key?: string | null;
  pending_field?: string | null;
  reply_key?: string;
  citations?: { title: string; url: string; fetched_at: number | null }[];
  estimate?: MaterialEstimate;
};
export type StudioChatMessage = {
  id: number;
  role: "user" | "assistant";
  text: string;
  payload?: StudioAssistantPayload | null;
};
export type StudioConversation = {
  id: number;
  user_id: number;
  region_id: number;
  title: string;
  context: Record<string, unknown>;
  project_id: number | null;
  messages: StudioChatMessage[];
};
export type StudioAssistantResponse = {
  conversation: StudioConversation;
  result: StudioAssistantPayload & { reply?: string; project?: Project };
};
export type Project = {
  id: number;
  name: string;
  region_id: number;
  deployed: boolean;
  design: Design;
  messages: StudioChatMessage[];
  versions: { version: number; design: Design }[];
};
export type Role = "FARMER" | "AGRONOMIST" | "ADMIN";
export type User = {
  id: number;
  email: string;
  full_name: string;
  role: Role;
  created_at: string;
};
export type AuthResponse = {
  token: string;
  user: User;
};
export type FarmSummary = {
  id: number;
  name: string;
  region_id: number;
  region: string;
  owner_id: number | null;
  owner: string | null;
};
export type FarmFieldReading = {
  id: number;
  name: string;
  area_ha: number;
  lat: number;
  lon: number;
  crop: string;
  moisture_pct: number;
};
export type RecommendationReview = {
  status: "validated" | "rejected" | "modified";
  note: string;
  reviewed_by: number;
};
export type SavedRecommendationReview = RecommendationReview & {
  id: number;
  reviewer_name: string | null;
  created_at: string;
  can_manage: boolean;
};
export type AgronomistFarm = {
  id: number;
  name: string;
  farmer_id: number | null;
  farmer_name: string | null;
  region: { id: number; name: string; lat: number; lon: number; climate: string };
  zone: string;
  fields: FarmFieldReading[];
  sensors: {
    soil_moisture_pct: number;
    temperature_c: number;
    humidity_pct: number;
    et0_mm: number;
    rain_mm: number;
    is_simulated: boolean;
  };
  analysis: { stress: number; action: string; heat_risk: number; drought_risk: number };
  recommendation: { action: string; water_m3: number; net_mm: number; gross_mm: number };
  stats: {
    water_m3_day: number;
    water_m3_7d: number;
    pump_kwh_7d: number;
    solar_kwh_7d: number;
  };
  review: SavedRecommendationReview | null;
  reviews: SavedRecommendationReview[];
};
export type AgronomistDashboard = {
  farmers: { id: number; name: string; email: string }[];
  selected_farmer: { id: number; name: string; email: string } | null;
  farms: AgronomistFarm[];
};
