"""Fast local Arduino starter generation with an explicit ESP32 pin configuration."""
import os
import re
import subprocess
import tempfile
from datetime import datetime, timezone
from pathlib import Path

from .schemas import FirmwareInput

ROOT = Path(__file__).resolve().parents[2]
TOOLCHAIN = ROOT / '.local/arduino'


class FirmwareUnavailable(RuntimeError):
    pass


class FirmwareConfigurationError(ValueError):
    pass


def pin_plan(design, settings):
    options = design['options']
    bom = {part['key']: part for part in design.get('bom', [])}
    requested_zones = options.get('irrigation_valves') or options.get('valves') or bom.get('relay', {}).get('quantity') or 1
    requested_sensors = bom.get('soil', {}).get('quantity') or options.get('soil_count', 1)
    # Classic ESP32 only. Reserve flow, pressure, I2C and optional radio pins.
    outputs = [25, 14, 13] if options.get('lora') else [25, 14, 13, 23, 18, 19]
    analog = [32, 33, 34, 35, 36] if options.get('pressure') else [32, 33, 34, 35, 36, 39]
    if not isinstance(requested_zones, int) or requested_zones < 1 or not isinstance(requested_sensors, int) or requested_sensors < 1:
        raise FirmwareConfigurationError('firmwarePinCapacity')
    zones = min(requested_zones, len(outputs))
    count = min(requested_sensors, len(analog))

    def connected_gpio(source, target, default, contains=None):
        for wire in design.get('connections', []):
            if wire.get('source') != source or wire.get('target') != target:
                continue
            if contains and contains not in wire.get('signal', ''):
                continue
            match = re.search(r'(?:GPIO\s*|digital output\s*)(\d+)', wire.get('signal', ''), re.I)
            if match:
                return int(match.group(1))
        return default

    pump_pin = connected_gpio('esp32', 'driver', 26)
    valve_pins = [connected_gpio('esp32', f'relay:{i + 1}', outputs[i], 'digital output')
                  for i in range(zones)]
    soil_pins = [connected_gpio(f'soil:{i + 1}', 'esp32', analog[i], 'ADC GPIO')
                 for i in range(count)]
    pins = [{'name': 'Pump relay', 'symbol': 'PUMP_PIN', 'gpio': pump_pin, 'mode': 'output', 'component': 'pump'}]
    pins += [{'name': f'Zone {i + 1} valve relay', 'symbol': f'VALVE_{i + 1}_PIN',
              'gpio': pin, 'mode': 'output', 'component': f'valve:{i + 1}'} for i, pin in enumerate(valve_pins)]
    pins += [{'name': f'Soil sensor {i + 1}', 'symbol': f'SOIL_{i + 1}_PIN',
              'gpio': pin, 'mode': 'analog', 'component': f'soil:{i + 1}'} for i, pin in enumerate(soil_pins)]
    if options.get('flow'):
        pins.append({'name': 'Flow pulse input (3.3 V)', 'symbol': 'FLOW_PIN', 'gpio': connected_gpio('levelShift', 'esp32', 27, 'GPIO 27'), 'mode': 'input', 'component': 'flow'})
    if options.get('pressure'):
        pins.append({'name': 'Pressure ADC (conditioned to 3.3 V)', 'symbol': 'PRESSURE_PIN', 'gpio': connected_gpio('levelShift', 'esp32', 39, 'GPIO 39'), 'mode': 'analog', 'component': 'pressure'})
    if settings.temperature_sensor == 'sht31':
        pins.extend([
            {'name': 'SHT31 SDA', 'symbol': 'I2C_SDA_PIN', 'gpio': 21, 'mode': 'bus', 'component': 'temperature'},
            {'name': 'SHT31 SCL', 'symbol': 'I2C_SCL_PIN', 'gpio': 22, 'mode': 'bus', 'component': 'temperature'},
        ])
    if options.get('lora'):
        pins.extend({'name': name, 'symbol': symbol, 'gpio': pin, 'mode': 'bus', 'component': 'lora'} for name, symbol, pin in [
            ('LoRa SCK', 'LORA_SCK_PIN', 18), ('LoRa MISO', 'LORA_MISO_PIN', 19),
            ('LoRa MOSI', 'LORA_MOSI_PIN', 23), ('LoRa CS', 'LORA_CS_PIN', 5),
            ('LoRa IRQ', 'LORA_IRQ_PIN', 4), ('LoRa reset', 'LORA_RESET_PIN', 16),
        ])
    gpios = [pin['gpio'] for pin in pins]
    if len(gpios) != len(set(gpios)):
        # Older blueprints may contain the old GPIO 26 pump/valve collision.
        # Reconcile those legacy assignments with the current blueprint pin plan.
        for pin in pins:
            if pin['component'] == 'pump': pin['gpio'] = 26
            elif pin['component'].startswith('valve:'):
                pin['gpio'] = outputs[int(pin['component'].split(':')[1]) - 1]
            elif pin['component'].startswith('soil:'):
                pin['gpio'] = analog[int(pin['component'].split(':')[1]) - 1]
            elif pin['component'] == 'flow': pin['gpio'] = 27
            elif pin['component'] == 'pressure': pin['gpio'] = 39
        gpios = [pin['gpio'] for pin in pins]
        if len(gpios) != len(set(gpios)):
            raise FirmwareConfigurationError('firmwarePinConflict')
    return pins, zones


