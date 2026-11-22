# ResiliFarm AI

Besbes Bobi · KIZUNA 2026 – ESPRIT

A working local agricultural resilience MVP: React/TypeScript/Vite, FastAPI/Pydantic, SQLAlchemy, Leaflet, Recharts and i18next. PostgreSQL is configured in Docker Compose; SQLite provides a zero-service local alternative. No API key or IoT device is required.

## Run on this Windows workspace

Dependencies have already been installed. From `C:\Users\zanet\Desktop\nidhal`, run these in **two separate PowerShell terminals**:

```powershell
.\.venv\Scripts\python.exe -m uvicorn backend.app.main:app --host 127.0.0.1 --port 8000
```

```powershell
node frontend/node_modules/vite/bin/vite.js frontend --host 127.0.0.1 --port 5173
```

Open http://127.0.0.1:5173. API documentation: http://127.0.0.1:8000/docs. Stop each process with Ctrl+C. If ports are already serving this app, use the running instance instead of starting a duplicate.

In **Agronomist dashboard → Past consultation reviews**, use **Edit review** to change a review's status or note, or **Delete review** and confirm to remove it permanently. Agronomists can manage their own reviews while assigned to that farmer; administrators can manage all reviews. Edits keep the original author and creation time. These actions use `PATCH` and `DELETE /api/v1/farms/{fid}/recommendation/reviews/{review_id}`. Restart a backend running without auto-reload after updating the code, then refresh the page.

## Fresh installation

Python 3.11+ and Node 22+ with pnpm 11 are required. Tested here with Python 3.14 and Node 24.

```powershell
py -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r backend/requirements.txt
cd frontend
pnpm install --frozen-lockfile
cd ..
```

On Linux/macOS replace `py` with `python3` and `.venv\Scripts\python.exe` with `.venv/bin/python`. Standard frontend commands are `pnpm dev` and `pnpm build` inside `frontend`.

Local startup requires **no environment variables**. Initialization stores country, administrative-region and crop-coefficient reference data; it does not create demo farms, fields or networks. Existing generated demo farms, networks and simulated telemetry are removed at startup. To use an existing PostgreSQL server, set `DATABASE_URL=postgresql+psycopg://user:URL_ENCODED_PASSWORD@host:5432/database`. `CORS_ORIGINS` is an optional comma-separated origin list. Local mode reads environment variables directly; it does not load `.env` automatically.

## Docker / PostgreSQL

```powershell
Copy-Item .env.example .env
# Edit .env and set a unique POSTGRES_PASSWORD, then:
docker compose up --build
```

Open http://localhost:8080. Database credentials stay in the backend; no database port is exposed. Compose injects `DB_HOST` and `DB_PASSWORD`, avoiding URL interpolation problems with special characters. The database volume persists. Initialization is idempotent (`metadata.create_all`, region/crop references, and removal of legacy generated samples); this initial schema has no upgrade migration history yet. Docker was unavailable on the development machine, so the Compose/PostgreSQL runtime is **not verified**; SQLite initialization and the PostgreSQL schema compilation are tested.

## Live weather and calculation policy

Choose one of Tunisia’s 24 governorates or Japan’s 47 prefectures. The map marker is the administrative center, not a surveyed farm. The overview requests current conditions and a seven-day forecast from Open-Meteo for that regional model grid. Open-Meteo current conditions are 15-minute weather-model output, not measurements from a local station. The UI labels the model source and its valid time. Successful responses are cached for up to 5 minutes; the app refreshes the selected region every 10 minutes. If the service is unavailable or returns invalid data, the API responds with 503 and displays no replacement samples. Weather requests do not inherit generic `HTTP_PROXY`/`HTTPS_PROXY` settings; if your network requires a proxy, configure `OPEN_METEO_PROXY` for the backend.

ResiliFarm does not require IoT devices. Open-Meteo provides regional and saved farm-coordinate weather-model output plus modeled soil moisture and temperature for the Digital Twin. These are model estimates, not station, field, or sensor measurements. The SoilGrids REST API is temporarily paused by ISRIC; no field-specific soil survey is substituted. Farm flow, pressure, water-network, pump-energy and solar-generation readings still require a configured real source. The app does not invent those values; water-network and energy telemetry remain unavailable. Fruit Ripeness accepts one uploaded photo and saves only prediction metadata; it stays unavailable until a FruitVision model artifact with a held-out evaluation is installed. The regional digital twin map marks administrative centers, not surveyed farms.

