# ResiliFarm AI

Besbes Bobi · KIZUNA 2026 – ESPRIT

A working local agricultural resilience MVP: React/TypeScript/Vite, FastAPI/Pydantic, SQLAlchemy, Leaflet, Recharts and i18next. PostgreSQL is configured in Docker Compose; SQLite provides a zero-service local alternative. No API key or physical sensor is required.

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

Local startup requires **no environment variables**. The app initializes and seeds `backend/resilifarm.db` once. To use an existing PostgreSQL server, set `DATABASE_URL=postgresql+psycopg://user:URL_ENCODED_PASSWORD@host:5432/database`. `CORS_ORIGINS` is an optional comma-separated origin list. Local mode reads environment variables directly; it does not load `.env` automatically.

## Docker / PostgreSQL

```powershell
Copy-Item .env.example .env
# Edit .env and set a unique POSTGRES_PASSWORD, then:
docker compose up --build
```

Open http://localhost:8080. Database credentials stay in the backend; no database port is exposed. Compose injects `DB_HOST` and `DB_PASSWORD`, avoiding URL interpolation problems with special characters. The database volume persists. Initialization is idempotent (`metadata.create_all` and seed transaction); this initial schema has no upgrade migration history yet. Docker was unavailable on the development machine, so the Compose/PostgreSQL runtime is **not verified**; SQLite initialization and the PostgreSQL schema compilation are tested.

## Demo flow

For pretrained-model planning in Studio, follow the local AI setup below. The ordinary backend command continues to use rules when no provider is configured.

Open **Start Here** for a suggested path and links to all 11 sections. An empty or unknown URL hash opens this home page; **Overview** remains the regional baseline dashboard. First visits use **Beginner** guidance. The **Pro** switch adds methods, units, assumptions and data provenance without changing features or calculations. The choice is saved in this browser. Every section has an expandable EN/FR/JA guide covering its purpose, inputs, steps, result interpretation and demo limits.

1. Choose any of Tunisia’s 24 governorates or Japan’s 47 prefectures.
2. Open Agricultural Intelligence, choose crop, stage, area, efficiency and weather inputs, then calculate.
3. Inspect water allocation, pipe pressure, rainwater collection and pump/solar energy.
4. Run a leak scenario, then apply intervention and compare lost water and pumping demand. Try restriction, drought, heatwave, pump outage, solar shortage and sensor tampering.
5. Analyze simulated leak or tampering telemetry in Cybersecurity.
6. Generate a Studio blueprint. Review the plan, then explore its Info, Parts, Architecture, Wiring, Mechanical and Instructions views. Search the BOM, inspect signal paths, mark build steps complete and export the conceptual assembly as STL.
7. Add a soil sensor, switch Wi-Fi to LoRa, reduce cost, inspect component specifications and connections. Test 5 V logic to see a validation failure; return to 3.3 V before adding the simulated design to the digital twin.
8. Export the ZIP: versioned JSON, BOM CSV, connections CSV, localized assembly guide and dry-run Arduino starter.
9. Switch EN/FR/JA or adjust contrast, text size and motion. Language and accessibility preferences persist on the device.