def configuration(pins, zones, active_low):
    soil = [pin['symbol'] for pin in pins if pin['component'].startswith('soil:')]
    valves = [pin['symbol'] for pin in pins if pin['component'].startswith('valve:')]
    declarations = '\n'.join(f"constexpr uint8_t {pin['symbol']} = {pin['gpio']};" for pin in pins)
    return '''// ResiliFarm AI: Arduino-ESP32 (classic ESP32 Dev Module).
// See firmware_manifest.json for compilation status. Not hardware-tested.
// Verify the firmware pin map, relay polarity and sensor calibration before use.
// Outputs are DISABLED by default. Review and commission before changing this flag.
#include <Arduino.h>
constexpr bool OUTPUTS_ENABLED = false;
constexpr bool RELAY_ACTIVE_LOW = ''' + ('true' if active_low else 'false') + ''';
constexpr unsigned long MAX_PUMP_RUN_MS = 120000;
''' + declarations + f'''
constexpr uint8_t SOIL_PINS[] = {{{', '.join(soil)}}};
constexpr uint8_t VALVE_PINS[] = {{{', '.join(valves)}}};
constexpr size_t SOIL_SENSOR_COUNT = {len(soil)};
constexpr size_t ZONE_COUNT = {zones};
''' + '''bool pumpOn = false;
bool valveOn[ZONE_COUNT] = {};
bool outputFault = false;
unsigned long pumpStartedAt = 0;

void writeRelay(uint8_t pin, bool on) {
  if (OUTPUTS_ENABLED) digitalWrite(pin, (on != RELAY_ACTIVE_LOW) ? HIGH : LOW);
}
void setPump(bool on) {
  bool openValve = false;
  for (size_t i = 0; i < ZONE_COUNT; ++i) openValve |= valveOn[i];
  on = on && openValve && !outputFault;
  if (on && !pumpOn) pumpStartedAt = millis();
  pumpOn = on;
  writeRelay(PUMP_PIN, on);
}
void setValve(size_t zone, bool on) {
  if (zone >= ZONE_COUNT) return;
  valveOn[zone] = on && !outputFault;
  writeRelay(VALVE_PINS[zone], valveOn[zone]);
  if (pumpOn) setPump(true);
}
void stopAll() {
  setPump(false);
  for (size_t i = 0; i < ZONE_COUNT; ++i) setValve(i, false);
}
void resetOutputFault() { stopAll(); outputFault = false; }
void checkOutputTimeout() {
  if (pumpOn && (unsigned long)(millis() - pumpStartedAt) >= MAX_PUMP_RUN_MS) {
    outputFault = true;
    stopAll();
    Serial.println("Pump runtime limit reached; reset required.");
  }
}
void initializeOutputs() {
  // In dry run, leave relay GPIOs as inputs. An external fail-off circuit is required.
  if (!OUTPUTS_ENABLED) return;
  pinMode(PUMP_PIN, OUTPUT);
  writeRelay(PUMP_PIN, false);
  for (size_t i = 0; i < ZONE_COUNT; ++i) {
    pinMode(VALVE_PINS[i], OUTPUT);
    writeRelay(VALVE_PINS[i], false);
  }
}
'''


