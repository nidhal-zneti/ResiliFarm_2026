"""Local FruitVision AB inference adapter.

Model files are intentionally kept outside the repository in
``.local/fruitvision/models/<fruit>/``. A fruit is enabled only when its model,
manifest, class list and held-out evaluation are present and valid.
"""
import json
import os
import re
from pathlib import Path

RIPENESS_LABELS = {'unripe', 'ripe', 'rotten'}
DEFAULT_MODEL_DIR = Path(__file__).resolve().parents[2] / '.local' / 'fruitvision' / 'models'
MODEL_DIR = Path(os.getenv('FRUITVISION_MODEL_DIR', str(DEFAULT_MODEL_DIR)))


class FruitModelUnavailable(Exception):
    pass


class FruitNotRecognized(Exception):
    pass


def _artifact(fruit):
    directory = MODEL_DIR / fruit
    manifest_path = directory / 'manifest.json'
    model_path = directory / 'model.joblib'
    if not manifest_path.is_file() or not model_path.is_file():
        return None
    try:
        manifest = json.loads(manifest_path.read_text(encoding='utf-8'))
    except (OSError, ValueError):
        return None
    labels = manifest.get('labels')
    accuracy = manifest.get('held_out_accuracy')
    count = manifest.get('held_out_count')
    total_count = manifest.get('held_out_total_count')
    coverage = manifest.get('held_out_coverage')
    report = manifest.get('held_out_report')
    report_valid = isinstance(report, dict) and all(
        isinstance(report.get(label), dict)
        and isinstance(report[label].get('support'), (int, float))
        and report[label]['support'] >= 1
        for label in RIPENESS_LABELS
    )
    if (manifest.get('fruit') != fruit or not isinstance(manifest.get('model_version'), str)
            or not manifest['model_version'].strip() or not isinstance(labels, list)
            or set(labels) != RIPENESS_LABELS or not isinstance(accuracy, (int, float))
            or not 0 <= accuracy <= 1 or not isinstance(count, int) or count < 3
            or not isinstance(total_count, int) or total_count < count
            or not isinstance(coverage, (int, float)) or not 0 < coverage <= 1
            or not report_valid or manifest.get('feature_version') != 'fruitvision-ab-color-shape-v1'):
        return None
    return manifest, model_path


def available_fruits():
    if not MODEL_DIR.is_dir():
        return []
    return sorted(path.name for path in MODEL_DIR.iterdir()
                  if path.is_dir() and re.fullmatch(r'[a-z][a-z0-9_-]{0,39}', path.name)
                  and _artifact(path.name))


def extract_features(image_bytes, validate_fruit=False):
    """Use FruitVision AB's actual cleanup, detection, calibration and features."""
    import numpy as np
    import cv2
    from .fruitvision_ab.preprocessing import clean
    from .fruitvision_ab.detection import detect
    from .fruitvision_ab.calibration import calibrate
    from .fruitvision_ab.colour import extract_colour
    from .fruitvision_ab.shape import extract_shape
    raw = cv2.imdecode(np.frombuffer(image_bytes, dtype=np.uint8), cv2.IMREAD_COLOR)
    if raw is None:
        raise ValueError('Unreadable image')
    enhanced = clean(raw)
    cropped, bbox = detect(enhanced)
    calibrated, _ = calibrate(cropped, bbox, target_size=(256, 256))
    colour = extract_colour(calibrated)
    shape = extract_shape(calibrated)
    if validate_fruit:
        _require_fruit(shape)
    return np.concatenate([colour, shape]).astype(np.float32).reshape(1, -1)


def _require_fruit(shape):
    norm_area, _, _, aspect_ratio, convexity = shape
    if norm_area <= 0 or norm_area < 0.03 or convexity < 0.55 or aspect_ratio > 4 or aspect_ratio < 0.25:
        raise FruitNotRecognized()


def feature_vector_is_fruit(feature_vector):
    try:
        _require_fruit(feature_vector[-5:])
        return True
    except FruitNotRecognized:
        return False


def predict(fruit, image_bytes):
    artifact = _artifact(fruit)
    if not artifact:
        raise FruitModelUnavailable()
    manifest, model_path = artifact
    if manifest.get('feature_version') != 'fruitvision-ab-color-shape-v1':
        raise FruitModelUnavailable()
    try:
        import joblib
        saved = joblib.load(model_path)
        features = extract_features(image_bytes, validate_fruit=True)
        combined_scaled = saved['scaler'].transform(features)
        model = saved['model']
        probabilities = model.predict_proba(combined_scaled)[0]
        classes = list(model.classes_)
        index = int(probabilities.argmax())
        label = str(classes[index]).lower()
        confidence = float(probabilities[index])
    except FruitNotRecognized:
        raise
    except Exception as exc:
        raise FruitModelUnavailable() from exc
    if label not in RIPENESS_LABELS or not 0 <= confidence <= 1:
        raise FruitModelUnavailable()
    recommendations = {
        'unripe': 'Allow the fruit to continue ripening and check again later.',
        'ripe': 'The fruit appears ripe; confirm by checking it directly before harvest.',
        'rotten': 'The fruit appears spoiled; inspect it and avoid relying on the image alone.',
    }
    return {'fruit': fruit, 'ripeness': label, 'confidence': confidence,
            'recommendation': recommendations[label], 'model_version': manifest['model_version']}
