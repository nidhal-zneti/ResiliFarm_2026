"""Opt-in Qwen firmware generation, compilation and ZIP round-trip in a disposable DB."""
import argparse
import io
import json
import os
from pathlib import Path
import sys
import tempfile
import time
import zipfile

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    compilation = parser.add_mutually_exclusive_group()
    compilation.add_argument('--require-compile', action='store_true')
    compilation.add_argument('--generation-only', action='store_true', help='Check real inference and export while skipping compilation explicitly.')
    parser.add_argument('--all-drivers', action='store_true', help='Include SHT31 and LoRa drivers.')
    parser.add_argument('--output', type=Path, default=ROOT / '.local/firmware-verification')
    args = parser.parse_args()
    # Explicitly local inference; do not load .env credentials or touch saved projects.
    os.environ['STUDIO_AI_BASE_URL'] = 'http://127.0.0.1:11434/v1'
    os.environ['STUDIO_AI_MODEL'] = 'qwen3:4b-instruct'
    os.environ['STUDIO_AI_API_KEY'] = ''
    (ROOT / '.local').mkdir(exist_ok=True)
    with tempfile.TemporaryDirectory(prefix='resilifarm-firmware-', dir=ROOT / '.local') as folder:
        os.environ['DATABASE_URL'] = 'sqlite:///' + str(Path(folder) / 'smoke.db')
        from fastapi.testclient import TestClient
        from backend.app import db
        from backend.app.main import app, save_version
        from backend.app.studio import generate
        if args.generation_only:
            from backend.app import firmware_generation
            firmware_generation.compile_sketch = lambda code: 'not_checked'
        try:
            # Seed a deterministic design; only firmware generation calls the real model.
            os.environ.pop('STUDIO_AI_BASE_URL')
            os.environ.pop('STUDIO_AI_MODEL')
            design = generate('irrigation with 2 soil sensors')
            design['farm_context'] = {'zones': 2, 'area_ha': 1}
            design['options']['pressure'] = True
            design['options']['lora'] = args.all_drivers
            os.environ['STUDIO_AI_BASE_URL'] = 'http://127.0.0.1:11434/v1'
            os.environ['STUDIO_AI_MODEL'] = 'qwen3:4b-instruct'
            with TestClient(app) as client:
                assert client.get('/api/v1/aiot/provider').json()['available'], 'Start local Qwen first'
                with db.engine.begin() as connection:
                    pid = connection.execute(db.projects.insert().values(region_id=1, name='Firmware verification')).inserted_primary_key[0]
                    save_version(connection, pid, 'Two-zone irrigation', design, 1)
                base = f'/api/v1/aiot/projects/{pid}'
                started = time.monotonic()
                print('Generating firmware with local Qwen; compilation ' + ('explicitly skipped.' if args.generation_only else 'follows when installed.'), flush=True)
                response = client.post(base + '/firmware', json={
                    'version': 1, 'relay_active_low': True,
                    'temperature_sensor': 'sht31' if args.all_drivers else 'none',
                    'requirements': 'Water below 30 percent moisture, stop above 50 percent. Water for at most 30 seconds; rest 10 minutes. Control both zones.',
                })
                assert response.status_code == 200, response.text
                project = response.json()
                info = project['design']['firmware_generation']
                assert info['source'] == 'provider' and info['model'] == 'qwen3:4b-instruct'
                assert len(project['versions']) == 2 and project['versions'][0]['design'] == design
                if args.require_compile:
                    assert info['compile_status'] == 'passed', info
                assert not info['hardware_tested'] and not info['outputs_enabled']
                archive_response = client.get(base + '/export?version=2')
                assert archive_response.status_code == 200
                with zipfile.ZipFile(io.BytesIO(archive_response.content)) as archive:
                    assert archive.read('resilifarm/resilifarm.ino').decode() == project['design']['firmware']
                    assert json.loads(archive.read('firmware_manifest.json')) == info
                args.output.mkdir(parents=True, exist_ok=True)
                (args.output / 'resilifarm.zip').write_bytes(archive_response.content)
                (args.output / 'resilifarm.ino').write_text(project['design']['firmware'], encoding='utf-8')
                summary = {'model': info['model'], 'compile_status': info['compile_status'],
                           'all_drivers': args.all_drivers, 'seconds': round(time.monotonic() - started, 1),
                           'version_and_export': 'passed', 'hardware_tested': False}
                (args.output / 'verification.json').write_text(json.dumps(summary, indent=2), encoding='utf-8')
                print(json.dumps(summary), flush=True)
        finally:
            db.engine.dispose()


if __name__ == '__main__':
    main()
