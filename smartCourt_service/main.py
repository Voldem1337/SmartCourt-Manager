import os
import sys
from datetime import datetime, timedelta
from contextlib import asynccontextmanager
from pydantic import BaseModel
from fastapi import FastAPI, Depends, HTTPException
from sqlalchemy.orm import Session
from apscheduler.schedulers.background import BackgroundScheduler

ROOT_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if ROOT_DIR not in sys.path:
    sys.path.append(ROOT_DIR)

from database.database import engine, SessionLocal
from database import models, schemas, crud
from nlp_model.nlp_parser import (
    analyze_email_intents,
    extract_date,
    extract_time_obj,
    extract_sport_type,
    extract_duration_minutes
)
from email_reader import fetch_unread_emails, send_email, forward_to_admin

models.Base.metadata.create_all(bind=engine)


def background_email_task():
    # Create a separate DB session as the function works outside of normal queries
    db = SessionLocal()
    try:
        emails = fetch_unread_emails()
        if emails:
            print(f"\n[Scheduler] 📨 Found {len(emails)} new emails. Start processing...")
            for item in emails:
                full_text = f"{item['subject']}. {item['body']}"
                process_single_email(full_text, item["from"], db, send_real_email=True)
    except Exception as e:
        print(f"[Scheduler Error] Email background check error: {e}")
    finally:
        db.close()


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup actions
    scheduler = BackgroundScheduler()
    scheduler.add_job(background_email_task, 'interval', minutes=1)
    scheduler.start()
    print("🕒 Background scheduler running: check Gmail every minute.")

    yield  # Here the server is running and receiving requests

    # Shutdown actions
    scheduler.shutdown()
    print("🛑 Background planner stopped.")


app = FastAPI(title="CourtFlow AI API", lifespan=lifespan)

# Estonian names for sports to display nicely in confirmation emails
SPORT_NAMES_ET = {
    "beach_volleyball": "Rannavõrkpall",
    "beach_tennis": "Rannatennis",
    "beach_football": "Rannajalgpall"
}

LOGO_URL = "https://img.icons8.com/color/96/000000/volleyball.png"


def build_html_email(title: str, greeting: str, content_html: str) -> str:
    """Wraps any email content into a unified, branded SmartCourt HTML template."""
    return f"""
    <html>
    <body style="font-family: 'Segoe UI', Arial, sans-serif; color: #2c3e50; line-height: 1.6; background-color: #f4f7f9; padding: 20px; margin: 0;">
        <div style="max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 12px rgba(0,0,0,0.06);">

            <!-- Top Brand Banner -->
            <div style="background: linear-gradient(135deg, #1e3c72 0%, #2a5298 100%); padding: 22px 28px; color: #ffffff;">
                <table style="width: 100%; border-collapse: collapse;">
                    <tr>
                        <td style="vertical-align: middle;">
                            <div style="font-size: 12px; text-transform: uppercase; letter-spacing: 1.5px; color: #f39c12; font-weight: bold; margin-bottom: 4px;">
                                SmartCourt Arena
                            </div>
                            <h2 style="margin: 0; font-size: 20px; font-weight: 700; color: #ffffff;">{title}</h2>
                        </td>
                        <td style="width: 50px; text-align: right; vertical-align: middle;">
                            <img src="{LOGO_URL}" alt="Logo" width="44" height="44" style="display: block; margin-left: auto;">
                        </td>
                    </tr>
                </table>
            </div>

            <!-- Main Message Body -->
            <div style="padding: 28px;">
                <p style="font-size: 16px; margin-top: 0; color: #2c3e50;"><strong>{greeting}</strong></p>

                {content_html}

                <!-- Unified Signature & Contact Footer -->
                <hr style="border: none; border-top: 1px solid #edf2f7; margin: 32px 0 20px 0;" />
                <table style="width: 100%; max-width: 450px; border-collapse: collapse;">
                    <tr>
                        <td style="width: 75px; vertical-align: top; padding-right: 12px;">
                            <img src="{LOGO_URL}" alt="SmartCourt Logo" width="64" height="64" style="border-radius: 10px; background-color: #f8fafc; padding: 4px;">
                        </td>
                        <td style="vertical-align: top; font-size: 13.5px; line-height: 1.5;">
                            <span style="color: #7f8c8d;">Sportliku tervitusega,</span><br>
                            <strong style="color: #1e3c72; font-size: 15px;">SmartCourt Broneerimissüsteem</strong><br>
                            <div style="margin-top: 6px; color: #4a5568;">
                                📞 <a href="tel:+37255555555" style="color: #2980b9; text-decoration: none;">+372 5555 5555</a><br>
                                📧 <a href="mailto:info@smartcourt.ee" style="color: #2980b9; text-decoration: none;">info@smartcourt.ee</a><br>
                                📍 Rannahoone 44, Tallinn
                            </div>
                        </td>
                    </tr>
                </table>
            </div>

        </div>
    </body>
    </html>
    """


