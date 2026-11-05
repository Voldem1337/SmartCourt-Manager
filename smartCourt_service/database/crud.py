from sqlalchemy.orm import Session
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
        status="pending",
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