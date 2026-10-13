import os
from pathlib import Path


BASE_DIR = Path(__file__).resolve().parents[1]
DATA_DIR = Path(os.getenv("STUDY_DATA_DIR", BASE_DIR / "data"))
UPLOAD_DIR = DATA_DIR / "uploads"
DATABASE_URL = os.getenv("STUDY_DATABASE_URL", f"sqlite:///{DATA_DIR / 'semester.db'}")
MAX_UPLOAD_BYTES = 12 * 1024 * 1024
ALLOWED_FILE_TYPES = {
    ".csv",
    ".doc",
    ".docx",
    ".jpeg",
    ".jpg",
    ".md",
    ".pdf",
    ".png",
    ".ppt",
    ".pptx",
    ".txt",
    ".webp",
    ".xls",
    ".xlsx",
    ".zip",
}

DATA_DIR.mkdir(parents=True, exist_ok=True)
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)