Agricultural calculations require every farm value to be entered; there are no prefilled example hectares, crop stage, pump or solar values. Outputs are explicitly labeled calculations using those user-supplied inputs and reference crop coefficients. They are not measured irrigation demand, actual pump use, or calibrated field predictions. If weather-model values are used as inputs, they must remain identified as model output.

Studio remains a design workspace. Its BOM prices/specifications are illustrative and its wiring/firmware are conceptual; the API no longer marks a design as physically deployed without a hardware connector.

## Local pretrained Studio AI

Studio can use **Qwen3 4B Instruct through Ollama** to interpret natural EN/FR/JA requirements, including negative requirements and edits referring to the existing design. Example: “My field has no Wi-Fi and I want solar power.” For design requests, the model proposes typed catalogue options; local code builds the BOM, connections and pump-off starter, and runs compatibility checks. For general agriculture questions, the local model uses retrieved passages when available and can offer clearly labeled general guidance and estimates without them. Neither path generates field measurements or arbitrary firmware.

The Windows runtime lives in `.local/ollama`, and model weights in `.local/models`, excluded from source control. The installer uses the official Ollama **0.40.17** archive with a pinned SHA-256. The `qwen3:4b-instruct` model download is roughly 2.5 GB; allow at least 10 GiB free for installation. Local inference needs no paid API key; performance depends on RAM/GPU memory.

Stop the existing backend before starting this launcher. Keep Vite running in its separate terminal:

```powershell
# First installation only. Existing runtime files are not replaced.
.\.venv\Scripts\python.exe scripts/install_local_ai.py
# Downloads Qwen if missing, starts localhost Ollama, then starts FastAPI.
.\.venv\Scripts\python.exe scripts/run_studio_ai.py --pull
```

Later starts can omit `--pull`. The launcher binds Ollama to `127.0.0.1:11434` and FastAPI to `127.0.0.1:8000`, sets process-local configuration, uses a 4096-token context and one concurrent inference request, and disables Ollama cloud features on servers it starts. It stops an Ollama process it owns when the backend exits; it leaves pre-existing servers running. Starting the ordinary backend without provider variables explicitly selects local rules.

Refresh Studio to see model availability. Each selected version identifies AI or local-rule provenance. AI inference has a 90-second read timeout, with longer browser/proxy timeouts. If a configured model is unavailable, times out or returns invalid options, the API returns `503 / studioAiUnavailable` and saves nothing. It never silently presents rule output as AI. Unsupported requests return `422 / unsupportedRequest`. Strict types, ranges and unknown-field rejection constrain model output, but do not guarantee that every requirement was correctly interpreted: review options and BOM.

Another OpenAI-compatible provider can be configured with backend environment variables `STUDIO_AI_BASE_URL` (including `/v1`), `STUDIO_AI_MODEL` and, if needed, `STUDIO_AI_API_KEY`. It must support JSON-schema `response_format` and `/models`. Partial configuration is an error. Local `.env` files are not loaded automatically; the launcher sets its own local Qwen configuration. Docker does not automatically connect to host Ollama; container `localhost` refers to the container. Optional `STUDIO_AI_*` variables are passed through Compose if you configure a reachable model endpoint. Do not expose this model server publicly.

Opt-in tests against the **real model**, with a disposable SQLite database instead of saved demo projects:

```powershell
.\.venv\Scripts\python.exe scripts/verify_studio_ai.py
```

