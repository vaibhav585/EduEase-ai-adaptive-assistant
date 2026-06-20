import argostranslate.package
import argostranslate.translate
from config import ARGOSTRANSLATE_PACKAGE_PATH

def install_translation_packages():
    """Downloads and installs Argos Translate packages if they don't exist."""
    argostranslate.package.update_package_index()
    available_packages = argostranslate.package.get_available_packages()
    
    # Install English to Hindi and English to Tamil
    for package in available_packages:
        if package.from_code == "en" and package.to_code in ["hi", "ta"]:
            package.install()

def translate_text(text: str, target_lang: str) -> str:
    """Translates text to the target language."""
    try:
        # Ensure packages are installed
        install_translation_packages()
        
        translated_text = argostranslate.translate.translate(text, "en", target_lang)
        return translated_text
    except Exception as e:
        print(f"Translation error: {e}")
        return f"Translation to {target_lang} is not available at the moment."
