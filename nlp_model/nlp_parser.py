import os
import re
import joblib
from estnltk import Text
from datetime import  date, time, timedelta

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
WEIGHTS_DIR = os.path.join(BASE_DIR, "weights")
vectorizer = joblib.load( os.path.join(WEIGHTS_DIR, "vectorizer.pkl"))
model = joblib.load(os.path.join(WEIGHTS_DIR, "model.pkl"))

def lemmatize_estonian(text: str) -> str:
    t = Text(text)
    t.tag_layer(['morph_analysis'])
    # Keep only alphabetic tokens, replaced by their first-candidate lemma
    lemmas = [span.lemma[0].lower() for span in t.morph_analysis if span.text.isalpha()]
    return " ".join(lemmas)


# Greeting words and signatures to ignore immediately
GREETING_STOPWORDS = {
    "tere", "tervist", "hei", "tsau", "parim", "parimat",
    "lugupidamine", "lugupidamisega", "aitäh", "tänama", "tänan", "päikest"
}

# Tokens without which cancellation cannot be real
CANCEL_KEYWORDS = (
    "tühista", "loobu", "muut", "kahjuks", "ei saa",
    "ei jõua", "ei tule", "haige", "vigastus", "jääb ära", "lükka"
)


def predict_intent(sentence: str, threshold: float = 0.65) -> str:
    clean_text = lemmatize_estonian(sentence)
    if not clean_text:
        return "ignore"

    words = clean_text.split()

    # 1. If the sentence consists only of salutations/goodbyes ("Tere!", "Parimat") -> immediately ignore
    if all(w in GREETING_STOPWORDS for w in words):
        return "ignore"

    # Vectorization and prediction
    vector = vectorizer.transform([clean_text])
    probabilities = model.predict_proba(vector)[0]

    max_prob = max(probabilities)
    best_index = probabilities.argmax()
    predicted_intent = model.classes_[best_index]

    # 2. PROTECTION AGAINST FALSE CANCELLATION:
    # If the model thinks it’s 'cancel', check for any real signs of cancellation
    if predicted_intent == "cancel":
        text_lower = sentence.lower()
        if not any(kw in text_lower or kw in clean_text for kw in CANCEL_KEYWORDS):
            # Если слов отмены вообще нет, то для коротких фраз ставим ignore, для длинных - admin
            return "ignore" if len(words) <= 3 else "admin"

    # 3. Smart confidence threshold
    if max_prob < threshold:
        if len(words) <= 3:
            return "ignore"
        return "admin"

    return predicted_intent

def analyze_email_intents(email_text: str) -> set:
    # Dividing sentence by . ! ? \n
    sentences = re.split(r'[.!?\n]+', email_text)
    found_intents = set()

    for sentence in sentences:

        sentence = sentence.strip()
        if not sentence:
            continue

        intent = predict_intent(sentence)

        if intent != "ignore":
            found_intents.add(intent)
    return found_intents


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

WEEKDAYS = {
    "esmaspäev": 0, "teisipäev": 1, "kolmapäev": 2, "neljapäev": 3,
    "reede": 4, "laupäev": 5, "pühapäev": 6
}


def resolve_booking_year(day: int, month: int, max_horizon_days: int = 90) -> tuple[date | None, str]:
    """Resolves the correct year using a 90-day sliding window and catches user typos."""
    today = date.today()
    try:
        candidate = date(today.year, month, day)
    except ValueError:
        return None, "invalid_calendar_date"

    if candidate < today:
        try:
            candidate = date(today.year + 1, month, day)
        except ValueError:
            return None, "invalid_calendar_date"

    if (candidate - today).days > max_horizon_days:
        return candidate, "typo_or_too_far"

    return candidate, "ok"