class EmailSimulationRequest(BaseModel):
    sender_email: str = "test.klient@gmail.com"
    subject: str = "Väljaku broneerimine"
    body: str = "Tere! Soovin broneerida rannavõrkpalli väljaku homme kell 18:00 kaheks tunniks."
    send_real_email: bool = False


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
def create_court(court: schemas.CourtCreate, db: Session = Depends(get_db)):
    return crud.create_court(db, court=court)


def process_single_email(
        email_text: str,
        sender_email: str,
        db: Session,
        send_real_email: bool = True
) -> dict:
    intents = analyze_email_intents(email_text)
    booking_date, date_status = extract_date(email_text)
    booking_time = extract_time_obj(email_text)
    duration_mins = extract_duration_minutes(email_text)

    action_taken = "ignored"
    booking_id = None
    reply_subject = None
    reply_body = None

    # CASE 0: Client wants to reschedule (both 'cancel' and 'booking' in the same email)
    if "booking" in intents and "cancel" in intents:
        reply_subject = "Broneeringu muutmise päring - SmartCourt"
        content = """
            <p>Saime teie broneeringu muutmise soovi ilusti kätte!</p>
            <div style="background-color: #fff8e6; border-left: 4px solid #f39c12; padding: 15px; border-radius: 6px; margin: 18px 0;">
                Edastasime teie päringu meie administraatorile, kes tühistab vana aja, 
                kontrollib uue soovitud aja saadavust ja saadab teile peagi kinnituse.
            </div>
        """
        reply_body = build_html_email(
            title="Broneeringu muutmine 🔄",
            greeting="Tere, hea rannaspordi sõber!",
            content_html=content
        )
        if send_real_email:
            forward_to_admin(
                sender_email,
                email_text,
                note="RESCHEDULE REQUEST: Client wants to cancel an existing booking and book a new time."
            )
        action_taken = "reschedule_forwarded_to_admin"

    # CASE 1: Client wants to book a court
    elif "booking" in intents:
        # 1a. Date is invalid (e.g. 31.02) or outside the 90-day booking window (typo)
        if date_status in ("invalid_calendar_date", "typo_or_too_far"):
            reply_subject = "Täpsustus kuupäeva kohta - SmartCourt"
            content = """
                <p>Täname, et soovite meie juurde mängima tulla! Kahjuks ei õnnestunud meil teie kirjast soovitud kuupäeva tuvastada.</p>
                <div style="background-color: #fdf2e9; border-left: 4px solid #e67e22; padding: 15px; border-radius: 6px; margin: 18px 0;">
                    Tuletame meelde, et väljakuid saab broneerida kuni <strong>3 kuud ette</strong>.<br>
                    Palun vastake sellele kirjale ning täpsustage soovitud kuupäeva ja kellaaega!
                </div>
            """
            reply_body = build_html_email(
                title="Kuupäeva täpsustus 📅",
                greeting="Tere, hea spordisõber!",
                content_html=content
            )
            action_taken = f"rejected_{date_status}"

        # 1b. Both valid date and time are present -> Check availability & create booking
        elif booking_date and booking_time:
            start_dt = datetime.combine(booking_date, booking_time)
            end_dt = start_dt + timedelta(minutes=duration_mins)

            available_court = crud.find_available_court(db, start_dt, end_dt)

            if available_court:
                user = crud.get_or_create_user(db, sender_email)
                sport_str = extract_sport_type(email_text)
                sport_et = SPORT_NAMES_ET.get(sport_str, "Rannavõrkpall")

                booking_in = schemas.BookingCreate(
                    court_id=available_court.id,
                    start_time=start_dt,
                    end_time=end_dt,
                    sport_type=models.SportType(sport_str)
                )
                new_booking = crud.create_booking(db, booking=booking_in, user_id=user.id)
                booking_id = new_booking.id

                date_str = start_dt.strftime("%d.%m.%Y")
                time_str = f"{start_dt.strftime('%H:%M')} - {end_dt.strftime('%H:%M')}"

                reply_subject = f"Broneeringu kinnitus: {date_str} kell {time_str} - SmartCourt"

                content = f"""
                    <p>Rõõm on teatada, et teie väljaku broneering on edukalt kinnitatud! Liiv on juba soe ja ootame teid mängima.</p>

                    <div style="background-color: #f8fafc; border-left: 4px solid #2ecc71; padding: 16px 20px; border-radius: 8px; margin: 20px 0;">
                        <h3 style="margin-top: 0; margin-bottom: 10px; color: #1e3c72; font-size: 16px;">Broneeringu detailid (#{booking_id}):</h3>
                        <p style="margin: 5px 0;">🏟️ <b>Väljak:</b> {available_court.name}</p>
                        <p style="margin: 5px 0;">🏐 <b>Ala:</b> {sport_et}</p>
                        <p style="margin: 5px 0;">📅 <b>Kuupäev:</b> {date_str}</p>
                        <p style="margin: 5px 0;">⏰ <b>Kellaaeg:</b> {time_str}</p>
                    </div>
                """

                action_taken = f"booked_id_{booking_id}"

                # If the client also asked a question in the same email
                if "admin" in intents:
                    content += """
                    <div style="background-color: #fff8e6; border-left: 4px solid #f39c12; padding: 12px 16px; border-radius: 6px; margin-top: 15px; color: #b9770e;">
                        <i>💡 Panime tähele, et teie kirjas oli ka lisaküsimus. 
                        Edastasime selle meie administraatorile, kes vastab teile peagi!</i>
                    </div>
                    """
                    if send_real_email:
                        forward_to_admin(
                            sender_email,
                            email_text,
                            note=f"Booking #{booking_id} ({date_str} {time_str}) was automatically created. Please answer the client's additional question!"
                        )
                    action_taken += "_and_forwarded_question"

                reply_body = build_html_email(
                    title="Broneering kinnitatud! 🏐",
                    greeting="Tere, hea rannaspordi sõber!",
                    content_html=content
                )


            else:

                # All courts are busy at the requested time

                date_str = start_dt.strftime("%d.%m.%Y")
                time_str = f"{start_dt.strftime('%H:%M')} - {end_dt.strftime('%H:%M')}"
                reply_subject = "Väljakud on hõivatud - SmartCourt"
                content = f"""
                                <p>Täname broneeringusoovi eest! Kahjuks on kõik meie väljakud kuupäeval <strong>{date_str}</strong> ajavahemikus <strong>{time_str}</strong> juba hõivatud.</p>
                                <div style="background-color: #fdedec; border-left: 4px solid #e74c3c; padding: 15px; border-radius: 6px; margin: 18px 0;">
                                    Palun valige mõni muu kellaaeg või kuupäev ning vastake julgelt sellele kirjale – leiame teile kindlasti sobiva aja!
                                </div>
                            """
                action_taken = "no_courts_available"
                # PATCH 3: If the yard is busy, but the customer asked a question - we still send it to the admin!
                if "admin" in intents:
                    content += """
                                <div style="background-color: #fff8e6; border-left: 4px solid #f39c12; padding: 12px 16px; border-radius: 6px; margin-top: 15px; color: #b9770e;">
                                    <i>💡 Panime tähele, et teie kirjas oli ka lisaküsimus. 
                                    Edastasime selle meie administraatorile, kes vastab teile peagi!</i>
                                </div>
                                """
                    if send_real_email:
                        forward_to_admin(
                            sender_email,
                            email_text,
                            note=f"No courts available for {date_str} {time_str}, but client also asked a question!"
                        )
                    action_taken += "_and_forwarded_question"
                reply_body = build_html_email(
                    title="Soovitud aeg on hõivatud ⏳",
                    greeting="Tere, hea spordisõber!",
                    content_html=content
                )

        # 1c. Missing either date or time (Slot Filling)
        else:
            if "admin" in intents:
                # If they forgot the time AND asked a custom question, let the human admin handle both
                if send_real_email:
                    forward_to_admin(
                        sender_email,
                        email_text,
                        note="Client wants a booking (missing date/time) and asked a question."
                    )
                action_taken = "forwarded_to_admin_incomplete_booking"
            elif not booking_date and not booking_time:
                reply_subject = "Broneeringu täpsustus - SmartCourt"
                content = """
                    <p>Rõõm näha, et soovite meie juurde mängima tulla! Paraku jäid teie kirjast puudu täpne kuupäev ja kellaaeg.</p>
                    <div style="background-color: #ebf5fb; border-left: 4px solid #3498db; padding: 15px; border-radius: 6px; margin: 18px 0;">
                        Palun vastake sellele kirjale ja täpsustage, <strong>mis kuupäeval</strong> ja <strong>mis kell</strong> te väljakut broneerida soovite?
                    </div>
                """
                reply_body = build_html_email(
                    title="Täpsustame mänguaja 🕒",
                    greeting="Tere, hea rannaspordi sõber!",
                    content_html=content
                )
                action_taken = "asked_for_date_and_time"
            elif not booking_date:
                reply_subject = "Broneeringu täpsustus (kuupäev) - SmartCourt"
                content = f"""
                    <p>Märkasime, et soovite broneerida väljakut kell <strong>{booking_time.strftime('%H:%M')}</strong>, kuid soovitud kuupäev jäi kirjast välja.</p>
                    <div style="background-color: #ebf5fb; border-left: 4px solid #3498db; padding: 15px; border-radius: 6px; margin: 18px 0;">
                        Palun vastake sellele kirjale ja andke teada, <strong>mis kuupäevaks</strong> me teile väljaku broneerime?
                    </div>
                """
                reply_body = build_html_email(
                    title="Mis päeval mängime? 📅",
                    greeting="Tere, hea rannaspordi sõber!",
                    content_html=content
                )
                action_taken = "asked_for_date"
            else:
                date_str = booking_date.strftime("%d.%m.%Y")
                reply_subject = "Broneeringu täpsustus (kellaaeg) - SmartCourt"
                content = f"""
                    <p>Märkasime, et soovite tulla mängima kuupäeval <strong>{date_str}</strong>, kuid täpne kellaaeg jäi mainimata.</p>
                    <div style="background-color: #ebf5fb; border-left: 4px solid #3498db; padding: 15px; border-radius: 6px; margin: 18px 0;">
                        Palun vastake sellele kirjale ja täpsustage, <strong>mis kellast</strong> te mängida soovite?
                    </div>
                """
                reply_body = build_html_email(
                    title="Mis kell alustame? ⏰",
                    greeting="Tere, hea rannaspordi sõber!",
                    content_html=content
                )
                action_taken = "asked_for_time"

    # CASE 2: Client wants to cancel a booking
    elif "cancel" in intents:
        reply_subject = "Broneeringu tühistamise päring - SmartCourt"
        content = """
            <p>Saime teie broneeringu tühistamise soovi kätte.</p>
            <div style="background-color: #f8f9f9; border-left: 4px solid #7f8c8d; padding: 15px; border-radius: 6px; margin: 18px 0;">
                Edastasime info meie administraatorile, kes tühistab broneeringu ja saadab teile peagi kinnituse. Loodame teid juba varsti taas liival näha!
            </div>
        """
        reply_body = build_html_email(
            title="Broneeringu tühistamine ✖️",
            greeting="Tere, hea spordisõber!",
            content_html=content
        )
        if send_real_email:
            forward_to_admin(sender_email, email_text, note="Booking cancellation request from client.")
        action_taken = "cancel_request_acknowledged_and_forwarded"

    # CASE 3: Only questions or general inquiries
    elif "admin" in intents:
        reply_subject = "Saime teie kirja kätte - SmartCourt"
        content = """
            <p>Täname, et võtsite SmartCourt keskusega ühendust!</p>
            <div style="background-color: #ebf5fb; border-left: 4px solid #3498db; padding: 15px; border-radius: 6px; margin: 18px 0;">
                Edastasime teie küsimuse meie administraatorile, kes vaatab selle üle ja vastab teile esimesel võimalusel.
            </div>
        """
        reply_body = build_html_email(
            title="Saime teie kirja kätte! 💬",
            greeting="Tere, hea spordisõber!",
            content_html=content
        )
        if send_real_email:
            forward_to_admin(sender_email, email_text, note="General client question / inquiry.")
        action_taken = "question_acknowledged_and_forwarded"

    # Send the generated auto-reply to the client if applicable
    if reply_subject and reply_body and send_real_email:
        send_email(sender_email, reply_subject, reply_body)

    return {
        "sender": sender_email,
        "detected_intents": list(intents),
        "extracted_date": str(booking_date) if booking_date else None,
        "date_status": date_status,
        "extracted_time": booking_time.strftime("%H:%M") if booking_time else None,
        "duration_minutes": duration_mins,
        "booking_id": booking_id,
        "action": action_taken,
        "generated_reply": {
            "subject": reply_subject,
            "body": reply_body
        } if reply_body else None
    }


@app.post("/process-emails/")
def check_and_process_inbox(db: Session = Depends(get_db)):
    """Fetches unread emails from Gmail via IMAP, processes them, and sends SMTP auto-replies."""
    emails = fetch_unread_emails()
    results = []
    for item in emails:
        full_text = f"{item['subject']}. {item['body']}"
        res = process_single_email(full_text, item["from"], db, send_real_email=True)
        results.append(res)
    return {"processed_count": len(results), "details": results}


@app.post("/simulate-email/")
def simulate_email_processing(req: EmailSimulationRequest, db: Session = Depends(get_db)):
    """Test endpoint to simulate incoming emails in Swagger UI without waiting for IMAP."""
    full_text = f"{req.subject}. {req.body}"
    return process_single_email(full_text, req.sender_email, db, send_real_email=req.send_real_email)


@app.get("/bookings/", response_model=list[schemas.BookingResponse])
def read_bookings(db: Session = Depends(get_db)):
    """Returns a list of all bookings in the database."""
    return crud.get_all_bookings(db)
