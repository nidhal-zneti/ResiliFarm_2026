"""Train/evaluate FruitVision Member 1 AB for one locally prepared fruit.

Expected layout: DATASET/<fruit>/<train|test>/<ripe|unripe|rotten>/*
The test directory is kept entirely out of fitting. If no split folders exist,
the script reserves a stratified 25% split from DATASET/<fruit>/<label>/.
"""
import argparse
from concurrent.futures import ThreadPoolExecutor
import json
import re
import sys
from datetime import datetime, timezone
from pathlib import Path

import joblib
import numpy as np
from sklearn.metrics import accuracy_score, classification_report
from sklearn.model_selection import train_test_split
from sklearn.preprocessing import StandardScaler
from sklearn.svm import SVC

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from backend.app.fruitvision import (
    MODEL_DIR, RIPENESS_LABELS, FruitNotRecognized, extract_features,
    feature_vector_is_fruit,
)

EXTENSIONS = {'.jpg', '.jpeg', '.png', '.webp'}


def images(path):
    return sorted(item for item in path.glob('*')
                  if item.is_file() and item.suffix.lower() in EXTENSIONS)


def read_partition(root, fruit, partition, max_per_class=None, validate_fruit=False):
    rng = np.random.default_rng(42)
    selected = []
    for label in sorted(RIPENESS_LABELS):
        files = images(root / fruit / partition / label)
        if max_per_class and len(files) > max_per_class:
            indices = sorted(rng.choice(len(files), max_per_class, replace=False).tolist())
            files = [files[index] for index in indices]
        selected.extend((file, label) for file in files)
    def load(item):
        path, label = item
        try:
            return extract_features(path.read_bytes(), validate_fruit=validate_fruit)[0], label
        except FruitNotRecognized:
            return None, label
    features, labels = [], []
    with ThreadPoolExecutor(max_workers=8) as workers:
        for feature, label in workers.map(load, selected):
            if feature is not None:
                features.append(feature)
                labels.append(label)
    return np.asarray(features, dtype=np.float32), np.asarray(labels), len(selected)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('fruit', help='Fruit folder name')
    parser.add_argument('--dataset', type=Path, required=True,
                        help='Prepared dataset root with train/test class folders')
    parser.add_argument('--dataset-name', required=True)
    parser.add_argument('--dataset-url', required=True)
    parser.add_argument('--dataset-license', required=True)
    parser.add_argument('--model-version', default='fruitvision-ab-1.0')
    parser.add_argument('--max-train-per-class', type=int, default=3000,
                        help='Deterministic cap for training speed; held-out test images are all evaluated')
    args = parser.parse_args()
    fruit = args.fruit.strip().lower()
    if not re.fullmatch(r'[a-z][a-z0-9_-]{0,39}', fruit):
        parser.error('fruit must be a simple lowercase identifier')
    if args.max_train_per_class < 1:
        parser.error('--max-train-per-class must be positive')

    x_train, y_train, _ = read_partition(args.dataset, fruit, 'train', args.max_train_per_class)
    x_test, y_test, test_total = read_partition(args.dataset, fruit, 'test', validate_fruit=True)
    if not len(y_train) or not len(y_test):
        x_all, y_all, _ = read_partition(args.dataset, fruit, '', args.max_train_per_class)
        if len(y_all) < 12 or set(y_all) != RIPENESS_LABELS:
            parser.error('need at least 12 images and all three ripeness labels')
        x_train, x_test, y_train, y_test = train_test_split(
            x_all, y_all, test_size=0.25, random_state=42, stratify=y_all)
        test_total = len(y_test)
        retained = [(x, label) for x, label in zip(x_test, y_test)
                    if feature_vector_is_fruit(x)]
        x_test = np.asarray([x for x, _ in retained], dtype=np.float32)
        y_test = np.asarray([label for _, label in retained])
    if set(y_train) != RIPENESS_LABELS or set(y_test) != RIPENESS_LABELS:
        parser.error('train and held-out test partitions must each contain all three labels')

    scaler = StandardScaler().fit(x_train)
    classifier = SVC(kernel='rbf', probability=True, class_weight='balanced', random_state=42)
    classifier.fit(scaler.transform(x_train), y_train)
    predicted = classifier.predict(scaler.transform(x_test))
    accuracy = float(accuracy_score(y_test, predicted))
    report = classification_report(y_test, predicted, labels=sorted(RIPENESS_LABELS),
                                   output_dict=True, zero_division=0)

    # The saved model is refit on all labeled images only after the held-out
    # evaluation has been recorded. Keep the same AB scaler/classifier format.
    all_x = np.concatenate([x_train, x_test])
    all_y = np.concatenate([y_train, y_test])
    final_scaler = StandardScaler().fit(all_x)
    final_model = SVC(kernel='rbf', probability=True, class_weight='balanced', random_state=42)
    final_model.fit(final_scaler.transform(all_x), all_y)
    directory = MODEL_DIR / fruit
    directory.mkdir(parents=True, exist_ok=True)
    joblib.dump({'model': final_model, 'scaler': final_scaler}, directory / 'model.joblib')
    manifest = {
        'fruit': fruit,
        'model_version': args.model_version,
        'algorithm': 'FruitVision Member 1 AB: SVC over CIELAB/HSV colour and contour shape',
        'feature_version': 'fruitvision-ab-color-shape-v1',
        'labels': sorted(RIPENESS_LABELS),
        'training_count': len(y_train),
        'held_out_count': len(y_test),
        'held_out_total_count': test_total,
        'held_out_rejected_count': test_total - len(y_test),
        'held_out_coverage': len(y_test) / test_total if test_total else 0,
        'held_out_accuracy': accuracy,
        'held_out_report': report,
        'split_seed': 42,
        'trained_at': datetime.now(timezone.utc).isoformat(),
        'dataset': {'name': args.dataset_name, 'url': args.dataset_url,
                    'license': args.dataset_license},
        'upstream': 'https://github.com/ligitpizza/FruitVision',
    }
    (directory / 'manifest.json').write_text(json.dumps(manifest, indent=2), encoding='utf-8')
    print(json.dumps({'model_dir': str(directory), 'held_out_accuracy': accuracy,
                      'held_out_count': len(y_test), 'held_out_total_count': test_total,
                      'held_out_coverage': len(y_test) / test_total if test_total else 0,
                      'per_class': report}, indent=2))


if __name__ == '__main__':
    main()
