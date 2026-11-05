from pydantic import BaseModel, ConfigDict
from datetime import datetime
from typing import Optional
from .models import SportType

class UserBase(BaseModel):
    email: str
    name: Optional[str] = None

class UserCreate(UserBase):
    pass

class UserResponse(UserBase):
    id: int
    model_config = ConfigDict(from_attributes=True)

class BookingBase(BaseModel):
    court_id: int
    start_time: datetime
    end_time: datetime
    sport_type: SportType

class BookingCreate(BookingBase):
    pass

class BookingResponse(BookingBase):
    id: int
    user_id: int
    status: str
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)

class CourtBase(BaseModel):
    name: str

class CourtCreate(CourtBase):
    pass

class CourtResponse(CourtBase):
    id: int

    model_config = ConfigDict(from_attributes=True)