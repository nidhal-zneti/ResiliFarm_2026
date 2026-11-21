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

Choose one of Tunisia’s 24 governorates or Japan’s 47 prefectures. The map marker is the administrative center, not a surveyed farm. The overview requests current conditions and a seven-day forecast from Open-Meteo for that regional model grid. Open-Meteo current conditions are 15-minute weather-model output, not measurements from a local station. The UI labels the model source and its valid time. Successful responses are cached for up to 5 minutes; the app refreshes the selected region every 10 minutes. If the service is unavailable or returns invalid data, the API responds with 503 and displays no replacement samples.

ResiliFarm does not require IoT devices. Open-Meteo is the only live farm-related internet data feed integrated so far. No suitable public online sources for farm boundaries, soil, water networks, flow, pressure, pump energy or solar generation are currently connected, so the app does not invent those values. Water, energy, scenario simulation and security views remain unavailable until appropriate online data sources and methods are integrated. The digital twin map shows the administrative-center coordinate and current regional model weather.

Agricultural calculations require every farm value to be entered; there are no prefilled example hectares, crop stage, pump or solar values. Outputs are explicitly labeled calculations using those user-supplied inputs and reference crop coefficients. They are not measured irrigation demand, actual pump use, or calibrated field predictions. If weather-model values are used as inputs, they must remain identified as model output.

Studio remains a design workspace. Its BOM prices/specifications are illustrative and its wiring/firmware are conceptual; the API no longer marks a design as physically deployed without a hardware connector.

## Local pretrained Studio AI

Studio can use **Qwen3 4B Instruct through Ollama** to interpret natural EN/FR/JA requirements, including negative requirements and edits referring to the existing design. Example: “My field has no Wi-Fi and I want solar power.” The model proposes typed catalogue options; local code builds the BOM, connections and pump-off starter, and runs the existing compatibility checks. Conversation replies and assembly instructions remain localized templates; this does not add open-ended chat or model-generated firmware.

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

Another OpenAI-compatible provider can be configured with backend environment variables `STUDIO_AI_BASE_URL` (including `/v1`), `STUDIO_AI_MODEL` and, if needed, `STUDIO_AI_API_KEY`. It must support JSON-schema `response_format` and `/models`. Partial configuration is an error. Local `.env` files are not loaded automatically; the launcher sets its own local Qwen configuration. Docker does not automatically connect to host Ollama; container `localhost` refers to the container. Do not expose this model server publicly.

Opt-in tests against the **real model**, with a disposable SQLite database instead of saved demo projects:

```powershell
.\.venv\Scripts\python.exe scripts/verify_studio_ai.py
```

This checks EN/FR/JA planning, one-sensor edits, removing solar, rejection without persistence and ZIP export. Ordinary pytest tests mock the provider and never contact paid services. Sources: [Qwen model and Apache-2.0 license](https://ollama.com/library/qwen3:4b-instruct), [Ollama Windows runtime](https://docs.ollama.com/windows), [structured outputs](https://docs.ollama.com/capabilities/structured-outputs).

## Methods and scope

- `ETc = Kc × ET0`; effective rain = `0.8 × rain`; net depth = `max(0, ETc − effective rain)`; gross depth = `net / irrigation efficiency`; water = `10 × gross mm × ha`.
- Pump energy = `1000 × 9.81 × volume × head / (efficiency × 3,600,000)` kWh. Solar = `kWp × equivalent sun hours × 0.8`. Daily irradiance in MJ/m² converts to equivalent hours by dividing by 3.6; no panel tilt or temperature correction is modeled.
- Farm-specific water flow, pressure and network data are unavailable until a suitable public internet source or supported farm configuration is integrated. No IoT meter is required; the prior illustrative network formula is not exposed as live data.
- Agricultural calculation results are estimates from user-entered values and reference crop coefficients; they are never reported as measured field outcomes.
- Scenario and cyber-security demo endpoints remain unavailable until suitable trusted online data sources and validated methods are integrated. They do not require IoT devices.
- Studio defaults to deterministic catalogue templates and recognizes supported EN/FR/JA edit phrases. An optional OpenAI-compatible planner can be configured with `STUDIO_AI_BASE_URL`, `STUDIO_AI_API_KEY` and `STUDIO_AI_MODEL`; it is not required for this demo, and generation provenance is recorded. Its six-view blueprint workspace uses React Flow and Three.js; the mechanical massing model and STL are conceptual blocks, not manufacturing CAD. Wiring pins are illustrative, must be checked against datasheets, and are not a reviewed schematic. Arbitrary engineering language and automatic farm-scale sizing are not supported. Prices/specifications are illustrative, not vendor quotes.
- Unsupported Studio requests such as “robot” return HTTP 422 with `error.code = unsupportedRequest` and a localized explanation in the UI. They do not create a project, version, message or connection. New-project planning preferences are validated separately from the original request; successful response shapes are unchanged.
- The firmware is an **uncompiled, dry-run starter**: soil ADC output and pump-off state. LoRa/network stacks, field control, sensor calibration and physical commissioning are intentionally not implemented. The 60 W pump is a bench example, not a 5 ha irrigation pump. Hardware proposals require qualified review.
- The database retains region and crop-reference metadata. Generated demo farms, fields, networks and simulated records are cleaned during initialization. IoT ingestion is not required; Open-Meteo is the only integrated live internet feed so far, and other public sources remain future integrations.
- Single-user localhost demo: no authentication, multi-tenant authorization, rate limits, production deployment or real cyber protection. Do not expose it publicly as-is. Accessibility features are implemented, but this is not a certified WCAG audit.

See [docs/INTEGRATIONS.md](docs/INTEGRATIONS.md) for repository evaluations, licenses, actual data connections and deferred integrations.

## Verify

```powershell
.\.venv\Scripts\python.exe -m pytest backend/tests -q
cd frontend
pnpm.cmd test:onboarding
pnpm.cmd build
```

The earlier demo baseline had a 55-test backend suite and an onboarding-render check; those results predate the weather-only fail-closed conversion and do not verify the current behavior. For this change, Python syntax compilation and the frontend TypeScript build check pass. The full Vite production build could not complete in the restricted environment because esbuild returned `spawn EPERM`. Backend tests were not run. Real-model Studio checks remain opt-in through `scripts/verify_studio_ai.py`.

On Windows, `pnpm.cmd` avoids the PowerShell execution policy for `pnpm.ps1`; use `pnpm` on other platforms. The restricted coding sandbox can prevent SQLite access to the test temporary directory and Vite from spawning esbuild (`spawn EPERM`). These checks pass from a normal local terminal or with scoped execution approval; no security settings need changing.

The earlier browser walkthrough covered the demo experience and is not verification of the current weather-only workspace. The app does not require IoT devices. Open-Meteo is the only integrated live internet data source; other farm-specific online sources remain future integrations.

Source layout: `backend/app/{db,schemas,services,integrations,studio,main}.py`; `frontend/src` contains the pages, shared components and separate translation files. Schema initialization also runs explicitly with `python -c "from backend.app.db import initialize; initialize()"` from the repository root.
