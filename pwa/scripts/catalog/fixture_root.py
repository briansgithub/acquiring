"""Short fixture roots on Windows: chunk paths under pwa/.artifacts exceed MAX_PATH (260) there."""
import os
import tempfile
import uuid
from pathlib import Path


def fixture_root(name: str) -> Path:
    if os.name == 'nt':
        return Path(tempfile.gettempdir()) / 'acq-fx' / f'{name[:8]}-{uuid.uuid4().hex[:12]}'
    return Path.cwd() / '.artifacts' / 'pwa-port' / name / str(uuid.uuid4())
