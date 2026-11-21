# ResiliFarm AI — architecture quick reference

Use this file as the project map; inspect only the listed source files needed for a task. `README.md` is the authority for setup, model assumptions, limitations, and verification details.

## System shape

Full-stack local demo: React SPA → same-origin `/api/v1` → FastAPI application → SQL database. The backend is a single process, not a set of microservices. In Docker Compose, Nginx serves the built SPA on `:8080`, proxies `/api/` and `/health` to FastAPI on `:8000`, and FastAPI connects privately to PostgreSQL 16. Locally, Vite serves `:5173` and proxies to FastAPI `:8000`; SQLite is the no-service default. The map uses OpenStreetMap tiles; Open-Meteo is the live regional weather-model connector. No IoT device ingestion is required. Open-Meteo is the only live farm-related internet data feed integrated so far; no generated farm, telemetry or network values are shown as live data.

## Code map

- `backend/app/main.py` — FastAPI app/lifespan, CORS/error handling, all HTTP routes, persistence orchestration, Studio project/version/export flows.
- `backend/app/db.py` — SQLAlchemy Core tables/metadata, SQLite/PostgreSQL engine setup, seed data, record writes. There are no ORM model classes or schema migration history; startup uses `metadata.create_all` and idempotent region/crop-reference seeding and cleanup of legacy generated farms, networks and simulated records.
- `backend/app/schemas.py` — Pydantic request models, enums/ranges, strict extra-field and non-finite-number rejection.
- `backend/app/services.py` — user-input irrigation estimates and threshold analysis; synthetic network/scenario helpers are not exposed as live routes.
- `backend/app/integrations.py` — Open-Meteo current model conditions and 7-day forecast, normalization, 8-second timeout, 5-minute process-local cache, fail-closed 503 with no sample fallback.
- `backend/app/studio.py` — fixed catalogue, local EN/FR/JA rules or optional pretrained-model option planning, strict JSON-schema validation, BOM/connections, compatibility checks and dry-run Arduino starter. The model selects constrained options; it does not generate arbitrary hardware-control code. Configured provider failures return 503 without persistence or silent rule fallback.
- `scripts/{install_local_ai,run_studio_ai,verify_studio_ai}.py` — workspace-local Ollama/Qwen installation, localhost launcher and opt-in real-model API smoke checks against a disposable database. `.local/` contains ignored runtime/model artifacts.
- `backend/tests/test_core.py` — backend/API, calculations, validation, scenarios, weather fallback/cache, Studio/export, PostgreSQL DDL, translation parity tests.
- `frontend/src/main.tsx` — React bootstrap and global CSS/Leaflet/i18n imports.
- `frontend/src/App.tsx` — hash navigation, saved Beginner/Pro guidance preference, global state/data loading, Start Here home, regional weather, user-input calculations, and explicit unavailable states for pages whose suitable public online data source is not integrated. Add new page navigation here.
- `frontend/src/Guide.tsx` — Start Here links and localized section guides. `frontend/tests/{onboarding.tsx,run-onboarding.mjs}` verifies all language/mode renders and farm-input validity.
- `frontend/src/api.ts` — typed JSON fetch wrapper for `/api/v1` and browser file downloads.
- `frontend/src/components.tsx` — shared Panel, metrics, weather chart, farm input form, and network view.
- `frontend/src/Studio.tsx` — project conversation, version selection, conceptual schematic/BOM/connections, validation, blocked physical deployment, and ZIP export UI.
- `frontend/src/MapControls.tsx` — Leaflet zoom controls.
- `frontend/src/types.ts` — frontend API/domain types; keep synchronized with backend response shapes.
- `frontend/src/style.css` — all application styling and responsive/accessibility presentation.
- `frontend/src/i18n/{index.ts,en.json,fr.json,ja.json}` — i18next setup and translations; keep all locale keys in parity.
- `frontend/vite.config.ts` — React plugin, chart/map chunks, local API proxy. `frontend/nginx.conf` — SPA fallback and production API proxy.
- `docker-compose.yml`, `backend/Dockerfile`, `frontend/Dockerfile` — local Postgres/backend/frontend container topology.