This checks EN/FR/JA planning, one-sensor edits, removing solar, rejection without persistence and ZIP export. Ordinary pytest tests mock the provider and never contact paid services. Sources: [Qwen model and Apache-2.0 license](https://ollama.com/library/qwen3:4b-instruct), [Ollama Windows runtime](https://docs.ollama.com/windows), [structured outputs](https://docs.ollama.com/capabilities/structured-outputs).

## Studio agriculture assistant

Studio combines best-effort agriculture guidance with a question-led irrigation design flow. The chat covers crop, soil, pest and disease, irrigation, greenhouse and farm-planning questions. When available, passages from allowlisted agriculture sources support the answer. The configured model may supplement them with general knowledge and preliminary estimates, explaining assumptions and uncertainty. Without retrieved sources it still answers, explicitly labeled as general model guidance. It does not claim to know live conditions on an individual farm or to have measured 80–90% accuracy.

Set `TAVILY_API_KEY` in the workspace `.env` to enable optional source retrieval. Copy `.env.example` to `.env` and add the key; the local Studio launcher reads that file without overriding process environment values. This key is separate from Ollama and is not sent to the browser; each question and selected region are sent to Tavily for search. A missing key, failed search or empty result does not block general model guidance. Model configuration remains required for agriculture answers; a failed model call returns an explicit error.

For irrigation designs, the assistant uses the selected administrative region and asks one question at a time for farm area, crop, method, zones and dimensions, water source, flow/head, distance and energy. Drip designs also ask for laterals per crop row, emitter spacing and emitter discharge. Users may answer that a value is unknown; unresolved quantities are excluded from totals, although a unit-price estimate can still be shown. The deterministic layout estimate checks entered area against field dimensions, computes crop rows as `ceil(field_width / row_spacing)`, total lateral length from row count, field length and laterals per row, and emitter count from lateral length and emitter spacing. It divides rows as evenly as possible between zones and estimates each zone's flow from emitter count and rated emitter discharge, then compares the highest zone demand with the stated source flow. Row orientation and rounded emitter counts are labeled assumptions. This is a preliminary flow-demand check, not pipe friction/head-loss analysis, pump-curve matching or engineering validation. Budgets use TND for Tunisia or JPY for Japan. Supplier lookups default off; set `STUDIO_SUPPLIER_DOMAINS_TN` or `STUDIO_SUPPLIER_DOMAINS_JP` only after permission to retrieve and reuse listing data is confirmed. Comparable listing prices produce a min/max planning range and median point estimate, with links to all matching sources. Explicit roll lengths can be converted to per-metre prices. These matches do not establish equivalent specifications or hydraulic suitability.

For unmatched prices, the configured model can propose a low/high budget range and an explicit product assumption from general knowledge, even without source search. These lines are labeled model estimates, carry no supplier links or verified-price timestamp, and use the midpoint as their point estimate. Model output is validated for currency, item keys, finite positive ranges and required assumptions; invalid or unavailable output leaves the affected prices missing while preserving sourced estimates. The subtotal is partial when quantities or prices remain missing. Ranges are planning bounds, not calibrated confidence intervals; no accuracy percentage is asserted. Installation, shipping, taxes and engineering sizing validation are excluded. The assistant request allows up to 180 seconds in the browser and Nginx for search, price estimation and design planning.

Studio displays the minimum available local unit estimate multiplied by quantity, with each line rounded to two decimals before summing. Material budget totals use those same line amounts. The controller blueprint uses matched local estimates and its own component quantities; its summary and category rollup share one subtotal. Missing prices remain unavailable and totals are labeled partial. The BOM CSV exports these minimum local estimates in TND or JPY as well. Stored ranges and midpoint/median values remain available in design data, but legacy USD catalogue prices are not used as display or CSV fallbacks. Controller parts are a subset of the farm materials budget, so those separately labeled totals can differ. The control blueprint, wiring and firmware continue to require qualified engineering review. Existing Studio projects remain available, and the new assistant conversations are tied to the signed-in account.

## Generate microcontroller code

Open a saved Studio project, scroll below the blueprint to **Microcontroller code**, review the active-low relay default (change it if your module differs), optionally select an SHT31 sensor, and click **Generate code**. Hardware notes and wiring are prefilled from the blueprint. Generation is local and does not wait for an AI model. The latest design version is used; generation creates a new immutable version. Earlier versions remain downloadable.

The server assembles a deterministic irrigation starter from a local template, using blueprint zones, mapped soil sensors and crop moisture ranges when present. It includes ESP32 sensor drivers, pin allocation, hysteresis, zone sequencing, maximum runtime checks and serial `STOP`/`RESET` commands. Generation does not call the model. Outputs are disabled by default, and moisture calibration values must be measured and edited before use. An edit made during generation causes a version conflict instead of overwriting newer work.

Supported hardware is the **classic ESP32 Dev Module**, analog soil sensors, pump and valve relays, optional flow/pressure inputs, optional SHT31 and optional LoRa. Greenhouse designs produce irrigation code only; fans, vents, cooling, CO2 and other climate hardware are listed as limitations and are not controlled. When a blueprint exceeds available pins, the sketch maps only the supported sensors/zones and reports the omitted hardware. Wi-Fi/cloud connectivity, other sensor drivers, expansion boards and physical deployment are not implemented. Hardware notes do not automatically configure driver calibration. Calibrate the constants in the downloaded program; LoRa frequency must be configured for the actual radio/location.

The panel provides code preview, `.ino` download, a firmware-specific pin map, libraries, setup steps, assumptions and limitations. The project ZIP includes `resilifarm/resilifarm.ino`, `firmware_manifest.json`, `firmware_pins.csv` and `firmware_setup.txt`. Use the firmware pin map; the earlier conceptual connections may differ. Outputs and calibration confirmation are disabled by default; the program starts stopped and accepts `RESET` after review. Compilation is not evidence of electrical safety or hardware validation.

For automatic compilation on this Windows workspace, place the official [Arduino CLI](https://docs.arduino.cc/arduino-cli/installation) at `.local/arduino/arduino-cli.exe`. Configure its data, downloads and user directories inside `.local/arduino`, using `.local/arduino/arduino-cli.yaml`:

```powershell
$arduinoRoot = Join-Path (Get-Location) '.local/arduino'
@{
  directories = @{ data = "$arduinoRoot/data"; downloads = "$arduinoRoot/downloads"; user = "$arduinoRoot/user" }
  board_manager = @{ additional_urls = @('https://espressif.github.io/arduino-esp32/package_esp32_index.json') }
} | ConvertTo-Json -Depth 5 | Set-Content "$arduinoRoot/arduino-cli.yaml" -Encoding UTF8
.\.local\arduino\arduino-cli.exe --config-file .local/arduino/arduino-cli.yaml core update-index
.\.local\arduino\arduino-cli.exe --config-file .local/arduino/arduino-cli.yaml core install esp32:esp32@4.0.0
.\.local\arduino\arduino-cli.exe --config-file .local/arduino/arduino-cli.yaml lib install "Adafruit SHT31 Library" "Adafruit BusIO" "LoRa"
```

This uses Espressif's [official board package](https://docs.espressif.com/projects/arduino-esp32/en/latest/installing.html). Fast generation skips compilation by default. Set `FIRMWARE_COMPILE=1` on the backend to compile for `esp32:esp32:esp32` before saving; a compiler error or timeout returns `firmwareCompileFailed` without saving. The UI and ZIP manifest distinguish successful compilation from skipped compilation. Nothing flashes or controls a device.

Verification commands (the real-model script uses a disposable database and leaves saved projects untouched):

```powershell
.\.venv\Scripts\python.exe -m pytest backend/tests/test_firmware.py -q
.\.venv\Scripts\python.exe scripts/verify_firmware_ai.py --require-compile --all-drivers
cd frontend
pnpm.cmd test:firmware
pnpm.cmd build
```

The opt-in script saves the verified `.ino`, ZIP and result summary under `.local/firmware-verification/`. Unit tests mock inference and compilation; they cover invalid responses, GPIO capacity, immutable versions, stale requests, compiler failures without persistence, and ZIP consistency. Frontend checks cover generation availability and compilation status in EN/FR/JA/AR.

## Methods and scope

- `ETc = Kc × ET0`; effective rain = `0.8 × rain`; net depth = `max(0, ETc − effective rain)`; gross depth = `net / irrigation efficiency`; water = `10 × gross mm × ha`.
- Pump energy = `1000 × 9.81 × volume × head / (efficiency × 3,600,000)` kWh. Solar = `kWp × equivalent sun hours × 0.8`. Daily irradiance in MJ/m² converts to equivalent hours by dividing by 3.6; no panel tilt or temperature correction is modeled.
- Farm-specific water flow, pressure and network data are unavailable until a suitable real sensor source or supported farm configuration is connected. No IoT meter is required; the prior illustrative network formula is not exposed as live data. Open-Meteo's soil values shown in the Digital Twin are explicitly labeled as model estimates.
- Agricultural calculation results are estimates from user-entered values and reference crop coefficients; they are never reported as measured field outcomes.
- Scenario demo endpoints remain unavailable until suitable trusted online data sources and validated methods are integrated. The former cybersecurity section is now Fruit Ripeness, using a local FruitVision AB classifier when a validated model is installed. Uploaded photos are never persisted. This image estimate is not a substitute for direct inspection.
- Fruit Ripeness uses the upstream FruitVision Member 1 AB preprocessing and Lab/HSV colour plus contour-shape features. FruitVision does not publish trained weights. The referenced Kaggle dataset is CC BY-SA 4.0 and is attributed in `.local/fruitvision/DATASET_ATTRIBUTION.txt`; it is about 3.9 GB and is kept, with prepared images and model files, under ignored `.local/`. To prepare a clean workspace, run `python scripts/prepare_fruitvision_dataset.py`, then run `python scripts/train_fruitvision_model.py apple --dataset .local/fruitvision/prepared --dataset-name "Fruit Ripeness: Unripe, Ripe, and Rotten" --dataset-url "https://www.kaggle.com/datasets/leftin/fruit-ripeness-unripe-ripe-and-rotten" --dataset-license "CC BY-SA 4.0"` for each dataset-supported fruit. Training uses no more than 3,000 images per class and evaluates against the separate Kaggle test split, reporting accuracy and per-class metrics after FruitVision?s single-fruit shape check. Only fruits with valid evaluation manifests are enabled. Inspect the metrics before relying on a result; image estimates are not field-validated.
- Studio defaults to deterministic catalogue templates and recognizes supported EN/FR/JA edit phrases. An optional OpenAI-compatible planner can be configured with `STUDIO_AI_BASE_URL`, `STUDIO_AI_API_KEY` and `STUDIO_AI_MODEL`; it is not required for this demo, and generation provenance is recorded. Its six-view blueprint workspace uses React Flow and Three.js; the mechanical massing model and STL are conceptual blocks, not manufacturing CAD. Wiring pins are illustrative, must be checked against datasheets, and are not a reviewed schematic. The controller catalogue remains illustrative; farm-material budgets distinguish comparable supplier listings from model estimates and exclude unresolved quantities/prices from totals. Automatic pump sizing and hydraulic validation are not performed.
- Unsupported Studio requests such as “robot” return HTTP 422 with `error.code = unsupportedRequest` and a localized explanation in the UI. They do not create a project, version, message or connection. New-project planning preferences are validated separately from the original request; successful response shapes are unchanged.
- Initial designs contain an **uncompiled, dry-run starter**. The separate **Generate code** action produces an LLM-assisted full sketch as described above, with explicit compilation status. Physical commissioning and hardware validation remain outstanding. The 60 W pump is a bench example, not a 5 ha irrigation pump. Hardware proposals require qualified review.
- The database retains region and crop-reference metadata. Generated demo farms, fields, networks and simulated records are cleaned during initialization. IoT ingestion is not required. Open-Meteo supplies regional weather-model data; the optional Studio assistant retrieves cited agriculture sources and supplier listings. No farm-boundary, soil, water-network, pump-energy or solar-generation feed is integrated.
- Localhost demo authentication supports farmer self-registration and admin-provisioned accounts. It has no rate limits or production hardening and is not suitable for public deployment as-is. Accessibility features are implemented, but this is not a certified WCAG audit.

See [docs/INTEGRATIONS.md](docs/INTEGRATIONS.md) for repository evaluations, licenses, actual data connections and deferred integrations.

## Verify

```powershell
.\.venv\Scripts\python.exe -m pytest backend/tests -q
cd frontend
pnpm.cmd test:onboarding
pnpm.cmd build
```

For the approximate-assistance change, all 38 focused tests in `backend/tests/test_estimates.py` pass, including API persistence of estimate ranges and provenance. The TypeScript/Vite production build passes with execution approval for esbuild. The broader backend suite still has three legacy failures: network endpoints expected to return generated data, weather expected to fall back to simulated values, and guides expected to have at least three steps. These expectations predate the current unavailable-data behavior. Model calls in the focused tests are mocked: these checks validate behavior, not answer quality or an 80–90% accuracy claim. Real-model Studio checks remain opt-in through `scripts/verify_studio_ai.py`.

On Windows, `pnpm.cmd` avoids the PowerShell execution policy for `pnpm.ps1`; use `pnpm` on other platforms. The restricted coding sandbox can prevent SQLite access to the test temporary directory and Vite from spawning esbuild (`spawn EPERM`). These checks pass from a normal local terminal or with scoped execution approval; no security settings need changing.

The earlier browser walkthrough covered the demo experience and is not verification of the current weather-only workspace. The app does not require IoT devices. Open-Meteo is the only integrated live internet data source; other farm-specific online sources remain future integrations.

Source layout: `backend/app/{db,schemas,services,integrations,studio,main}.py`; `frontend/src` contains the pages, shared components and separate translation files. Schema initialization also runs explicitly with `python -c "from backend.app.db import initialize; initialize()"` from the repository root.
