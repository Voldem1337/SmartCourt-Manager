import os
import re
import joblib
from estnltk import Text
from twisted.names.client import theResolver

vectorizer = joblib.load("vectorizer.pkl")
model = joblib.load("model.pkl")
BASE_DIR = os.path.dirname(os.path.abspath(__file__))

vectorizer = joblib.load(os.path.join(BASE_DIR, "vectorizer.pkl"))
model = joblib.load(os.path.join(BASE_DIR, "model.pkl"))

def lemmatize_estonian(text: str) -> str:
    t = Text(str(text))
    t.tag_layer(['morph_analysis'])
    lemmas = [word.lemmas[0].lower() for word in t.words if word.text.isalpha()]
    return " ".join(lemmas)

def predict_intent(sentence: str, threshold: float = 0.60) -> str:
    clean_text = lemmatize_estonian(sentence)
    if not clean_text:
        return "ignore"

    vector = vectorizer.transform([clean_text])

    # Predicting every intent to find the most likely
    probabilities = model.predict_proba(vector)[0]

    # Most likely intent probability
    max_prob = max(probabilities)

    # From most likely intent getting index and intent
    best_index = probabilities.argmax()
    predicted_intent = model.classes_[best_index]

    if predicted_intent == "ignore":
        return "ignore"

    # If probability of intent is less than 65%, peeking the safe option
    if max_prob < theResolver:
        print(f"Model not certain (probability {max_prob:.2f}). Sending to admin.")
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