"""Download and arrange the FruitVision-referenced Kaggle image dataset locally.

The dataset is CC BY-SA 4.0; attribution and the license are written beside the
prepared files. Nothing is placed in Git because `.local/` is ignored.
"""
from collections import Counter
from hashlib import sha256
from pathlib import Path, PurePosixPath
from zipfile import ZipFile
import shutil

import httpx

DATASET_URL = 'https://www.kaggle.com/api/v1/datasets/download/leftin/fruit-ripeness-unripe-ripe-and-rotten'
ATTRIBUTION = 'https://www.kaggle.com/datasets/leftin/fruit-ripeness-unripe-ripe-and-rotten'
DESTINATION = Path(__file__).resolve().parents[1] / '.local' / 'fruitvision'
ARCHIVE = DESTINATION / 'fruit-ripeness-dataset.zip'
OUTPUT = DESTINATION / 'prepared'
FRUITS = ('apple', 'banana', 'orange')
EXTENSIONS = {'.jpg', '.jpeg', '.png', '.webp'}


def download():
    DESTINATION.mkdir(parents=True, exist_ok=True)
    if ARCHIVE.is_file():
        print(f'Using existing archive: {ARCHIVE} ({ARCHIVE.stat().st_size:,} bytes)')
        return
    timeout = httpx.Timeout(connect=20, read=180, write=30, pool=30)
    received = 0
    with httpx.Client(timeout=timeout, trust_env=False, follow_redirects=True) as client:
        with client.stream('GET', DATASET_URL) as response:
            response.raise_for_status()
            expected = int(response.headers.get('content-length', '0'))
            if expected > 5_000_000_000:
                raise RuntimeError(f'Refusing unexpected archive size: {expected:,} bytes')
            with ARCHIVE.open('wb') as target:
                for chunk in response.iter_bytes(1024 * 1024):
                    if not chunk:
                        continue
                    target.write(chunk)
                    received += len(chunk)
                    if received // (256 * 1024 * 1024) != (received - len(chunk)) // (256 * 1024 * 1024):
                        print(f'Downloaded {received / (1024 ** 3):.2f} GiB', flush=True)
            if expected and received != expected:
                ARCHIVE.unlink(missing_ok=True)
                raise RuntimeError(f'Incomplete download ({received:,} of {expected:,} bytes)')
    print(f'Download complete: {received / (1024 ** 3):.2f} GiB', flush=True)


def classify(member_name):
    path = PurePosixPath(member_name.replace('\\', '/'))
    parts = [part.lower() for part in path.parts[:-1]]
    fruit = next((name for name in FRUITS if any(name in part for part in parts)), None)
    if not fruit:
        return None
    label = None
    for part in parts:
        if part.startswith('unripe'):
            label = 'unripe'
        elif part.startswith('rotten'):
            label = 'rotten'
        elif part.startswith('fresh') or part.startswith('ripe'):
            label = 'ripe'
    split = next((part for part in parts if part in {'train', 'test', 'val', 'valid', 'validation'}), None)
    split = 'test' if split in {'val', 'valid', 'validation'} else split
    if label and split:
        return fruit, split, label
    return None


def prepare():
    OUTPUT.mkdir(parents=True, exist_ok=True)
    counts = Counter()
    with ZipFile(ARCHIVE) as archive:
        for member in archive.infolist():
            mapped = classify(member.filename)
            if not mapped or member.is_dir() or Path(member.filename).suffix.lower() not in EXTENSIONS:
                continue
            fruit, split, label = mapped
            digest = sha256(member.filename.encode('utf-8')).hexdigest()[:16]
            suffix = Path(member.filename).suffix.lower()
            target = OUTPUT / fruit / split / label / f'{digest}{suffix}'
            target.parent.mkdir(parents=True, exist_ok=True)
            with archive.open(member) as source, target.open('wb') as destination:
                shutil.copyfileobj(source, destination, length=1024 * 1024)
            counts[(fruit, split, label)] += 1
    expected = [(fruit, split, label) for fruit in FRUITS for split in ('train', 'test')
                for label in ('ripe', 'unripe', 'rotten')]
    missing = [key for key in expected if counts[key] == 0]
    if missing:
        raise RuntimeError(f'Dataset is missing classes/splits: {missing}')
    notice = (
        'Dataset: Fruit Ripeness: Unripe, Ripe, and Rotten\n'
        'Creator: leftin (Kaggle)\n'
        f'Source: {ATTRIBUTION}\n'
        'License: CC BY-SA 4.0\n'
        'Source files are preserved in the downloaded archive; prepared image files are not committed.\n'
    )
    (DESTINATION / 'DATASET_ATTRIBUTION.txt').write_text(notice, encoding='utf-8')
    for (fruit, split, label), count in sorted(counts.items()):
        print(f'{fruit:7} {split:5} {label:7} {count:5}')
    print(f'Prepared data: {OUTPUT}', flush=True)


if __name__ == '__main__':
    download()
    prepare()