def extract_date(text: str) -> tuple[date | None, str]:
    """
    Extracts booking date from Estonian text.
    Returns (date_obj, status) where status is 'ok', 'missing', 'invalid_calendar_date', or 'typo_or_too_far'.
    """
    today = date.today()
    text_lower = text.lower()

    # 1. Relative days (täna, homme, ülehomme)
    if "ülehomme" in text_lower or "ülehomseks" in text_lower:
        return today + timedelta(days=2), "ok"
    if "homme" in text_lower or "homseks" in text_lower:
        return today + timedelta(days=1), "ok"
    if "täna" in text_lower or "tänaseks" in text_lower:
        return today, "ok"

    # 2. Numeric format DD.MM (e.g., '05.11' or '12.01') - avoiding time patterns like 'kell 15.30'
    for match in re.finditer(r'\b(0?[1-9]|[12]\d|3[01])\.(0?[1-9]|1[0-2])\b', text):
        prefix = text_lower[max(0, match.start() - 6):match.start()]
        if "kell" not in prefix:
            day, month = int(match.group(1)), int(match.group(2))
            return resolve_booking_year(day, month)

    # 3. Morphological parsing via EstNLTK (months & weekdays)
    t = Text(str(text))
    t.tag_layer(['morph_analysis'])
    lemmas = [span.lemma[0].lower() for span in t.morph_analysis]

    for i, lemma in enumerate(lemmas):
        # Check month names (e.g. '5. novembril' or 'teisel veebruaril')
        if lemma in MONTHS:
            month = MONTHS[lemma]
            day = None
            if i > 0:
                prev = lemmas[i - 1].rstrip('.')
                if prev.isdigit():
                    day = int(prev)
                elif prev in ORDINAL_NUMBERS:
                    day = ORDINAL_NUMBERS[prev]
                    if i > 1 and lemmas[i - 2] in ORDINAL_NUMBERS:
                        day += ORDINAL_NUMBERS[lemmas[i - 2]]
            if day:
                return resolve_booking_year(day, month)

        # Check weekdays (e.g. 'reedel', 'laupäevaks')
        if lemma in WEEKDAYS:
            target_wd = WEEKDAYS[lemma]
            days_ahead = (target_wd - today.weekday()) % 7
            if days_ahead == 0:
                days_ahead = 7
            return today + timedelta(days=days_ahead), "ok"

    return None, "missing"


def extract_time_obj(text: str) -> time | None:
    """Extracts time as a datetime.time object from formats like '15:30', 'kell 15.30', or 'kell 18'."""
    # 1. Explicit 'kell HH:MM' or 'kell HH.MM'
    match_kell_full = re.search(r'\bkell\s+([01]?\d|2[0-3])[:.]([0-5]\d)\b', text, flags=re.IGNORECASE)
    if match_kell_full:
        return time(int(match_kell_full.group(1)), int(match_kell_full.group(2)))

    # 2. Standard HH:MM with colon
    match_colon = re.search(r'\b([01]?\d|2[0-3]):([0-5]\d)\b', text)
    if match_colon:
        return time(int(match_colon.group(1)), int(match_colon.group(2)))

    # 3. 'kell HH' (hour only)
    match_hour = re.search(r'\bkell\s+([01]?\d|2[0-3])\b', text, flags=re.IGNORECASE)
    if match_hour:
        return time(int(match_hour.group(1)), 0)

    return None


def extract_sport_type(text: str) -> str:
    """Detects sport type from text, defaulting to 'beach_volleyball'."""
    t_low = text.lower()
    if "tennis" in t_low:
        return "beach_tennis"
    if "jalgpall" in t_low or "vutt" in t_low:
        return "beach_football"
    return "beach_volleyball"

def extract_duration_minutes(text: str) -> int:
    """Extracts booking duration in minutes (defaults to 60 minutes / 1 hour)."""
    t_low = text.lower()

    # Check for 1.5 hours ('1.5 tundi', '1,5 tundi', 'poolteist tundi')
    if re.search(r'\b1[.,]5\s*tundi?\b', t_low) or "poolteist" in t_low:
        return 90

    # Check for 2 hours ('2 tundi', 'kaheks tunniks', 'kaks tundi')
    if re.search(r'\b2\s*tundi?\b', t_low) or "kaheks tunniks" in t_low or "kaks tundi" in t_low:
        return 120

    # Check for 3 hours ('3 tundi', 'kolmeks tunniks', 'kolm tundi')
    if re.search(r'\b3\s*tundi?\b', t_low) or "kolmeks tunniks" in t_low or "kolm tundi" in t_low:
        return 180

    return 90
