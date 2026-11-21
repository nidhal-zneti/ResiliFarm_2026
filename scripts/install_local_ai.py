"""Install the pinned official Windows Ollama CLI inside this workspace."""
import hashlib
import os
from pathlib import Path
import shutil
from urllib.request import urlopen
import zipfile

ROOT = Path(__file__).resolve().parents[1]
VERSION = '0.40.17'
SHA256 = '3dd80f6e3a9699f2eadf4ac418f00529cee594df9557541806eda1f1f3f5588a'
URL = f'https://github.com/ollama/ollama/releases/download/v{VERSION}/ollama-windows-amd64.zip'


def main():
    if os.name != 'nt':
        raise SystemExit('Install Ollama for your platform, then use run_studio_ai.py.')
    local = ROOT / '.local'
    local.mkdir(exist_ok=True)
    archive = local / 'ollama-windows-amd64.zip'
    target = local / 'ollama'
    if (target / 'ollama.exe').exists():
        print('Workspace-local Ollama already exists; no files replaced.')
        return
    if shutil.disk_usage(local).free < 10 * 1024**3:
        raise SystemExit('Free at least 10 GiB for the archive, runtime, model and working space.')
    if not archive.exists():
        partial = archive.with_suffix('.zip.part')
        print(f'Downloading official Ollama {VERSION} (about 1.6 GB)…', flush=True)
        with urlopen(URL, timeout=60) as response, partial.open('wb') as output:
            shutil.copyfileobj(response, output)
        partial.replace(archive)
    with archive.open('rb') as source:
        digest = hashlib.file_digest(source, 'sha256').hexdigest()
    if digest != SHA256:
        raise SystemExit('Archive checksum mismatch. Installation stopped; remove the archive and retry.')
    print('SHA-256 verified. Extracting into .local/ollama…', flush=True)
    with zipfile.ZipFile(archive) as package:
        target_root = target.resolve()
        for member in package.infolist():
            if not (target / member.filename).resolve().is_relative_to(target_root):
                raise SystemExit('Archive contains an invalid extraction path.')
        package.extractall(target)
    print('Installed. Next: .venv\\Scripts\\python.exe scripts/run_studio_ai.py --pull')


if __name__ == '__main__':
    main()
