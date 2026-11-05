import enum
from sqlalchemy.orm import relationship
from datetime import datetime
from .database import Base
from sqlalchemy import Column, Integer, String,ForeignKey,DateTime, Enum as SQLEnum

class User(Base):
    __tablename__ = "users"
    id = Column(Integer, primary_key=True, index=True)
    email = Column(String, unique=True, index=True)
    name = Column(String, nullable=True)
    telephone = Column(String, nullable=True,unique=True)

class SportType(str, enum.Enum):
    BEACH_VOLLEYBALL = "beach_volleyball"
    BEACH_TENNIS = "beach_tennis"
    BEACH_Football = "beach_football"

class Court(Base):
    __tablename__ = "courts"
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=True)

class Booking(Base):
    __tablename__ = "bookings"
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"))
    court_id = Column(Integer, ForeignKey("courts.id"))


    start_time = Column(DateTime, nullable=False)
    end_time = Column(DateTime, nullable=False)

    sport_type = Column(SQLEnum(SportType), nullable=False)

    created_at = Column(DateTime, default=datetime.utcnow)
    status = Column(String, default="pending")

    user = relationship("User")
    court = relationship("Court")