Settings can request a real Open-Meteo forecast. The server caches successful responses for 30 minutes, uses an 8-second timeout, and falls back to explicitly labeled fixed sample data. The selected weather populates irrigation inputs; calculate again to apply it. Overview and comparison intentionally remain reproducible demo baselines. Map tiles and optional web fonts need internet; controls and fallback fonts work without them.

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
- Water network: steady eight-hour pumping day, 300 m of 80 mm pipe, Darcy friction factor 0.025 and 30 m source head. Illustrative demand-driven estimate, not an EPANET hydraulic solver. Pressure is clipped at zero; infeasible flow is not solved iteratively.
- Stress = daily net demand / 8 mm, capped at 100%; crop coefficients and risk thresholds are illustrative. No root-zone storage, calibrated yield forecast, trained ML, or accuracy claim.
- Scenario assumptions are explicit. Leak repair removes 90% of leakage; soil cover reduces demand 10%; pump recovery restores 80% of delivery; restriction prioritizes 70% of area without increasing allowed supply. Backup energy is additional energy, not a solar gain.
- Studio defaults to deterministic catalogue templates and recognizes supported EN/FR/JA edit phrases. An optional OpenAI-compatible planner can be configured with `STUDIO_AI_BASE_URL`, `STUDIO_AI_API_KEY` and `STUDIO_AI_MODEL`; it is not required for this demo, and generation provenance is recorded. Its six-view blueprint workspace uses React Flow and Three.js; the mechanical massing model and STL are conceptual blocks, not manufacturing CAD. Wiring pins are illustrative, must be checked against datasheets, and are not a reviewed schematic. Arbitrary engineering language and automatic farm-scale sizing are not supported. Prices/specifications are illustrative, not vendor quotes.
- Unsupported Studio requests such as “robot” return HTTP 422 with `error.code = unsupportedRequest` and a localized explanation in the UI. They do not create a project, version, message or connection. New-project planning preferences are validated separately from the original request; successful response shapes are unchanged.
- The firmware is an **uncompiled, dry-run starter**: soil ADC output and pump-off state. LoRa/network stacks, field control, sensor calibration and physical commissioning are intentionally not implemented. The 60 W pump is a bench example, not a 5 ha irrigation pump. Hardware proposals require qualified review.
- The relational schema includes the requested geography, field/crop, weather, network/node/pipe, sensor, energy, prediction, recommendation, alert, simulation and Studio entities. Current persistence workflows cover catalogue, projects/messages/connections/versions, recommendations, scenarios and scenario alerts; other telemetry tables are extension points, not a live ingestion service.
- Single-user localhost demo: no authentication, multi-tenant authorization, rate limits, production deployment or real cyber protection. Do not expose it publicly as-is. Accessibility features are implemented, but this is not a certified WCAG audit.

See [docs/INTEGRATIONS.md](docs/INTEGRATIONS.md) for repository evaluations, licenses, actual data connections and deferred integrations.

## Verify

```powershell
.\.venv\Scripts\python.exe -m pytest backend/tests -q
cd frontend
pnpm.cmd test:onboarding
pnpm.cmd build
```

The backend suite passes 55 tests covering physical units, water balance, scenarios, anomaly detection, input validation, CORS, Studio versions/exports, translated prompts, strict AI output validation, context preservation, negative requirements, provider availability, rejected/failed requests without persistence, weather fallback/cache, and recursive translation parity. The onboarding check verifies all 66 language/mode guide renders, their home links and farm-input step validity. TypeScript and the production build pass; Vite reports a non-fatal large-chunk warning for the existing Studio/3D bundle. FastAPI's test client emits one upstream HTTPX deprecation warning. Real-model checks are opt-in through `scripts/verify_studio_ai.py`.

On Windows, `pnpm.cmd` avoids the PowerShell execution policy for `pnpm.ps1`; use `pnpm` on other platforms. The restricted coding sandbox can prevent SQLite access to the test temporary directory and Vite from spawning esbuild (`spawn EPERM`). These checks pass from a normal local terminal or with scoped execution approval; no security settings need changing.

The browser walkthrough is only partially verified: Start Here, saved Pro mode and an irrigation calculation were checked before Computer Use was stopped. See [docs/COMPLETION_MAP.md](docs/COMPLETION_MAP.md) for the remaining browser checklist, local-demo completion gate and separate real-farm requirements. Do not call the demo fully verified until that gate passes.

Source layout: `backend/app/{db,schemas,services,integrations,studio,main}.py`; `frontend/src` contains the pages, shared components and separate translation files. Schema initialization also runs explicitly with `python -c "from backend.app.db import initialize; initialize()"` from the repository root.
