import datetime
import imaplib
import email
from email.header import decode_header
import os
from dotenv import load_dotenv
import html
import re
from datetime import datetime, timedelta
from estnltk import Text
from datetime import date

load_dotenv()

EMAIL_ACCOUNT = os.getenv("EMAIL_ACCOUNT")
EMAIL_PASSWORD = os.getenv("EMAIL_PASSWORD")
IMAP_SERVER = "imap.gmail.com"


MONTHS = {
    "jaanuar": 1, "veebruar": 2, "märts": 3, "aprill": 4,
    "mai": 5, "juuni": 6, "juuli": 7, "august": 8,
    "september": 9, "oktoober": 10, "november": 11, "detsember": 12
}

ORDINAL_NUMBERS = {
    "esimene": 1, "teine": 2, "kolmas": 3, "neljas": 4, "viies": 5,
    "kuues": 6, "seitsmes": 7, "kaheksas": 8, "üheksas": 9, "kümnes": 10,
    "üheteistkümnes": 11, "kaheteistkümnes": 12, "kolmeteistkümnes": 13,
    "neljateistkümnes": 14, "viieteistkümnes": 15, "kuueteistkümnes": 16,
    "seitsmeteistkümnes": 17, "kaheksateistkümnes": 18, "üheksateistkümnes": 19,
    "kahekümnes": 20, "kakskümmend": 20, "kolmkümmend": 30
}

def fetch_unread_emails() -> list[dict]:
    unread_emails = []
    try:
        # Connecting to the server
        mail = imaplib.IMAP4_SSL(IMAP_SERVER)
        mail.login(EMAIL_ACCOUNT, EMAIL_PASSWORD)
        # Choosing folder "Inbox"
        mail.select("inbox")
        # Searching for the mail with status unseen
        status, message = mail.search( None, "UNSEEN")

        # List with mail id
        emails_ids = message[0].split()

        for e_id in emails_ids:
            # By id downloading email
            res, msg_data = mail.fetch(e_id, "(RFC822)")
            for response_part in msg_data:
                if isinstance(response_part, tuple):
                    # Converting bytes to the Python object
                    msg = email.message_from_bytes(response_part[1])

                    subject_raw = msg.get("Subject", "")
                    subject, encoding = decode_header(msg["Subject"])[0]
                    if isinstance(subject, bytes):
                        # Decoding
                        subject = subject.decode(encoding if encoding else "utf-8")

                    from_ = msg.get("From")

                    body = ""
                    # If mail contains multipart(text + HTML-version + image)
                    # removes all its parts until it finds text
                    if msg.is_multipart():
                        for part in msg.walk():
                            if part.get_content_type() == "text/plain":
                                payload = part.get_payload(decode=True)
                                if payload:
                                    body = payload.decode("utf-8", errors="ignore")
                                break
                    else:
                        payload = msg.get_payload(decode=True)
                        if payload:
                            body = payload.decode("utf-8", errors="ignore")

                    # Remove extra spaces at the edges and convert HTML entities to normal characters
                    body = html.unescape(body.strip())
                    unread_emails.append({
                        "from": from_,
                        "subject": subject,
                        "body": body
                    })

        mail.logout()
    except Exception as e:
        print(f"Email received error:  {e}")
    return unread_emails

def extract_date(text: str) -> datetime.date | None:
    today = datetime.now().date()
    text_lower = text.lower()
    if "ülehomme" in text_lower:
        return today + timedelta(days=2)
    if "homme" in text_lower or "homseks" in text_lower:
        return today + timedelta(days=1)
    if "täna" in text_lower or "tänaseks" in text_lower:
        return today

    match_ddmm = re.search(r'\b(0?[1-9]|[12]\d|3[01])\.(0?[1-9]|1[0-2])\b', text)
    if match_ddmm:
        day, month = int(match_ddmm.group(1)), int(match_ddmm.group(2))
        year = today.year if (month, day) >= (today.month, today.day) else today.year + 1
        return datetime(year, month, day).date()

    t = Text(text)
    t.tag_layer(['morph_analysis'])
    lemmas = [w.lemmas[0].lower() for w in t.words]

    for i, lemma in enumerate(lemmas):
        if lemma in MONTHS:
            month = MONTHS[lemma]
            day = None

            # Look at 1-2 words before the month
            if i > 0:
                prev = lemmas[i - 1].rstrip('.')
                #  If before a month is a number("5. novembril")
                if prev.isdigit():
                    day = int(prev)
                # If before a month is numeric word ("teisel veebruaril" -> "teine veebruar")
                elif prev in ORDINAL_NUMBERS:
                    day = ORDINAL_NUMBERS[prev]
                    # "kahekümne teisel" (20 + 2 = 22)
                    if i > 1 and lemmas[i - 2] in ORDINAL_NUMBERS:
                        day += ORDINAL_NUMBERS[lemmas[i - 2]]

            if day and 1 <= day <= 31:
                year = today.year if (month, day) >= (today.month, today.day) else today.year + 1
                return datetime(year, month, day).date()

    return None

def resolve_booking_year(day: int, month: int, max_horizon_days: int = 90) -> tuple[date | None, str]:
    """
        Determines the correct year for a (day, month) pair and catches user typos.
        Returns: (resolved_date, status_code)
        status_code can be: 'ok', 'invalid_calendar_date', 'typo_or_too_far'
        """
    today = date.today()
    # Try current year first check for impossible date
    try:
        candidate = date(today.year, month,day)
    except ValueError:
        return None, "invalid_calendar_date"
    # If the date is already passed this year, roll over to next year
    if candidate < today:
        try:
            candidate = date(today.year +1, month, day)
        except ValueError:
            return None, "invalid_calendar_date"
    # Check if the date falls within our allowed booking window
    day_ahead = (candidate - today).days

    if day_ahead > max_horizon_days:
        return None, "typo_or_too_far"

    return  candidate, "ok"




if __name__ == "__main__":
    fetch_unread_emails()