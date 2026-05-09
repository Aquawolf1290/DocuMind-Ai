from pathlib import Path
from uuid import uuid4

import fitz
from docx import Document
from fastapi import HTTPException, UploadFile
from PIL import Image
from pypdf import PdfReader
import pytesseract

UPLOAD_DIR = Path("storage/uploads")
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
TESSERACT_WINDOWS_PATH = Path("C:/Program Files/Tesseract-OCR/tesseract.exe")
PDF_OCR_DPI = 220
MIN_NATIVE_PAGE_WORDS = 35

if TESSERACT_WINDOWS_PATH.exists():
    pytesseract.pytesseract.tesseract_cmd = str(TESSERACT_WINDOWS_PATH)


async def parse_document(file: UploadFile) -> dict:
    suffix = Path(file.filename).suffix.lower()
    if suffix not in {".pdf", ".txt", ".docx", ".png", ".jpg", ".jpeg", ".webp", ".tiff"}:
        raise HTTPException(status_code=400, detail="Only PDF, DOCX, TXT, PNG, JPG, WEBP, and TIFF files are supported.")

    stored_name = f"{uuid4().hex}{suffix}"
    path = UPLOAD_DIR / stored_name
    contents = await file.read()
    path.write_bytes(contents)
    return parse_stored_document(path, file.filename, file.content_type or "application/octet-stream", len(contents))


def parse_stored_document(path: Path, filename: str, content_type: str = "application/octet-stream", size_bytes: int | None = None) -> dict:
    suffix = Path(filename).suffix.lower() or path.suffix.lower()
    if suffix == ".pdf":
        text, pages, ocr_applied = _read_pdf(path)
    elif suffix == ".docx":
        text, pages = _read_docx(path)
        ocr_applied = False
    elif suffix in {".png", ".jpg", ".jpeg", ".webp", ".tiff"}:
        text, pages = _read_image(path)
        ocr_applied = True
    else:
        text = contents.decode("utf-8", errors="ignore")
        pages = [{"page": 1, "text": text}]
        ocr_applied = False

    cleaned_pages = [{"page": item["page"], "text": _clean_text(item["text"])} for item in pages]
    cleaned = _clean_text("\n".join(item["text"] for item in cleaned_pages))
    if len(cleaned) < 30:
        raise HTTPException(status_code=422, detail="Could not extract enough text from this document.")

    page_word_counts = [len(item["text"].split()) for item in cleaned_pages]
    return {
        "filename": filename,
        "content_type": content_type,
        "path": str(path),
        "text": cleaned,
        "metadata": {
            "extension": suffix,
            "size_bytes": size_bytes if size_bytes is not None else path.stat().st_size,
            "page_count": len(cleaned_pages),
            "ocr_applied": ocr_applied,
            "extraction_engine": "pypdf+pymupdf+tesseract" if suffix == ".pdf" else "tesseract" if ocr_applied else "native",
            "words_extracted": sum(page_word_counts),
            "page_word_counts": page_word_counts,
        },
        "pages": cleaned_pages,
    }


def _read_pdf(path: Path) -> tuple[str, list[dict], bool]:
    reader = PdfReader(str(path))
    native_pages = [{"page": index + 1, "text": page.extract_text() or ""} for index, page in enumerate(reader.pages)]
    ocr_pages = _ocr_pdf_pages(path, native_pages)
    pages = []
    ocr_applied = False

    for native_page, ocr_page in zip(native_pages, ocr_pages):
        native_text = _clean_text(native_page["text"])
        ocr_text = _clean_text(ocr_page["text"])
        use_ocr = _should_use_ocr(native_text, ocr_text)
        ocr_applied = ocr_applied or use_ocr or bool(ocr_text)
        pages.append(
            {
                "page": native_page["page"],
                "text": _merge_page_text(native_text, ocr_text) if use_ocr else native_text,
            }
        )

    return "\n".join(item["text"] for item in pages), pages, ocr_applied


def _ocr_pdf_pages(path: Path, native_pages: list[dict]) -> list[dict]:
    try:
        document = fitz.open(str(path))
        pages = []
        for index in range(len(native_pages)):
            page = document[index]
            zoom = PDF_OCR_DPI / 72
            pixmap = page.get_pixmap(matrix=fitz.Matrix(zoom, zoom), alpha=False)
            image = Image.frombytes("RGB", [pixmap.width, pixmap.height], pixmap.samples)
            text = pytesseract.image_to_string(image, config="--oem 3 --psm 6")
            pages.append({"page": index + 1, "text": text})
        document.close()
        return pages
    except pytesseract.TesseractNotFoundError:
        return [{"page": item["page"], "text": ""} for item in native_pages]
    except Exception:
        return [{"page": item["page"], "text": ""} for item in native_pages]


def _should_use_ocr(native_text: str, ocr_text: str) -> bool:
    native_words = native_text.split()
    ocr_words = ocr_text.split()
    if not ocr_words:
        return False
    if len(native_words) < MIN_NATIVE_PAGE_WORDS:
        return True
    return len(ocr_words) > len(native_words) * 1.25


def _merge_page_text(native_text: str, ocr_text: str) -> str:
    if not native_text:
        return ocr_text
    if not ocr_text:
        return native_text
    native_compact = _compact_for_compare(native_text)
    ocr_compact = _compact_for_compare(ocr_text)
    if ocr_compact in native_compact:
        return native_text
    if native_compact in ocr_compact:
        return ocr_text
    return f"{native_text}\n\nOCR supplement:\n{ocr_text}"


def _compact_for_compare(value: str) -> str:
    return "".join(character.lower() for character in value if character.isalnum())


def _read_docx(path: Path) -> tuple[str, list[dict]]:
    document = Document(str(path))
    text = "\n".join(paragraph.text for paragraph in document.paragraphs)
    return text, [{"page": 1, "text": text}]


def _read_image(path: Path) -> tuple[str, list[dict]]:
    try:
        image = Image.open(path)
        text = pytesseract.image_to_string(image)
    except pytesseract.TesseractNotFoundError as exc:
        raise HTTPException(
            status_code=501,
            detail="Image OCR requires Tesseract OCR installed and available in PATH.",
        ) from exc
    return text, [{"page": 1, "text": text}]


def _clean_text(text: str) -> str:
    lines = [line.strip() for line in text.splitlines()]
    return "\n".join(line for line in lines if line)