## API surface

All business routes are under `/api/v1` (plus `/health`).

- Geography/data: `GET /regions`; `GET /regions/{rid}/overview` (weather model only); `GET /regions/{rid}/weather`; water-network and energy routes return 503 until suitable online data sources or explicit farm configurations are supported.
- Calculation: three POST aliases `/predictions/water-demand`, `/predictions/solar`, `/recommendations/irrigation` require explicit farm inputs and return labeled estimates.
- Scenarios/security: Scenario requests return 503 until real data and methods are integrated; `GET /alerts` filters simulated records; `POST /security/analyze` accepts submitted data but the UI stays unavailable without a trusted source.
- Studio: `GET /aiot/catalogue`; `GET/POST /aiot/projects`; `GET /aiot/projects/{pid}`; `POST /aiot/projects/{pid}/messages|validate|deploy`; `GET /aiot/projects/{pid}/export` returns a ZIP (JSON, BOM CSV, connections CSV, localized assembly guide, `.ino`). Editing creates an immutable numbered design version; physical deploy is blocked until a hardware connector exists.
- Studio provider: `GET /aiot/provider` reports configuration, model availability and model name without revealing credentials or provider URLs. Model configuration is server-side; the local launcher uses Qwen3 4B Instruct through Ollama on `127.0.0.1:11434`. Unsupported intent returns `422 / unsupportedRequest`; unavailable or invalid AI output returns `503 / studioAiUnavailable`, with no project/version/message/connection writes.

## Data and behavior contracts

`db.py` defines geography (`countries → administrative_areas → agricultural_zones → farms → fields`), crop profiles, water networks/nodes/pipes, AIoT projects/design versions/messages/components/connections, and generic region-scoped payload tables for weather observations, sensor readings, energy systems, predictions, alerts, irrigation recommendations, and simulation runs. Every entity has integer `id` and `created_at`; generic records carry `region_id`, `is_simulated`, `source`, and JSON payload. Current live workflows persist Studio projects/designs and user-input calculations. Startup clears generated farms/networks and simulated records; weather cache is in-memory. Record tables do not imply an IoT ingestion service; internet data providers are the intended external source.

Calculations are documented estimates, not trained ML or calibrated engineering models: `ETc=Kc×ET0`; effective rain `=0.8×rain`; net depth `=max(0,ETc−effective rain)`; gross depth `=net/efficiency`; volume `=10×gross_mm×ha`; solar `=kWp×sun_hours×0.8`. Network pressure is a demand-driven Darcy-Weisbach approximation, not an EPANET solver. Scenarios and security telemetry are synthetic. All 24 Tunisian governorates and 47 Japanese prefectures have administrative-center coordinates. Overview/comparison show Open-Meteo model weather only. The point is not a surveyed farm; current conditions are model output, not station measurements. Agricultural calculations require explicit user inputs and are labeled estimates.

## Stack and work commands

Python/FastAPI/Pydantic/SQLAlchemy Core; declared backend pins are in `backend/requirements.txt`. Frontend is TypeScript 5.8, React 19, Vite 6, Leaflet/React-Leaflet, Recharts, i18next; dependencies and scripts are in `frontend/package.json` with `pnpm-lock.yaml`. README requires Python 3.11+ and Node 22+; Docker images use Python 3.12 and Node 22. Run backend checks with `python -m pytest backend/tests -q` from repo root; run frontend typecheck/build with `pnpm build` from `frontend/`.

This is a single-user localhost MVP: no authentication, authorization, IoT ingestion/control, production hardening, or public deployment protection. External data is obtained from internet providers. Do not describe estimates as validated field predictions or expose the demo publicly as-is. Full setup and additional limitations are in `README.md`; integration provenance is in `docs/INTEGRATIONS.md`.