def validate_code(code, pins):
    """Structural checks only; these do not prove correctness or electrical safety."""
    if re.search(r'```|\b(?:TODO|FIXME|placeholder|pseudocode)\b|\.\.\.', code, re.I):
        raise ValueError('Incomplete sketch')
    clean = re.sub(r'/\*.*?\*/|//[^\n]*|"(?:\\.|[^"\\])*"|\'(?:\\.|[^\'\\])*\'', '', code, flags=re.S)
    for entry in ('setup', 'loop'):
        if len(re.findall(r'\bvoid\s+' + entry + r'\s*\(\s*(?:void)?\s*\)\s*\{', clean)) != 1:
            raise ValueError('Missing entry point')
    # The supplied actuator helpers are the only supported output interface.
    if re.search(r'\b(?:digitalWrite|analogWrite|ledc\w*|gpio_\w*|writeRelay|initializeOutputs)\s*\(|\bOUTPUT\b', clean):
        raise ValueError('Actuator interface bypass')
    reserved = ['OUTPUTS_ENABLED', 'RELAY_ACTIVE_LOW', 'MAX_PUMP_RUN_MS', 'ZONE_COUNT', 'SOIL_SENSOR_COUNT',
                'SOIL_PINS', 'VALVE_PINS', 'pumpOn', 'valveOn', 'outputFault', 'pumpStartedAt',
                'soilMoisturePct', 'soilValid', 'zoneDemand', 'sensorFault', 'manualStopped'] + [pin['symbol'] for pin in pins]
    for name in reserved:
        if re.search(r'\b' + name + r'\s*(?:\[[^\]]*\]\s*)?(?:=(?!=)|\+=|-=|\+\+|--)|#\s*(?:define|undef)\s+' + name + r'\b', clean):
            raise ValueError('Configuration redefinition')
    for name in ('setPump', 'setValve', 'stopAll', 'resetOutputFault', 'checkOutputTimeout'):
        if re.search(r'\bvoid\s+' + name + r'\s*\(', clean):
            raise ValueError('Helper redefinition')
    if re.search(r'\b(?:delay|readString|setPump|setValve|stopAll|resetOutputFault|analogRead|digitalRead|pinMode|attachInterrupt)\s*\(|#\s*(?:include|define|undef)', clean):
        raise ValueError('Unsupported hardware or blocking call')
    for required in ('requestWater',):
        if not re.search(r'\b' + required + r'\s*\(', clean):
            raise ValueError('Missing control implementation')
    if len(re.findall(r'\bif\s*\(', clean)) < 2:
        raise ValueError('Missing control decisions')
    for include in re.findall(r'#\s*include\s*[<"]([^>"]+)[>"]', code):
        if not re.fullmatch(r'[A-Za-z0-9_]+\.h', include):
            raise ValueError('Unsupported include path')
    if clean.count('{') != clean.count('}'):
        raise ValueError('Truncated code')
    calls = set(re.findall(r'\b([A-Za-z_]\w*)\s*\(', clean))
    if calls - {'setup', 'loop', 'if', 'for', 'while', 'requestWater', 'setControlTiming', 'float', 'int', 'size_t'}:
        raise ValueError('Unsupported decision API')
    if re.search(r'\bwhile\s*\(', clean):
        raise ValueError('Unbounded control loop')
    declarations = set(re.findall(r'\b(?:float|double|int|bool|size_t|uint8_t|uint16_t|uint32_t|long)\s+([A-Za-z_]\w*)', clean))
    known = declarations | {'setup', 'loop', 'if', 'else', 'for', 'return', 'continue', 'break',
                            'void', 'const', 'constexpr', 'static', 'unsigned', 'long', 'float', 'double', 'int',
                            'bool', 'size_t', 'uint8_t', 'uint16_t', 'uint32_t', 'true', 'false',
                            'ZONE_COUNT', 'SOIL_SENSOR_COUNT', 'soilMoisturePct', 'soilValid', 'zoneDemand',
                            'requestWater', 'setControlTiming'}
    # C++ numeric suffixes (30.0f, 60000UL) are part of literals, not identifiers.
    identifiers = re.sub(r'\b\d+(?:\.\d*)?(?:[eE][+-]?\d+)?(?:[fFlLuU]+)?\b', '', clean)
    if set(re.findall(r'\b[A-Za-z_]\w*\b', identifiers)) - known:
        raise ValueError('Undefined or unsupported symbol')


