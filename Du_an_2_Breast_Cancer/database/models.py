from sqlalchemy import Column, DateTime, Float, Integer, String, Text
from sqlalchemy.dialects.postgresql import insert as postgres_insert
from sqlalchemy.dialects.sqlite import insert as sqlite_insert
from sqlalchemy.exc import IntegrityError

from database.db import Base, engine


class BcUser(Base):
    __tablename__ = "bc_users"

    user_id = Column(String(100), primary_key=True)
    first_seen_at = Column(DateTime(timezone=True), nullable=False)


def register_bc_user(session, user_id, first_seen_at) -> None:
    insert = {
        "postgresql": postgres_insert,
        "sqlite": sqlite_insert,
    }.get(session.bind.dialect.name)
    if insert is not None:
        statement = insert(BcUser).values(
            user_id=user_id,
            first_seen_at=first_seen_at,
        )
        session.execute(
            statement.on_conflict_do_nothing(index_elements=[BcUser.user_id])
        )
        return

    if session.get(BcUser, user_id) is not None:
        return
    try:
        with session.begin_nested():
            session.add(BcUser(user_id=user_id, first_seen_at=first_seen_at))
    except IntegrityError:
        if session.get(BcUser, user_id) is None:
            raise


class BcPrediction(Base):
    __tablename__ = "bc_predictions"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(String(100), index=True, nullable=False)
    created_at = Column(DateTime(timezone=True), nullable=False)
    model_version = Column(String(50), nullable=False)
    predicted_label = Column(String(20), nullable=False)
    probability_malignant = Column(Float, nullable=False)
    probability_benign = Column(Float, nullable=False)
    threshold = Column(Float, nullable=False)
    features_json = Column(Text, nullable=False)


Base.metadata.create_all(bind=engine)
