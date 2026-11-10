from sqlalchemy.orm import Session
from datetime import datetime
from . import models, schemas


def get_user_by_email(db: Session, email: str):
    return db.query(models.User).filter(models.User.email == email).first()

def create_user(db: Session, user: schemas.UserCreate):
    db_user = models.User(email=user.email, name=user.name)
    db.add(db_user)
    db.commit()
    db.refresh(db_user)
    return db_user

def create_booking(db: Session, booking: schemas.BookingCreate, user_id: int):
    db_booking = models.Booking(
        user_id=user_id,
        court_id=booking.court_id,
        start_time=booking.start_time,
        end_time=booking.end_time,
        sport_type=booking.sport_type,
        status="confirmed",
    )
    db.add(db_booking)
    db.commit()
    db.refresh(db_booking)
    return db_booking

def create_court(db: Session, court: schemas.CourtCreate):
    db_court = models.Court(name=court.name)
    db.add(db_court)
    db.commit()
    db.refresh(db_court)
    return db_court

def get_or_create_user(db: Session, email: str):
    """Finds an existing user by email or creates a new one automatically."""
    user = get_user_by_email(db, email)
    if not user:
        name_part = email.split("@")[0]
        user = models.User(email=email, name=name_part)
        db.add(user)
        db.commit()
        db.refresh(user)
    return user

def ensure_default_courts(db: Session):
    """Creates 2 default courts if the courts table is empty."""
    if db.query(models.Court).count() == 0:
        db.add_all([models.Court(name="Väljak 1"), models.Court(name="Väljak 2")])
        db.commit()

def find_available_court(db: Session, start_time: datetime, end_time: datetime) -> models.Court | None:
    """Returns the first court that has no overlapping active bookings."""
    ensure_default_courts(db)
    courts = db.query(models.Court).all()

    for court in courts:
        overlap = db.query(models.Booking).filter(
            models.Booking.court_id == court.id,
            models.Booking.status != "cancelled",
            models.Booking.start_time < end_time,
            models.Booking.end_time > start_time
        ).first()
        if not overlap:
            return court
    return None
def get_all_bookings(db: Session):
    """Returns all bookings ordered by start time."""
    return db.query(models.Booking).order_by(models.Booking.start_time).all()