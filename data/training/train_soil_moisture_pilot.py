"""Research-only pilot on a public 2025 Italy irrigation dataset.

This predicts the dataset's 24-hour mean soil-moisture target, not Tunisia/Japan
water demand. It is intentionally not wired into the application.
"""
from __future__ import annotations

import tempfile
from pathlib import Path

import httpx
import pandas as pd
from sklearn.ensemble import HistGradientBoostingRegressor
from sklearn.metrics import mean_absolute_error, mean_squared_error, r2_score

DATASET = "https://data.mendeley.com/public-files/datasets/c837v6p8ph/files/{file_id}/file_downloaded"
FILE_IDS = {
    1: "14665edd-9b6d-48be-84f3-b62de6e30c63",
    2: "c23a239d-52ab-476f-9272-de7011d02efd",
    3: "b566d446-ea13-4827-bdcc-61ce5b835814",
    4: "8c5fb92b-be03-4dd3-8968-c6f8fffb4469",
    5: "9604d4a5-fb5b-49f6-8343-d4e3815a1ccc",
}
FEATURES = [
    "weather_temp",
    "weather_humidity",
    "weather_rain",
    "weather_pressure",
    "weather_wind_speed",
    "weather_radiation",
    "soil_temperature_0-7cm",
    "soil_temperature_7-18cm",
    "soil_moisture",
    "irrigation_duration_minutes",
]
TARGET = "target_mean_24h"
WATER_TARGET = "water_vol_to_24h"


def load_data() -> pd.DataFrame:
    frames = []
    with tempfile.TemporaryDirectory(prefix="resilifarm-pilot-") as temp_dir:
        for sector, file_id in FILE_IDS.items():
            response = httpx.get(
                DATASET.format(file_id=file_id),
                follow_redirects=True,
                timeout=90,
                headers={"User-Agent": "Mozilla/5.0"},
            )
            response.raise_for_status()
            path = Path(temp_dir) / f"sector-{sector}.csv"
            path.write_bytes(response.content)
            frame = pd.read_csv(path, parse_dates=["ts"])
            frame["sector"] = sector
            frames.append(frame)
    return pd.concat(frames, ignore_index=True).sort_values(["ts", "sector"])


def main() -> None:
    data = load_data()
    required = ["ts", *FEATURES, TARGET, WATER_TARGET]
    missing = sorted(set(required) - set(data.columns))
    if missing:
        raise ValueError(f"Dataset is missing expected columns: {missing}")

    # The published target is a 144-row look-ahead. Cleaning can remove rows,
    # so retain only examples whose realized horizon is approximately one day.
    data["future_ts"] = data.groupby("sector", sort=False)["ts"].shift(-144)
    horizon_hours = (data["future_ts"] - data["ts"]).dt.total_seconds() / 3600
    data = data.loc[horizon_hours.between(20, 30)].copy()
    data = data.loc[data[TARGET].between(0, 100)]
    data = data.dropna(subset=[*FEATURES, TARGET, "ts"])

    # Chronological holdout with a 14-day purge gap to reduce overlap between
    # the forward-looking target windows on either side of the split.
    cutoff = data["ts"].quantile(0.80)
    train = data.loc[data["ts"] < cutoff - pd.Timedelta(days=14)]
    test = data.loc[data["ts"] >= cutoff]
    if train.empty or test.empty:
        raise ValueError("Not enough rows for the chronological split")

    train_x = pd.get_dummies(train[FEATURES + ["sector"]], columns=["sector"], dtype=float)
    test_x = pd.get_dummies(test[FEATURES + ["sector"]], columns=["sector"], dtype=float)
    test_x = test_x.reindex(columns=train_x.columns, fill_value=0)
    y_train = train[TARGET]
    y_test = test[TARGET]

    model = HistGradientBoostingRegressor(
        max_iter=150,
        max_leaf_nodes=15,
        l2_regularization=1.0,
        random_state=42,
    )
    model.fit(train_x, y_train)
    prediction = model.predict(test_x).clip(0, 100)
    persistence = test["soil_moisture"].clip(0, 100)

    print("Dataset: Adamo et al., Mendeley Data V2, DOI 10.17632/c837v6p8ph.2")
    print("Site/crops: Arnesano, Italy; tomato, zucchini, blueberry")
    print("Target: 24-hour mean soil moisture (%), not irrigation demand")
    print(f"Rows: train={len(train)}, test={len(test)}, gap=14 days")
    print(f"Train: {train['ts'].min()} through {train['ts'].max()}")
    print(f"Test:  {test['ts'].min()} through {test['ts'].max()}")
    for name, estimate in [
        ("persistence baseline", persistence),
        ("hist-gradient-boosting", prediction),
    ]:
        print(
            f"{name}: MAE={mean_absolute_error(y_test, estimate):.3f}, "
            f"RMSE={mean_squared_error(y_test, estimate) ** 0.5:.3f}, "
            f"R2={r2_score(y_test, estimate):.3f}"
        )

    # This is an applied-water proxy from reconstructed valve durations and
    # nominal flow, not a directly metered crop-water-need label. Correct the
    # documented sector-5 rate mismatch (0.4 vs 1.1 L/min).
    water_data = data.loc[data[WATER_TARGET].notna()].copy()
    water_data.loc[water_data["sector"] == 5, WATER_TARGET] *= 0.4 / 1.1
    water_train = water_data.loc[water_data["ts"] < cutoff - pd.Timedelta(days=14)]
    water_test = water_data.loc[water_data["ts"] >= cutoff]
    wx_train = pd.get_dummies(water_train[FEATURES + ["sector"]], columns=["sector"], dtype=float)
    wx_test = pd.get_dummies(water_test[FEATURES + ["sector"]], columns=["sector"], dtype=float)
    wx_test = wx_test.reindex(columns=wx_train.columns, fill_value=0)
    wy_train = water_train[WATER_TARGET]
    wy_test = water_test[WATER_TARGET]
    water_model = HistGradientBoostingRegressor(
        max_iter=150,
        max_leaf_nodes=15,
        l2_regularization=1.0,
        random_state=42,
    )
    water_model.fit(wx_train, wy_train)
    water_prediction = water_model.predict(wx_test).clip(0, None)
    print(f"Water-proxy rows: train={len(water_train)}, test={len(water_test)}")
    print(f"Water-proxy nonzero test share: {(wy_test > 0).mean():.3f}")
    for name, estimate in [
        ("zero baseline", pd.Series(0.0, index=wy_test.index)),
        ("train-median baseline", pd.Series(wy_train.median(), index=wy_test.index)),
        ("hist-gradient-boosting", pd.Series(water_prediction, index=wy_test.index)),
    ]:
        print(
            f"24h applied-water proxy {name}: MAE={mean_absolute_error(wy_test, estimate):.3f} L, "
            f"RMSE={mean_squared_error(wy_test, estimate) ** 0.5:.3f} L, "
            f"R2={r2_score(wy_test, estimate):.3f}"
        )
    print("Caution: external Italian prototype only; not validated for Tunisia/Japan.")
    print("Water target is valve-derived nominal-flow volume, not metered irrigation need.")
    print("Credit dataset under CC BY 4.0; inspect its README/version metadata before reuse.")


if __name__ == "__main__":
    main()