def sensor_runtime(pins, temperature):
    """Shared drivers and actuator scheduling, included in the downloadable sketch."""
    symbols = {pin['symbol'] for pin in pins}
    code = '''
#include <math.h>
// Calibration examples: replace with measurements from each installed sensor.
constexpr int SOIL_DRY_ADC = 3000;
constexpr int SOIL_WET_ADC = 1200;
constexpr bool CALIBRATION_CONFIRMED = false;
constexpr float FLOW_PULSES_PER_LITRE = 0; // Set from calibrated flow meter.
constexpr float PRESSURE_ZERO_V = 0; // Voltage at ESP32 ADC, after conditioning.
constexpr float PRESSURE_FULL_V = 0;
constexpr float PRESSURE_FULL_BAR = 0;
float soilMoisturePct[SOIL_SENSOR_COUNT] = {};
bool soilValid[SOIL_SENSOR_COUNT] = {};
bool zoneDemand[ZONE_COUNT] = {};
bool sensorFault = true;
bool manualStopped = true; // Send RESET to start after inspecting status.
float flowLpm = NAN, pressureBar = NAN, temperatureC = NAN;
unsigned long maxWateringMs = 60000, minRestMs = 600000;
unsigned long lastWateredAt[ZONE_COUNT] = {};
bool wateredBefore[ZONE_COUNT] = {};
int activeZone = -1;
size_t nextZone = 0;
unsigned long zoneStartedAt = 0;
volatile uint32_t flowPulseCount = 0;
void IRAM_ATTR onFlowPulse() { ++flowPulseCount; }
void requestWater(size_t zone, bool needed) {
  if (zone < ZONE_COUNT) zoneDemand[zone] = needed;
}
void setControlTiming(unsigned long waterMs, unsigned long restMs) {
  maxWateringMs = constrain(waterMs, 1000UL, MAX_PUMP_RUN_MS);
  minRestMs = constrain(restMs, 1000UL, 86400000UL);
}
void finishZone(unsigned long now) {
  stopAll();
  if (activeZone >= 0) {
    lastWateredAt[activeZone] = now;
    wateredBefore[activeZone] = true;
    nextZone = (activeZone + 1) % ZONE_COUNT;
  }
  activeZone = -1;
}
void tickIrrigation(unsigned long now) {
  if (manualStopped || sensorFault || outputFault || (OUTPUTS_ENABLED && !CALIBRATION_CONFIRMED)) {
    finishZone(now); return;
  }
  if (activeZone >= 0) {
    if (!zoneDemand[activeZone] || (unsigned long)(now - zoneStartedAt) >= maxWateringMs) finishZone(now);
    return;
  }
  for (size_t n = 0; n < ZONE_COUNT; ++n) {
    size_t z = (nextZone + n) % ZONE_COUNT;
    if (zoneDemand[z] && (!wateredBefore[z] || (unsigned long)(now - lastWateredAt[z]) >= minRestMs)) {
      activeZone = z; zoneStartedAt = now;
      setValve(z, true); setPump(true); break;
    }
  }
}
void readSerialCommands() {
  static char command[12]; static size_t used = 0;
  // Bounded, nonblocking serial input. Commands end with newline.
  for (int n = 0; n < 32 && Serial.available(); ++n) {
    char ch = Serial.read();
    if (ch == '\\r') continue;
    if (ch == '\\n') {
      command[used] = 0;
      if (strcmp(command, "STOP") == 0) { manualStopped = true; finishZone(millis()); }
      if (strcmp(command, "RESET") == 0) { finishZone(millis()); resetOutputFault(); manualStopped = false; }
      used = 0;
    } else if (used < sizeof(command) - 1) command[used++] = ch;
  }
}
'''
    if temperature == 'sht31':
        code += '#include <Wire.h>\n#include <Adafruit_SHT31.h>\nAdafruit_SHT31 sht31;\nbool sht31Ready = false;\n'
    if 'LORA_CS_PIN' in symbols:
        code += '''#include <SPI.h>
#include <LoRa.h>
constexpr long LORA_FREQUENCY_HZ = 0; // Set a permitted frequency for your hardware/location.
bool radioReady = false;
'''
    code += 'void initializeSensors() {\n  analogReadResolution(12);\n'
    if 'FLOW_PIN' in symbols:
        code += '  pinMode(FLOW_PIN, INPUT_PULLUP);\n  attachInterrupt(digitalPinToInterrupt(FLOW_PIN), onFlowPulse, RISING);\n'
    if temperature == 'sht31':
        code += '  Wire.begin(I2C_SDA_PIN, I2C_SCL_PIN);\n  sht31Ready = sht31.begin(0x44);\n  if (!sht31Ready) Serial.println("SHT31 unavailable; temperature is NaN.");\n'
    if 'LORA_CS_PIN' in symbols:
        code += '''  if (LORA_FREQUENCY_HZ > 0) {
    SPI.begin(LORA_SCK_PIN, LORA_MISO_PIN, LORA_MOSI_PIN, LORA_CS_PIN);
    LoRa.setPins(LORA_CS_PIN, LORA_RESET_PIN, LORA_IRQ_PIN);
    radioReady = LoRa.begin(LORA_FREQUENCY_HZ);
  }
'''
    code += '''}
void sampleSensors(unsigned long now) {
  static unsigned long lastSample = 0;
  unsigned long elapsed = now - lastSample;
  if (elapsed < 1000) return;
  lastSample = now;
  sensorFault = false;
  for (size_t i = 0; i < SOIL_SENSOR_COUNT; ++i) {
    int raw = analogRead(SOIL_PINS[i]);
    soilValid[i] = raw > 10 && raw < 4085 && SOIL_DRY_ADC != SOIL_WET_ADC;
    soilMoisturePct[i] = soilValid[i] ? constrain(100.0f * (SOIL_DRY_ADC - raw) / (SOIL_DRY_ADC - SOIL_WET_ADC), 0.0f, 100.0f) : NAN;
    sensorFault |= !soilValid[i];
  }
'''
    if 'FLOW_PIN' in symbols:
        code += '''  noInterrupts(); uint32_t pulses = flowPulseCount; flowPulseCount = 0; interrupts();
  flowLpm = FLOW_PULSES_PER_LITRE > 0 ? pulses * 60000.0f / (FLOW_PULSES_PER_LITRE * elapsed) : NAN;
'''
    if 'PRESSURE_PIN' in symbols:
        code += '''  float volts = analogReadMilliVolts(PRESSURE_PIN) / 1000.0f;
  pressureBar = (PRESSURE_FULL_V > PRESSURE_ZERO_V && PRESSURE_FULL_BAR > 0)
    ? (volts - PRESSURE_ZERO_V) * PRESSURE_FULL_BAR / (PRESSURE_FULL_V - PRESSURE_ZERO_V) : NAN;
'''
    if temperature == 'sht31':
        code += '  temperatureC = sht31Ready ? sht31.readTemperature() : NAN;\n'
    code += '''  Serial.printf("dryRun=%d stopped=%d sensorFault=%d outputFault=%d zone=%d pump=%d flowLpm=%.2f pressureBar=%.2f tempC=%.1f\\n",
    !OUTPUTS_ENABLED, manualStopped, sensorFault, outputFault, activeZone, pumpOn, flowLpm, pressureBar, temperatureC);
  for (size_t i = 0; i < SOIL_SENSOR_COUNT; ++i) Serial.printf("soil%u=%.1f%% valid=%d\\n", (unsigned)i + 1, soilMoisturePct[i], soilValid[i]);
'''
    if 'LORA_CS_PIN' in symbols:
        code += '''  static unsigned long lastRadio = 0;
  if (radioReady && now - lastRadio >= 60000 && !LoRa.isTransmitting()) {
    lastRadio = now; LoRa.beginPacket(); LoRa.print(soilMoisturePct[0]); LoRa.endPacket(true);
  }
'''
    return code + '}\n'


