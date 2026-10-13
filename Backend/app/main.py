from contextlib import asynccontextmanager
from fastapi import FastAPI

from app.api import router
from app.database import Base, engine


def initialize_database() -> None:
    Base.metadata.create_all(bind=engine)


@asynccontextmanager
async def lifespan(_app: FastAPI):
    initialize_database()
    yield


app = FastAPI(title="Unotes", version="1.0.0", lifespan=lifespan)
app.include_router(router)