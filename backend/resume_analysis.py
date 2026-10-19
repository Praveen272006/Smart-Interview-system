import re
import json
from pathlib import Path

import pytesseract
from pdf2image import convert_from_path
from pypdf import PdfReader


# ============================================================
# OCR CONFIGURATION
# ============================================================

pytesseract.pytesseract.tesseract_cmd = (
    r"C:\Program Files\Tesseract-OCR\tesseract.exe"
)

POPPLER_PATH = (
    r"E:\Downloads\Release-26.09.0-0"
    r"\poppler-26.09.0\Library\bin"
)


# ============================================================
# RESUME TEXT EXTRACTION
# ============================================================

def extract_resume_text(resume_path: str) -> str:
    """
    Extract readable text from a PDF resume.

    First attempts normal PDF text extraction.
    If the extracted text is empty or appears unreadable,
    attempts OCR on the PDF pages.
    """

    path = Path(resume_path)

    if not path.exists() or not path.is_file():
        raise FileNotFoundError("Resume file was not found.")

    if path.suffix.lower() != ".pdf":
        raise ValueError("Only PDF resumes are supported.")

    # Step 1: Extract embedded PDF text.
    try:
        reader = PdfReader(str(path))

        extracted_pages = []

        for page in reader.pages:
            page_text = page.extract_text() or ""
            extracted_pages.append(page_text.strip())

        extracted_text = "\n".join(extracted_pages).strip()

    except Exception:
        extracted_text = ""

    # Step 2: Determine whether the extracted text is readable.
    # A PDF may contain garbled embedded text even when non-empty.
    if not _text_appears_readable(extracted_text):
        try:
            images = convert_from_path(
                str(path),
                dpi=250,
                poppler_path=POPPLER_PATH,
            )

            ocr_pages = []

            for image in images:
                # Try the original page orientation first.
                page_text = pytesseract.image_to_string(
                    image,
                    config="--psm 3",
                )

                # Retry after rotation if the result looks poor.
                if not _text_appears_readable(page_text):
                    rotated_image = image.rotate(
                        180,
                        expand=True,
                    )

                    rotated_text = pytesseract.image_to_string(
                        rotated_image,
                        config="--psm 3",
                    )

                    if len(rotated_text.strip()) > len(
                        page_text.strip()
                    ):
                        page_text = rotated_text

                if page_text.strip():
                    ocr_pages.append(page_text.strip())

            ocr_text = "\n".join(ocr_pages).strip()

            # Prefer OCR when it produces more readable text.
            if _text_appears_readable(ocr_text):
                extracted_text = ocr_text

        except Exception as exc:
            if not extracted_text:
                raise ValueError(
                    f"Unable to extract resume text using OCR: {exc}"
                ) from exc

    if not extracted_text:
        raise ValueError(
            "No readable text was found in the PDF. "
            "Please upload a clearer resume."
        )

    return extracted_text


def _text_appears_readable(text: str) -> bool:
    """
    Basic heuristic to detect empty or heavily garbled text.

    This is not a language-recognition model. It helps decide
    whether OCR should be attempted.
    """

    if not text or len(text.strip()) < 20:
        return False

    letters = sum(character.isalpha() for character in text)
    alphanumeric = sum(
        character.isalnum() for character in text
    )

    if not alphanumeric:
        return False

    letter_ratio = letters / len(text)

    # Reject text with very few alphabetic characters.
    if letter_ratio < 0.20:
        return False

    return True


# ============================================================
# REQUIRED SKILLS PARSING
# ============================================================

def parse_skills(required_skills):
    """
    Convert required skills into a list.

    Supports:
    - Python lists
    - JSON arrays stored as strings
    - Comma-separated strings
    """

    if not required_skills:
        return []

    if isinstance(required_skills, list):
        skills = required_skills

    elif isinstance(required_skills, str):
        try:
            parsed = json.loads(required_skills)

            if isinstance(parsed, list):
                skills = parsed
            else:
                skills = required_skills.split(",")

        except json.JSONDecodeError:
            skills = required_skills.split(",")

    else:
        return []

    # Remove empty values and duplicate skill names.
    return list(
        dict.fromkeys(
            str(skill).strip()
            for skill in skills
            if str(skill).strip()
        )
    )


# ============================================================
# SKILL MATCHING
# ============================================================

def _contains_skill(resume_text: str, skill: str) -> bool:
    """
    Check whether a skill phrase appears in resume text.

    Uses case-insensitive matching and avoids matching
    a skill inside a larger alphanumeric word.
    """

    normalized_skill = skill.strip().lower()

    if not normalized_skill:
        return False

    normalized_resume = re.sub(
        r"\s+",
        " ",
        resume_text.lower(),
    )

    normalized_skill = re.sub(
        r"\s+",
        " ",
        normalized_skill,
    )

    pattern = (
        r"(?<![a-zA-Z0-9+#.])"
        + re.escape(normalized_skill)
        + r"(?![a-zA-Z0-9+#.])"
    )

    return re.search(pattern, normalized_resume) is not None


def analyze_resume(
    resume_path: str,
    required_skills,
):
    """
    Compare resume text against a job's required skills.

    Returns matched skills, missing skills, and a skill-match
    percentage. This is rule-based matching, not a trained
    machine-learning prediction.
    """

    resume_text = extract_resume_text(resume_path)

    skills = parse_skills(required_skills)

    matched_skills = []
    missing_skills = []

    for skill in skills:
        if _contains_skill(resume_text, skill):
            matched_skills.append(skill)
        else:
            missing_skills.append(skill)

    total_skills = len(skills)

    if total_skills > 0:
        match_percentage = round(
            len(matched_skills) / total_skills * 100,
            2,
        )
    else:
        match_percentage = 0.0

    return {
        "total_required_skills": total_skills,
        "matched_skill_count": len(matched_skills),
        "missing_skill_count": len(missing_skills),
        "matched_skills": matched_skills,
        "missing_skills": missing_skills,
        "skill_match_percentage": match_percentage,
        "analysis_type": (
            "Rule-based skill matching with PDF text extraction and OCR"
        ),
    }