def compile_sketch(code):
    """Use a workspace-installed Arduino toolchain when available; never flash hardware."""
    if os.getenv('FIRMWARE_COMPILE', '').strip() != '1':
        return 'not_checked'
    compiler = TOOLCHAIN / 'arduino-cli.exe'
    config = TOOLCHAIN / 'arduino-cli.yaml'
    if not compiler.is_file() or not config.is_file():
        return 'not_checked'
    build_root = ROOT / '.local/firmware-builds'
    build_root.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(dir=build_root) as folder:
        folder = Path(folder)
        sketch = folder / 'resilifarm'
        sketch.mkdir()
        (sketch / 'resilifarm.ino').write_text(code, encoding='utf-8')
        try:
            result = subprocess.run([str(compiler), '--config-file', str(config), 'compile',
                                     '--fqbn', 'esp32:esp32:esp32', '--build-path', str(folder / 'build'), str(sketch)],
                                    cwd=ROOT, capture_output=True, text=True, encoding='utf-8', errors='replace',
                                    timeout=180, creationflags=subprocess.CREATE_NO_WINDOW if hasattr(subprocess, 'CREATE_NO_WINDOW') else 0)
        except (OSError, subprocess.TimeoutExpired) as exc:
            raise FirmwareUnavailable('firmwareCompileFailed') from exc
        if result.returncode:
            raise FirmwareUnavailable('firmwareCompileFailed')
    return 'passed'


