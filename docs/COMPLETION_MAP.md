# ResiliFarm completion map

Target: a guided, verified **single-user local demo**. Real-farm operation is a separate project. Beginner and Pro change guidance only; neither changes calculations or removes capabilities.

## Local demo delivery

| Area | Status | Evidence / remaining work |
| --- | --- | --- |
| Start Here and Overview | Implemented | Empty or unknown hashes open Start Here; Overview remains the baseline data dashboard. Home explains a suggested route and links all 11 sections. |
| Beginner / Pro | Implemented; persistence visually checked | Beginner is the default. `rf-mode` remembers the choice in this browser. Pro adds methods, units, assumptions and provenance; all controls remain available. |
| Section guides | Automated checks passed | All 11 sections include purpose, inputs, steps, result interpretation and limitations in EN/FR/JA. All 66 language/mode renders and 66 localized home links pass the render checks. |
| Studio rejection | Regression checks passed | HTTP 422 with `{"error":{"code":"unsupportedRequest"}}`. Unsupported requests create no project, version, message or connection, do not revoke deployment and do not reach the optional provider. Planning preferences cannot authorize an unsupported original prompt. Successful response shapes are unchanged. |
| Supported Studio language paths | Regression checks passed | EN/FR/JA example creation and all six translated edit suggestions succeed. Existing version, validation, simulated deployment and ZIP export API checks pass. |
| Irrigation form | Fixed and visually checked | Area step now accepts whole hectares; ET₀ accepts the seeded 5.95 mm value. A 2 ha case calculated 83.5 m³/day and 10.5 kWh/day in Chrome. Render checks cover validity of all eight seeded numeric inputs. |
| Backend verification | Passed | 55 tests pass, including strict AI options, contextual edits, negative requirements and provider failures without persistence. The remaining warning is the upstream Starlette/HTTPX test-client deprecation. |
| Pretrained Studio AI | Implemented; real-model API checks passed | Workspace-local Ollama and Qwen3 4B Instruct. EN/FR/JA planning, contextual one-sensor edits, removing solar, unsupported requests without persistence and ZIP export passed against the actual model. Source labels, explicit 503 failures and 90-second inference timeout are implemented. This does not close the remaining browser checklist. |
| Frontend verification | Passed | TypeScript and Vite production build succeed outside the restricted Windows sandbox. Vite reports a non-fatal large-chunk warning for the existing Studio/3D bundle. |
| Browser walkthrough | **Partially verified; still required** | Chrome confirmed default Start Here/Beginner presentation, the irrigation start link, Pro persistence after reload, Beginner/Pro guidance and successful irrigation calculation. Computer Use was stopped with Escape before the rest of the walkthrough. |

**Completion gate:** do not call the local demo fully verified until the remaining browser checklist below passes. Automated rendering verifies content and link destinations; it does not replace pointer, keyboard, layout, download or assistive-technology checks.

## Remaining local browser checklist

Use the same local backend and SPA. Test EN/FR/JA and both guidance modes. Existing API tests cover the server workflows, but these browser steps remain unverified in this pass.

- [ ] Open every Start Here section link and check back/forward navigation, including a direct section hash.
- [ ] On a fresh browser origin/profile, confirm Beginner and Start Here. Change mode, reload and confirm the preference; also check an invalid stored mode falls back to Beginner.
- [ ] Visually inspect every section guide in both modes and all languages; check that guide disclosure controls work without changing page capabilities.
- [ ] Compare Tunisia’s two regions, select Fukuoka and inspect Twin field/device markers.
- [ ] Inspect Water after a calculation; change allocation, roof and storage. Inspect Energy and confirm it uses the calculated demand.
- [ ] Run a leak without intervention, rerun with intervention and compare lost water and pump energy. Read Insights.
- [ ] Analyze normal and anomalous security samples, read evidence and distinguish current analysis from the saved scenario-alert log.
- [ ] In Studio, submit `robot` through the planning screen and verify the localized explanation and unchanged saved-project list. Create a supported design, edit it, switch versions, review validation, add a valid design to the Twin and download its ZIP.
- [ ] Change EN/FR/JA, contrast, text size and reduced motion; reload to check persistence. Load demo weather and recalculate. Optional live weather must show its source or a labeled fallback.
- [ ] Check 360–390 px mobile, tablet and desktop widths, plus 125% text. Look for horizontal overflow, clipped menus and readable guides.
- [ ] Use only Tab/Shift+Tab/Enter/Space to reach the skip link, navigation, mode switch, language selector, guide disclosures, forms, Studio and export. Check visible focus and mobile-menu behavior.

## Verification commands and Windows blockers

From the repository root:

```powershell
.\.venv\Scripts\python.exe -m pytest backend/tests -q
cd frontend
pnpm.cmd test:onboarding
pnpm.cmd build
```

`pnpm.cmd` avoids PowerShell's script execution-policy restriction on `pnpm.ps1`; it does not require changing that policy. Other platforms can use `pnpm`.

The original 20-pass/8-error SQLite run was reproduced inside the restricted sandbox. The exact same suite passed all 28 original tests outside it, showing that the Windows temporary-directory access restriction, rather than the database schema, caused initialization to fail. The expanded suite now passes 55 tests with that access. Keep the disposable test database; do not point tests at the user's demo database.

Vite's `spawn EPERM` was also reproduced in the sandbox. With the required subprocess permission, the standard build succeeds. No dependency downgrade, security-setting change or error suppression was necessary. Run these commands in a normal local terminal, or grant the coding environment the narrowly scoped execution permission when requested.

## Later real-farm requirements

These are **future work**, not claims made by this demo.

| Workstream | Required outcome before real-farm operation |
| --- | --- |
| Agronomic validation | Calibrated crop/soil profiles, root-zone water storage, measured weather quality, seasonal trials, uncertainty and qualified agronomic review. |
| Hydraulic and energy design | Surveyed pipe/pump/network data, validated hydraulic solver, pump curves, storage and hourly energy balance, realistic sizing and field acceptance tests. |
| Sensor ingestion | Device identities, authenticated ingestion, timestamps, units, calibration, quality flags, missing/stale-data handling, durable queues and telemetry retention. |
| Hardware control | Reviewed electrical schematics and component ratings, firmware compilation and bench tests, local interlocks, fail-safe pump-off behavior, manual override and physical commissioning. No automatic actuation from this demo. |
| Security | Authentication, authorization, tenant isolation if needed, TLS, secrets handling, audit logs, rate limits, threat modeling, abuse controls and incident response. Synthetic anomaly rules are not cyber protection. |
| Operations and data | Versioned database migrations, tested backup/restore, monitoring, recovery procedures, retention/privacy policies and device update strategy. |
| Deployment | Hardened network boundaries and hosts, deployment configuration, reproducible CI, load/reliability tests and rollback. Compose/PostgreSQL runtime still needs its own validation; DDL compilation alone is insufficient. |
| User acceptance | Field-user trials, accessibility and assistive-technology audit, professional translation review, training and support procedures. |

Optional local-demo polish after the verification gate: split/lazy-load the existing heavy Studio/3D bundle, review translations with native speakers, and perform a fuller accessibility audit. These improvements do not establish field readiness.
