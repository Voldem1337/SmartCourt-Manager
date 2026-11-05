from fastapi import FastAPI, Depends, HTTPException
from sqlalchemy.orm import Session
from database.database import engine, SessionLocal
from database import models, schemas, crud
import re
# creates a file for database
models.Base.metadata.create_all(bind=engine)

app = FastAPI(title="CourtFlow AI API")

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
@app.get("/")
def root():
    return {"message": "The server is working, database created!"}

@app.post("/users/", response_model=schemas.UserResponse)
def create_user(user: schemas.UserCreate, db: Session = Depends(get_db)):
    db_user = crud.get_user_by_email(db, email=user.email)
    if db_user:
        raise HTTPException(status_code=400, detail="Email already registered")
    return crud.create_user(db, user=user)

@app.post("/courts/", response_model=schemas.CourtResponse)
def create_court(court: schemas.CourtCreate,db: Session = Depends(get_db)):
    return crud.create_court(db, court=court)


def analyze_email(email_text):
    pass

def extract_time(booking_time):
    pass
def send_email(sender_email, subject, reply):
    pass
def forward_to_admin(sender_email, email_text, note):
    pass

def process_email(email_text: str, sender_email: str):
    # Получаем все намерения из письма (кроме 'ignore')
    # Например: {'booking', 'admin'} или просто {'booking'}
    intents = analyze_email(email_text)

    # 1. Если клиент хочет бронь (даже если там есть еще и вопрос)
    if "booking" in intents:
        booking_time = extract_time(email_text)

        if booking_time:
            # Проверяем БД и бронируем корт
            # is_free = crud.check_and_book(booking_time, sender_email)
            reply = f"Tere! Väljak on teile broneeritud ajaks {booking_time}."

            # Если в этом же письме был вопрос ('admin')
            if "admin" in intents:
                reply += "\n\nEdastasime teie lisaküsimuse administraatorile, kes vastab teile peagi!"
                forward_to_admin(sender_email, email_text, note="Бронь уже создана, нужно ответить только на вопрос!")

            send_email(sender_email, "Broneeringu kinnitus", reply)
        else:
            # Времени нет, а может еще и вопрос есть -> проще сразу отдать админу или спросить время
            if "admin" in intents:
                forward_to_admin(sender_email, email_text, note="Хочет бронь (без времени) + вопрос")
            else:
                send_email(sender_email, "Täpsustus", "Tere! Mis kellaks te soovite väljakut broneerida?")

    # 2. Если клиент хочет отмену
    elif "cancel" in intents:
        # Логика отмены...
        pass

    # 3. Если в письме ТОЛЬКО вопросы или нестандартный запрос
    elif "admin" in intents:
        forward_to_admin(sender_email, email_text, note="Вопрос от клиента")