def generate_firmware(design, request: FirmwareInput):
    pins, zones = pin_plan(design, request)
    options = design['options']
    greenhouse = design.get('greenhouse') or {}
    setpoints = greenhouse.get('setpoints') or options.get('zone_profile') or {}
    moisture_range = setpoints.get('soil_moisture_pct')
    dry_pct, wet_pct = (moisture_range if isinstance(moisture_range, (list, tuple)) and len(moisture_range) == 2 else (30, 45))
    try:
        dry_pct, wet_pct = float(dry_pct), float(wet_pct)
    except (TypeError, ValueError):
        dry_pct, wet_pct = 30.0, 45.0
    if not 0 <= dry_pct < wet_pct <= 100:
        dry_pct, wet_pct = 30.0, 45.0
    logic = f'''const float DRY_PCT = {dry_pct:.1f}f;
const float WET_PCT = {wet_pct:.1f}f;
void setup() {{ setControlTiming(60000UL, 600000UL); }}
void loop() {{
  for (size_t zone = 0; zone < ZONE_COUNT; ++zone) {{
    size_t sensor = zone % SOIL_SENSOR_COUNT;
    if (!soilValid[sensor]) {{ requestWater(zone, false); continue; }}
    if (soilMoisturePct[sensor] < DRY_PCT) {{ requestWater(zone, true); }}
    else if (soilMoisturePct[sensor] > WET_PCT) {{ requestWater(zone, false); }}
  }}
}}
'''
    validate_code(logic, pins)
    logic = re.sub(r'\bvoid\s+setup\s*\(\s*(?:void)?\s*\)', 'void generatedSetup()', logic)
    logic = re.sub(r'\bvoid\s+loop\s*\(\s*(?:void)?\s*\)', 'void generatedLoop()', logic)
    code = configuration(pins, zones, request.relay_active_low) + sensor_runtime(pins, request.temperature_sensor) + '\n// ResiliFarm local irrigation starter logic\n' + logic + '''

void setup() { Serial.begin(115200); initializeOutputs(); initializeSensors(); generatedSetup(); }
void loop() {
  checkOutputTimeout(); readSerialCommands(); sampleSensors(millis());
  generatedLoop(); tickIrrigation(millis()); checkOutputTimeout();
}
'''
    libraries = (['Adafruit SHT31 Library', 'Adafruit BusIO'] if request.temperature_sensor == 'sht31' else [])
    if design['options'].get('lora'): libraries.append('LoRa by Sandeep Mistry')
    requested_sensors = next((part['quantity'] for part in design.get('bom', []) if part['key'] == 'soil'), options.get('soil_count', 1))
    requested_zones = options.get('irrigation_valves') or options.get('valves') or zones
    limitations = ['Starter control covers soil-moisture irrigation; it does not operate greenhouse climate actuators.',
                   'Outputs stay disabled until wiring, relay polarity and sensor calibration are checked.']
    if request.requirements.strip():
        limitations.append('Custom control requirements are recorded but not interpreted by the fixed starter template.')
    if requested_sensors > sum(pin['component'].startswith('soil:') for pin in pins):
        limitations.append(f'Blueprint lists {requested_sensors} soil sensors; only the available ESP32 ADC inputs are mapped in this sketch.')
    if requested_zones > zones:
        limitations.append(f'Blueprint lists {requested_zones} irrigation zones; this sketch maps {zones} available relay outputs.')
    return {
        'code': code, 'source': 'template', 'model': 'ResiliFarm local irrigation template',
        'generated_at': datetime.now(timezone.utc).isoformat(), 'based_on_version': request.version,
        'board': request.board, 'relay_active_low': request.relay_active_low,
        'temperature_sensor': request.temperature_sensor, 'hardware_notes': request.hardware_notes,
        'requirements': request.requirements, 'pin_map': pins,
        'libraries': libraries,
        'setup_steps': ['Measure and enter dry/wet ADC calibration values for the installed soil probes.',
                        'Review the generated pin map against the blueprint and physical wiring.',
                        'Keep OUTPUTS_ENABLED false until the relay driver and fail-off behavior are checked.'],
        'assumptions': [f'Moisture hysteresis uses {dry_pct:g}% dry and {wet_pct:g}% wet thresholds; edit these after calibration.',
                        f'Relay polarity is set to {"active-low" if request.relay_active_low else "active-high"}; verify the installed module before enabling outputs.',
                        'Zones share soil sensors round-robin when there are fewer mapped sensors than zones.',
                        'Maximum pump run is limited to 120 seconds; each zone rests for at least 10 minutes.'],
        'limitations': limitations,
        'compile_status': compile_sketch(code), 'hardware_tested': False, 'outputs_enabled': False,
        'checks': ['templateStructure', 'entryPoints', 'pinAllocation', 'actuatorInterface'],
    }
