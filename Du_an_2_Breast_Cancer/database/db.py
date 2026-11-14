import os
from pathlib import Path

from sqlalchemy import create_engine, text
from sqlalchemy.engine import make_url
from sqlalchemy.orm import declarative_base, sessionmaker


_FALLBACK_DB = Path(__file__).resolve().parent / "bc_fallback.db"


def normalize_db_url(url: str) -> str:
    """Normalize provider PostgreSQL URLs for the installed psycopg2 driver."""
    url = url.strip()
    for prefix in ("postgres://", "postgresql://"):
        if url.startswith(prefix):
            return "postgresql+psycopg2://" + url[len(prefix) :]
    return url


def _make_engine(url: str):
    parsed = make_url(url)
    connect_args = {"check_same_thread": False} if parsed.drivername == "sqlite" else {}
    engine = create_engine(
        url,
        connect_args=connect_args,
        pool_pre_ping=True,
        pool_recycle=300,
    )
    with engine.connect() as connection:
        connection.execute(text("SELECT 1"))
    return engine


def connect_database(explicit_url: str | None):
    """Use SQLite by default; never mask failure of an explicit DATABASE_URL."""
    if not explicit_url:
        return create_engine(
            f"sqlite:///{_FALLBACK_DB.as_posix()}",
            connect_args={"check_same_thread": False},
        )

    url = normalize_db_url(explicit_url)
    try:
        make_url(url)
    except Exception:
        raise RuntimeError("DATABASE_URL has an invalid format.") from None

    try:
        return _make_engine(url)
    except Exception as exc:
        raise RuntimeError(
            "DATABASE_URL is set but the database connection failed "
            f"({type(exc).__name__}). The service will not fall back to SQLite."
        ) from None


DATABASE_URL = os.getenv("DATABASE_URL") or None
engine = connect_database(DATABASE_URL)
SessionLocal = sessionmaker(
    autocommit=False,
    autoflush=False,
    expire_on_commit=False,
    bind=engine,
)
Base = declarative_base()


def get_db_session():
    session = SessionLocal()
    try:
        yield session
    finally:
        session.close()
