"""Opt-in real-model checks, isolated from the user's saved demo projects."""
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
os.environ['STUDIO_AI_BASE_URL'] = 'http://127.0.0.1:11434/v1'
os.environ['STUDIO_AI_MODEL'] = 'qwen3:4b-instruct'
os.environ['STUDIO_AI_API_KEY'] = ''
database = tempfile.TemporaryDirectory(prefix='resilifarm-ai-')
os.environ['DATABASE_URL'] = 'sqlite:///' + str(Path(database.name) / 'smoke.db')

from fastapi.testclient import TestClient
from backend.app.main import app
from backend.app import db


def main():
    records = []
    try:
        with TestClient(app) as client:
            assert client.get('/api/v1/aiot/provider').json()['available'], 'Local Qwen model is not available'
            for language, text in [
                ('en', 'My field has no Wi-Fi and I want solar power for an irrigation controller.'),
                ('fr', 'Je veux un contrôleur d’irrigation solaire pour mon champ sans Wi-Fi. Utilisez une liaison radio longue portée.'),
                ('ja', '農場の灌漑制御装置に太陽光電源を使いたいです。Wi-Fiはないので長距離無線を使ってください。'),
            ]:
                started = time.monotonic()
                r = client.post('/api/v1/aiot/projects', json={'text':text,'language':language,'name':'Isolated AI verification'})
                assert r.status_code == 201, (language, r.text)
                project = r.json()
                design = project['design']
                assert design['generation_source'] == 'provider'
                assert design['options']['solar'] and design['options']['lora'], (language,design['options'])
                assert {'solar','charger','battery','lora'} <= {part['key'] for part in design['bom']}
                records.append({'case':language,'seconds':round(time.monotonic()-started,2),'solar':True,'lora':True})
                print(json.dumps(records[-1]), flush=True)
            base = f"/api/v1/aiot/projects/{project['id']}"
            previous_count = design['options']['soil_count']
            edit = client.post(base+'/messages', json={'text':'Add exactly one more soil sensor; keep everything else unchanged.'})
            assert edit.status_code == 200, edit.text
            updated = edit.json()['design']
            assert updated['options']['soil_count'] == previous_count+1
            assert updated['options']['solar'] and updated['options']['lora']
            negative = client.post(base+'/messages', json={'text':'Remove solar power. Keep the long-range radio.'})
            assert negative.status_code == 200, negative.text
            assert not negative.json()['design']['options']['solar']
            assert negative.json()['design']['options']['lora']
            before = client.get(base).json()
            for prompt in ['robot', 'Design a spaceship']:
                rejected = client.post(base+'/messages',json={'text':prompt})
                assert rejected.status_code == 422, rejected.text
            assert client.get(base).json() == before
            export = client.get(base+'/export?language=ja')
            assert export.status_code == 200
            with zipfile.ZipFile(io.BytesIO(export.content)) as archive:
                assert json.loads(archive.read('design.json'))['design']['generation_source'] == 'provider'
                assert 'digitalWrite(relayPin, LOW)' in archive.read('starter.ino').decode()
            print('Passed: EN/FR/JA real-model planning, contextual edits, negative requirements, unsupported requests without persistence, ZIP export.', flush=True)
    finally:
        db.engine.dispose()
        database.cleanup()


if __name__ == '__main__':
    main()
