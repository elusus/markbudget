from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from .config import Settings


settings = Settings()

# Using synchronous SQLAlchemy engine with psycopg
engine = create_engine(settings.postgres_url, future=True)
SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False, future=True)


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

