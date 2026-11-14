import pytest

from database.db import connect_database, normalize_db_url


def test_normalize_db_url_accepts_provider_urls():
    assert (
        normalize_db_url("postgres://u:p@host/db")
        == "postgresql+psycopg2://u:p@host/db"
    )
    assert (
        normalize_db_url(" postgresql://u:p@host/db?sslmode=require\n")
        == "postgresql+psycopg2://u:p@host/db?sslmode=require"
    )
    assert normalize_db_url("sqlite:///./x.db") == "sqlite:///./x.db"


def test_explicit_database_url_failure_is_loud_and_redacted():
    with pytest.raises(RuntimeError) as error:
        connect_database(
            "postgresql://user:SECRET-PASSWORD@127.0.0.1:1/unreachable"
        )
    assert "SECRET-PASSWORD" not in str(error.value)
    assert "will not fall back" in str(error.value)


def test_explicit_invalid_url_failure_is_loud():
    with pytest.raises(RuntimeError, match="invalid format"):
        connect_database("not a database URL")


def test_explicit_sqlite_url_connects():
    engine = connect_database("sqlite:///./test_explicit_bc.db")
    assert engine.dialect.name == "sqlite"
    engine.dispose()
