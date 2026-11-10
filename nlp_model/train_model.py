import os
import joblib
import pandas as pd
from estnltk import Text
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.metrics import classification_report
from sklearn.model_selection import train_test_split, cross_val_score
from sklearn.neural_network import MLPClassifier
from sklearn.pipeline import make_pipeline


BASE_DIR = os.path.dirname(os.path.abspath(__file__))
WEIGHTS_DIR = os.path.join(BASE_DIR, "weights")
def lemmatize_estonian(text: str) -> str:
    t = Text(text)
    t.tag_layer(['morph_analysis'])
    # Keep only alphabetic tokens, replaced by their first-candidate lemma
    lemmas = [span.lemma[0].lower() for span in t.morph_analysis if span.text.isalpha()]
    return " ".join(lemmas)
if __name__ == "__main__":
    print("1. Loading and processing data...")
    csv_path = os.path.join(BASE_DIR, "train_data.csv")
    df = pd.read_csv(csv_path)
    df.columns = df.columns.str.strip()

    # Remove exact duplicate rows so they don't leak between train and test sets
    initial_len = len(df)
    df = df.drop_duplicates(subset=['text']).reset_index(drop=True)
    print(f"Loaded {len(df)} unique rows (removed {initial_len - len(df)} duplicates).")

    df['clean_text'] = df['text'].apply(lemmatize_estonian)
    X = df['clean_text']
    y = df['intent']

    X_train, X_test, y_train, y_test = train_test_split(
        X,
        y,
        test_size=0.2,
        random_state=42,
        stratify=y
    )

    print("2. Vectorizing texts...")
    vectorizer = TfidfVectorizer(ngram_range=(1, 2), sublinear_tf=True)
    X_train_vectorizer = vectorizer.fit_transform(X_train)
    X_test_vectorizer = vectorizer.transform(X_test)

    print("3. Training the network...")
    # max_iter=1500 ensures full convergence without ConvergenceWarning
    model = MLPClassifier(hidden_layer_sizes=(32, 16), max_iter=1500, random_state=42)
    model.fit(X_train_vectorizer, y_train)

    accuracy = model.score(X_test_vectorizer, y_test)
    print(f"\nModel accuracy on test data (Accuracy): {accuracy * 100:.1f}%")

    pred = model.predict(X_test_vectorizer)
    print(classification_report(y_test, pred, zero_division=0))

    pipe = make_pipeline(
        TfidfVectorizer(ngram_range=(1, 2), sublinear_tf=True),
        MLPClassifier(hidden_layer_sizes=(32, 16), max_iter=1500, random_state=42)
    )
    scores = cross_val_score(pipe, X, y, cv=5)
    print(f"5-Fold Cross-Validation Accuracy: {scores.mean() * 100:.1f}% (+/- {scores.std() * 100:.1f}%)\n")

    print("Misclassified examples in test set:")
    for text, true, p in zip(X_test, y_test, pred):
        if true != p:
            print(f"  {true} -> {p}: {text}")

    # Create weights directory if it doesn't exist and save both objects
    os.makedirs(WEIGHTS_DIR, exist_ok=True)
    joblib.dump(vectorizer, os.path.join(WEIGHTS_DIR, "vectorizer.pkl"))
    joblib.dump(model, os.path.join(WEIGHTS_DIR, "model.pkl"))
    print(f"\nSaved vectorizer.pkl and model.pkl to {WEIGHTS_DIR}")
