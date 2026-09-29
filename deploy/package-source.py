"""Create a source-only archive for the embedded release artifact."""
import argparse
import hashlib
import os
from pathlib import Path
import zipfile

ROOTS = ('web', 'src', 'tests', 'deploy', 'config', 'branding', 'docs', '.github')
ROOT_FILES = ('README.md', 'requirements.txt', 'main.py', 'pytest.ini', 'Dockerfile',
              '.dockerignore', '.gitignore', 'docker-compose.yml',
              'docker-compose.images.yml', 'docker-compose.marketplace.yml', 'start-dev.ps1')
SKIP_DIRS = {'node_modules', '.git', '.venv', '__pycache__', '.output', '.tanstack',
             'dist', 'build', 'coverage', '.cache', '.artifacts', 'data', 'reports',
             '.idea', '.codex', '.claude', '.pnpm-store'}
SKIP_SUFFIXES = {'.pem', '.key', '.p12', '.pfx', '.jks', '.sqlite', '.sqlite3', '.db',
                 '.log', '.pyc', '.zip', '.tgz', '.tar', '.gz'}
def allowed(path):
    name = path.name.lower()
    return not (name.startswith('.env') or name in {'id_rsa', 'id_ed25519', '.npmrc', '.netrc'}
                or path.suffix.lower() in SKIP_SUFFIXES or path.is_symlink())

def package(root, output):
    files = [root / f for f in ROOT_FILES if (root / f).is_file()]
    for name in ROOTS:
        for parent, dirs, names in os.walk(root / name, followlinks=False):
            dirs[:] = sorted(d for d in dirs if d not in SKIP_DIRS and not d.startswith('.pytest')
                             and not (Path(parent) / d).is_symlink())
            files.extend(Path(parent) / f for f in names if allowed(Path(parent) / f))
    output.parent.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(output, 'w', zipfile.ZIP_DEFLATED) as archive:
        for path in sorted(files):
            if allowed(path):
                archive.write(path, 'project/' + path.relative_to(root).as_posix())
    digest = hashlib.sha256(output.read_bytes()).hexdigest()
    output.with_suffix(output.suffix + '.sha256').write_text(f'{digest}  {output.name}\n', encoding='utf-8')
    print(f'Created {output.name}: {len(files)} source files')

if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--root', type=Path, default=Path('.'))
    parser.add_argument('--output', type=Path, required=True)
    args = parser.parse_args()
    package(args.root.resolve(), args.output.resolve())
