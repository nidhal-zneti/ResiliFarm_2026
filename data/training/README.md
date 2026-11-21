# Tunisia/Japan irrigation training data

This template is for collecting **real, field-level daily records** to train and evaluate an irrigation-volume model for Tunisia (TN) and Japan (JP). It contains headers only; do not add synthetic/demo rows to the training set.

## Row definition

One row = one field on one local calendar day. Use an anonymized, stable `field_id`. Record `date_local` as `YYYY-MM-DD`; keep the field's country and region so evaluation can be reported separately for Tunisia and Japan.

## Target and input rules

- `irrigation_volume_l_measured` is the target: actual liters delivered that day, preferably calculated from a calibrated flow-meter counter delta. Enter `0` only when it is confirmed that no water was applied; leave it blank if unknown. Do not substitute valve-open time × nominal flow as measured volume.
- Candidate inputs known before irrigation: `country_code`, `region`, `crop`, `growth_stage`, `area_ha`, `irrigation_method`, `et0_mm`, `rainfall_mm`, `temperature_mean_c`, and `soil_moisture_before_pct`.
- `soil_moisture_after_pct` is an outcome for analysis/validation, not an input for predicting that day's demand.
- Preserve measurement provenance in the `*_source` columns. Record missing/uncertain readings in `notes`; do not silently invent or interpolate a measured target.

## Before training

1. Verify units, timestamps/time zone, sensor calibration, meter resets/rollovers, duplicate days, and crop/stage labels.
2. Keep Tunisia and Japan metrics separate. Use chronological holdouts and hold out fields where possible; never randomly split adjacent time rows across train and test.
3. Compare against the current deterministic irrigation calculation. Report country, crop, and field coverage and error metrics before considering any app integration.
4. Obtain enough complete irrigation seasons and multiple independent fields in **each** country. Public weather or satellite soil-moisture data can be covariates, but cannot replace measured irrigation-volume labels.

## Research-only public-data pilot

`train_soil_moisture_pilot.py` downloads the five prepared sector files from Adamo et al., *Soil Moisture, Irrigation Actuator and Weather Dataset from a Multi-Sector Precision-Irrigation*, Mendeley Data V2, DOI `10.17632/c837v6p8ph.2` (CC BY 4.0). It evaluates a HistGradientBoosting model for the dataset's 24-hour mean soil-moisture target and reports a supplementary valve-derived applied-water proxy. This is an Italy-only experiment, **not** a metered irrigation-demand model and **not** a Tunisia/Japan model.

The run used a chronological split with a 14-day purge gap and filtered samples to realized 20–30 hour target horizons. Results: 15,575 training rows and 5,596 test rows; persistence baseline MAE 0.426 percentage points (RMSE 0.767, R² 0.999); HistGradientBoosting MAE 13.211 (RMSE 15.988, R² 0.542). The learned model was much worse than persistence and is not suitable for integration. The applied-water proxy had no positive test examples in the Sep 8–22, 2025 holdout, so its zero-baseline score is degenerate and provides no evidence of demand-model quality. Its liters are valve-derived using nominal flow rates, not flow-meter measurements. The dataset landing page says V2, while its bundled README contains conflicting version/publication metadata; verify the archive and cite the record before reuse.

To reproduce, install the optional dependencies from `requirements-pilot.txt`, then run `python data/training/train_soil_moisture_pilot.py` from the repository root. The script downloads the CSVs to a temporary directory and does not add the dataset or a model artifact to the repository.

The current app database has no real sensor or weather-observation history, so a trained local irrigation model cannot be validated until real records are supplied.
