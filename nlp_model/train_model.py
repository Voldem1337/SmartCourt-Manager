import os

import joblib
import pandas
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.model_selection import train_test_split
from estnltk import Text
from sklearn.neural_network import MLPClassifier


BASE_DIR = os.path.dirname(os.path.abspath(__file__))
def lemmize_estonian(text: str) -> str:

    t = Text(text)
    t.tag_layer(['morph_analysis'])
    # Leave only alphanumeric words in the initial form
    lemmas = [word.lemmas[0].lower() for word in t.words if word.text.isalpha()]

    return " ".join(lemmas).lower()
if __name__ == "__main__":
    print("Loading and processing...")
    df = pandas.read_csv("train_data.csv")
    df['clean_text'] = df['text'].apply(lemmize_estonian)
    X = df['clean_text']
    y = df['intent']

    X_train, X_test, y_train, y_test = train_test_split(
        X,
        y,
        test_size=0.2, # 20% for testing data
        random_state=42, # So that every time it is run, the data is mixed in the same way,
        statify =y # Guarantee in the test would be all classes with the same quantity
    )

    print("Vectorization of texts...")

    vectorizer = TfidfVectorizer()
    X_train_vectorizer = vectorizer.fit_transform(X_train)
    X_test_vectorizer = vectorizer.transform(X_test)

    print("Training of the network...")

    model = MLPClassifier(hidden_layer_sizes=20, max_iter=100, random_state=42)
    model.fit(X_train_vectorizer, y_train)

    accuracy = model.score(X_test_vectorizer, y_test)
    print(f"Model accuracy on test data (Accuracy): {accuracy * 100:.1f}%")

    joblib.dump(vectorizer, os.path.join(BASE_DIR), 'vectorizer.pkl')
    joblib.dump(model, os.path.join(BASE_DIR), 'model.pkl')

