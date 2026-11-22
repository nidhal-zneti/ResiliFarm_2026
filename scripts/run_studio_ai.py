"""Run the localhost demo with workspace-local Ollama and Qwen (no paid API)."""
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import time
from urllib.request import urlopen
from urllib.error import URLError

ROOT = Path(__file__).resolve().parents[1]
MODEL = 'qwen3:4b-instruct'
OLLAMA_URL = 'http://127.0.0.1:11434'


def get(path):
    with urlopen(OLLAMA_URL + path, timeout=2) as response:
        return json.load(response)


def load_local_env(path):
    """Load simple KEY=VALUE settings without overriding the process environment."""
    if not path.is_file():
        return
    for line in path.read_text(encoding='utf-8').splitlines():
        line = line.strip()
        if not line or line.startswith('#') or '=' not in line:
            continue
        name, value = line.split('=', 1)
        value = value.strip().strip('"').strip("'")
        if name.strip() and value:
            os.environ.setdefault(name.strip(), value)


def main():
    load_local_env(ROOT / '.env')
    runtime = ROOT / '.local/ollama/ollama.exe'
    executable = str(runtime) if runtime.is_file() else shutil.which('ollama')
    if not executable:
        raise SystemExit('Install Ollama first; see README.md, Local pretrained Studio AI.')
    local = ROOT / '.local'
    local.mkdir(exist_ok=True)
    env = os.environ.copy()
    env.update({
        'OLLAMA_HOST': '127.0.0.1:11434',
        'OLLAMA_MODELS': str(local / 'models'),
        'OLLAMA_CONTEXT_LENGTH': '4096',
        'OLLAMA_NUM_PARALLEL': '1',
        'OLLAMA_NO_CLOUD': '1',
        'STUDIO_AI_BASE_URL': OLLAMA_URL + '/v1',
        'STUDIO_AI_MODEL': MODEL,
        'STUDIO_AI_API_KEY': '',
    })
    owned_server = None
    log = None
    try:
        try:
            get('/api/version')
        except (URLError, OSError, ValueError):
            log = (local / 'ollama.log').open('ab')
            owned_server = subprocess.Popen(
                [executable, 'serve'], cwd=ROOT, env=env, stdout=log, stderr=log,
                creationflags=subprocess.CREATE_NO_WINDOW if os.name == 'nt' else 0,
            )
            deadline = time.monotonic() + 30
            while True:
                try:
                    get('/api/version')
                    break
                except (URLError, OSError, ValueError):
                    if time.monotonic() >= deadline or owned_server.poll() is not None:
                        raise SystemExit('Ollama did not start; check .local/ollama.log.')
                    time.sleep(.5)
        models = get('/api/tags').get('models', [])
        if not any(item.get('name') == MODEL for item in models):
            if '--pull' not in sys.argv:
                raise SystemExit('Qwen is not downloaded. Run this launcher with --pull once (about 2.5 GB).')
            subprocess.run([executable, 'pull', MODEL], env=env, check=True)
        print(f'Studio AI: {MODEL} via {OLLAMA_URL}. Starting API on localhost:8000.', flush=True)
        result = subprocess.run(
            [sys.executable, '-m', 'uvicorn', 'backend.app.main:app', '--host', '127.0.0.1', '--port', '8000'],
            cwd=ROOT, env=env,
        )
        return result.returncode
    except KeyboardInterrupt:
        return 0
    finally:
        if owned_server is not None:
            owned_server.terminate()
            try:
                owned_server.wait(timeout=10)
            except subprocess.TimeoutExpired:
                owned_server.kill()
        if log is not None:
            log.close()


if __name__ == '__main__':
    raise SystemExit(main())
