import spacy

# Load a smaller spaCy model
try:
    nlp = spacy.load("en_core_web_sm")
except OSError:
    print("Downloading spaCy model...")
    from spacy.cli import download
    download("en_core_web_sm")
    nlp = spacy.load("en_core_web_sm")

def simplify_text(text: str) -> str:
    """
    Simplifies text by replacing complex words with simpler ones.
    This is a basic implementation. A more advanced version would use a thesaurus or a trained model.
    """
    doc = nlp(text)
    simplified_tokens = []
    for token in doc:
        # This is a very basic example of simplification.
        # A real implementation would have a dictionary of complex to simple words.
        if token.lemma_ in ["utilize", "leverage"]:
            simplified_tokens.append("use")
        else:
            simplified_tokens.append(token.text)
    return " ".join(simplified_tokens)