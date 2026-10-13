#!/usr/bin/env python3
"""Create a consistent SQLite snapshot and copy uploaded attachment files."""

from datetime import datetime
import os
from pathlib import Path
import shutil
import sqlite3
import sys
from urllib.parse import unquote


ROOT_DIR = Path(__file__).resolve().parent
DATA_DIR = Path(os.getenv("STUDY_DATA_DIR", ROOT_DIR / "Backend" / "data"))
BACKUP_DIR = Path(os.getenv("BACKUP_DIR", ROOT_DIR / "backup"))


def database_path() -> Path:
    database_url = os.getenv("STUDY_DATABASE_URL")
    if not database_url:
        return DATA_DIR / "semester.db"
    if not database_url.startswith("sqlite:///"):
        raise ValueError("This backup helper supports SQLite URLs only")

    location = unquote(database_url.removeprefix("sqlite:///" ).split("?", 1)[0])
    if not location or location == ":memory:":
        raise ValueError("The configured SQLite URL does not point to a database file")
    return Path(location)


def main() -> int:
    source_path = database_path()
    if not source_path.is_file():
        print(f"Database not found: {source_path}", file=sys.stderr)
        return 1

    BACKUP_DIR.mkdir(parents=True, exist_ok=True)
    timestamp = datetime.now().astimezone().strftime("%Y%m%d-%H%M%S")
    destination = BACKUP_DIR / timestamp
    suffix = 1
    while destination.exists():
        destination = BACKUP_DIR / f"{timestamp}-{suffix}"
        suffix += 1

    temporary = BACKUP_DIR / f".{destination.name}.tmp"
    temporary.mkdir()
    try:
        source = sqlite3.connect(f"{source_path.resolve().as_uri()}?mode=ro", uri=True)
        target = sqlite3.connect(temporary / "semester.db")
        try:
            source.backup(target)
        finally:
            target.close()
            source.close()

        uploads = DATA_DIR / "uploads"
        if uploads.is_dir():
            shutil.copytree(uploads, temporary / "uploads")

        temporary.rename(destination)
    except Exception:
        shutil.rmtree(temporary, ignore_errors=True)
        raise

    print(f"Backup created: {destination}")
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except (OSError, sqlite3.Error, ValueError) as error:
        print(f"Backup failed: {error}", file=sys.stderr)
        raise SystemExit(1)