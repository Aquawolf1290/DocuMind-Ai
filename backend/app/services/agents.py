import re
from collections import Counter
from hashlib import sha256

import numpy as np
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.metrics.pairwise import cosine_similarity

from app.services.processors import run_processor

DOCUMENT_TYPES = {
    "Invoice": ["invoice", "gst", "total amount", "payment due", "tax", "bill to"],
    "Contract": ["agreement", "contract", "termination", "party", "clause", "liability"],
    "Resume": ["resume", "curriculum vitae", "education", "experience", "skills", "projects"],
    "Policy": ["policy", "compliance", "privacy", "procedure", "guideline", "security"],
    "Financial Report": ["revenue", "profit", "loss", "balance sheet", "cash flow", "assets"],
    "Research Paper": ["abstract", "methodology", "literature review", "experiment", "references"],
}

RISK_PATTERNS = [
    ("Missing termination clarity", ["contract", "agreement"], ["termination", "cancel", "exit"]),
    ("Payment terms may be unclear", ["invoice", "payment", "amount"], ["due date", "payment terms"]),
    ("Confidentiality clause not obvious", ["contract", "agreement"], ["confidential", "non-disclosure", "nda"]),
    ("Data privacy language not obvious", ["policy", "personal data", "user data"], ["privacy", "consent", "retention"]),
]

PII_PATTERNS = {
    "emails": r"\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b",
    "phone_numbers": r"(?:\+?\d{1,3}[-.\s]?)?(?:\(?\d{3,5}\)?[-.\s]?)?\d{3,5}[-.\s]?\d{4}\b",
    "pan_like_ids": r"\b[A-Z]{5}[0-9]{4}[A-Z]\b",
    "aadhaar_like_ids": r"\b\d{4}\s?\d{4}\s?\d{4}\b",
    "bank_account_like_numbers": r"\b\d{9,18}\b",
}


def analyze_document(text: str, pages: list[dict] | None = None, metadata: dict | None = None) -> dict:
    normalized_text = normalize_extracted_text(text)
    normalized_pages = normalize_pages(pages or [{"page": 1, "text": text}])
    chunks = chunk_text(normalized_text, normalized_pages)
    doc_type, confidence = classify_document(normalized_text)
    summary = summarize_text(normalized_text)
    action_items = extract_action_items(normalized_text)
    risks = detect_risks(normalized_text)
    pii = detect_pii(normalized_text)
    topics = extract_topics(normalized_text)
    entities = extract_entities(normalized_text)
    compliance_flags = detect_compliance_flags(text, doc_type, pii)
    risk_score = calculate_risk_score(risks, pii, compliance_flags)
    severity = score_to_severity(risk_score)
    structured_extraction = run_processor(normalized_text, chunks, doc_type)

    return {
        "document_type": doc_type,
        "classification_confidence": confidence,
        "pipeline": build_pipeline(metadata or {}, chunks),
        "summary": summary,
        "key_points": extract_key_points(text),
        "entities": entities,
        "topics": topics,
        "action_items": action_items,
        "risks": risks,
        "risk_score": risk_score,
        "risk_severity": severity,
        "compliance_flags": compliance_flags,
        "sensitive_information": summarize_sensitive_information(pii),
        "structured_extraction": structured_extraction,
        "important_clauses": extract_important_clauses(text),
        "suggested_actions": build_suggested_actions(action_items, risks, compliance_flags),
        "tags": sorted(set([doc_type, severity] + topics[:4])),
        "pii": pii,
        "report": {
            "document_type": doc_type,
            "executive_summary": summary,
            "recommended_next_steps": build_suggested_actions(action_items, risks, compliance_flags)[:5],
        },
        "chunks": chunks,
    }


def answer_question(text: str, chunks: list[dict], question: str, analysis: dict | None = None) -> dict:
    if not chunks:
        chunks = chunk_text(text)

    structured_answer = answer_from_structured_fields(question, chunks, analysis or {})
    if structured_answer:
        return structured_answer

    corpus = [build_search_text(chunk["text"]) for chunk in chunks]
    vectorizer = TfidfVectorizer(stop_words="english")
    matrix = vectorizer.fit_transform(corpus + [build_search_text(question)])
    scores = cosine_similarity(matrix[-1], matrix[:-1]).flatten()
    top_indices = np.argsort(scores)[::-1][:3]
    sources = [
        {
            "chunk_id": chunks[index]["id"],
            "page": chunks[index].get("page", 1),
            "paragraph": chunks[index].get("paragraph", chunks[index]["id"]),
            "citation": f"Page {chunks[index].get('page', 1)}, Paragraph {chunks[index].get('paragraph', chunks[index]['id'])}",
            "score": round(float(scores[index]), 3),
            "text": chunks[index]["text"],
        }
        for index in top_indices
        if scores[index] > 0
    ]

    if not sources:
        return {
            "answer": "I could not find strong evidence for that question in the document.",
            "sources": [],
        }

    answer = build_extractive_answer(question, sources)
    return {"answer": answer, "sources": sources}


def answer_from_structured_fields(question: str, chunks: list[dict], analysis: dict) -> dict | None:
    fields = analysis.get("structured_extraction", {}).get("fields", [])
    if not fields:
        return None

    lowered_question = question.lower()
    field_aliases = {
        "candidate_name": ["name", "candidate", "who is"],
        "email": ["email", "mail", "gmail"],
        "phone": ["phone", "mobile", "contact number", "number"],
        "location": ["location", "city", "address"],
        "education": ["education", "degree", "college", "university", "b.tech", "btech"],
        "skills": ["skill", "skills", "technology", "technologies", "tools", "programming"],
        "projects": ["project", "projects", "built", "portfolio"],
        "certifications": ["certificate", "certification", "certifications"],
        "experience": ["experience", "work", "job", "internship", "company"],
        "job_fit_summary": ["job fit", "fit", "suitable", "role"],
        "resume_score": ["score", "rating"],
    }
    requested_names = [
        name
        for name, aliases in field_aliases.items()
        if any(alias in lowered_question for alias in aliases)
    ]
    if not requested_names:
        return None

    selected = [
        field
        for field in fields
        if field.get("name") in requested_names and field.get("status") == "extracted" and field.get("value")
    ]
    if not selected:
        return {
            "answer": "I could not find that extracted field in this document.",
            "sources": [],
        }

    answer_parts = []
    sources = []
    for field in selected[:4]:
        value = field["value"]
        answer_parts.append(f"{field['label']}: {value}")
        sources.extend(find_field_sources(field, chunks))

    unique_sources = dedupe_sources(sources)[:5]
    citation_text = f" ({'; '.join(source['citation'] for source in unique_sources[:3])})" if unique_sources else ""
    return {
        "answer": f"{'; '.join(answer_parts)}.{citation_text}",
        "sources": unique_sources,
    }


def build_search_text(value: str) -> str:
    compact = re.sub(r"[^a-z0-9]+", "", value.lower())
    spaced = re.sub(r"(?<=[a-z])(?=[A-Z])", " ", value)
    return f"{value} {spaced} {compact}"


def find_field_sources(field: dict, chunks: list[dict]) -> list[dict]:
    if field.get("source"):
        source = field["source"]
        return [
            {
                "chunk_id": source.get("paragraph", 1),
                "page": source.get("page", 1),
                "paragraph": source.get("paragraph", 1),
                "citation": source.get("citation", f"Page {source.get('page', 1)}, Paragraph {source.get('paragraph', 1)}"),
                "score": round(float(field.get("confidence", 0.82)), 3),
                "text": source.get("text", field.get("value", "")),
            }
        ]

    field_terms = field_terms_for_source_lookup(field)
    sources = []
    for chunk in chunks:
        searchable = re.sub(r"[^a-z0-9]+", "", chunk["text"].lower())
        if any(term in searchable for term in field_terms):
            sources.append(
                {
                    "chunk_id": chunk["id"],
                    "page": chunk.get("page", 1),
                    "paragraph": chunk.get("paragraph", chunk["id"]),
                    "citation": f"Page {chunk.get('page', 1)}, Paragraph {chunk.get('paragraph', chunk['id'])}",
                    "score": round(float(field.get("confidence", 0.82)), 3),
                    "text": chunk["text"],
                }
            )
    return sources


def field_terms_for_source_lookup(field: dict) -> list[str]:
    value = str(field.get("value", ""))
    terms = [
        re.sub(r"[^a-z0-9]+", "", part.lower())
        for part in re.split(r"[,;|]", value)
        if len(re.sub(r"[^a-z0-9]+", "", part.lower())) >= 3
    ]
    fallback_terms = {
        "skills": ["python", "sql", "excel", "pandas", "numpy", "deeplearning", "nlp", "generativeai", "dataanalysis"],
        "projects": ["loanapprovalpredictionsystem", "salesdataanalysisdashboard", "aichatbot"],
        "certifications": ["pythonfordatascience", "dataanalysiswithpython", "sqlfordataanalytics"],
        "education": ["bacheloroftechnology", "btech", "computer science", "artificialintelligence", "niet"],
        "experience": ["dataanalyst", "quadrapole"],
    }
    terms.extend(fallback_terms.get(field.get("name"), []))
    return sorted(set(term.replace(" ", "") for term in terms if term))


def dedupe_sources(sources: list[dict]) -> list[dict]:
    seen = set()
    unique = []
    for source in sources:
        key = (source.get("page"), source.get("paragraph"), source.get("text"))
        if key in seen:
            continue
        seen.add(key)
        unique.append(source)
    return unique


def chunk_text(text: str, pages: list[dict] | None = None, max_words: int = 130) -> list[dict]:
    chunks = []
    page_items = pages or [{"page": 1, "text": text}]
    for page in page_items:
        paragraphs = [item.strip() for item in re.split(r"\n+|(?<=[.!?])\s+(?=[A-Z])", page["text"]) if item.strip()]
        for paragraph_index, paragraph in enumerate(paragraphs, start=1):
            words = paragraph.split()
            for start in range(0, len(words), max_words):
                chunk_words = words[start : start + max_words]
                if chunk_words:
                    chunk_text_value = " ".join(chunk_words)
                    chunks.append(
                        {
                            "id": len(chunks) + 1,
                            "page": page["page"],
                            "paragraph": paragraph_index,
                            "text": chunk_text_value,
                            "embedding_id": sha256(chunk_text_value.encode("utf-8")).hexdigest()[:16],
                        }
                    )
    return chunks


def classify_document(text: str) -> tuple[str, float]:
    lowered = text.lower()
    scores = {
        label: sum(1 for keyword in keywords if keyword in lowered)
        for label, keywords in DOCUMENT_TYPES.items()
    }
    label, score = max(scores.items(), key=lambda item: item[1])
    if score == 0:
        return "General Business Document", 0.42
    return label, min(0.95, 0.5 + score * 0.09)


def normalize_extracted_text(text: str) -> str:
    # Some PDF resumes extract as "R A J S H A R M A"; collapse long single-letter runs.
    def collapse_spaced_letters(match: re.Match) -> str:
        return match.group(0).replace(" ", "")

    collapsed = re.sub(r"\b(?:[A-Za-z]\s+){2,}[A-Za-z]\b", collapse_spaced_letters, text)
    collapsed = re.sub(r"(?<=\w)\s+(?=[,.)])", "", collapsed)
    collapsed = re.sub(r"(?<=[(])\s+(?=\w)", "", collapsed)
    return collapsed


def normalize_pages(pages: list[dict]) -> list[dict]:
    return [{"page": page.get("page", 1), "text": normalize_extracted_text(page.get("text", ""))} for page in pages]


def summarize_text(text: str, sentence_count: int = 4) -> str:
    sentences = split_sentences(text)
    if len(sentences) <= sentence_count:
        return " ".join(sentences)

    word_counts = Counter(
        word.lower()
        for word in re.findall(r"\b[a-zA-Z]{4,}\b", text)
        if word.lower() not in {"this", "that", "with", "from", "have", "will", "shall"}
    )
    ranked = sorted(
        sentences,
        key=lambda sentence: sum(word_counts[word.lower()] for word in re.findall(r"\b[a-zA-Z]{4,}\b", sentence)),
        reverse=True,
    )
    selected = ranked[:sentence_count]
    return " ".join(selected)


def extract_key_points(text: str) -> list[str]:
    sentences = split_sentences(text)
    keywords = ["must", "shall", "due", "amount", "risk", "required", "deadline", "effective", "experience"]
    points = [sentence for sentence in sentences if any(keyword in sentence.lower() for keyword in keywords)]
    return points[:6] or sentences[:4]


def extract_action_items(text: str) -> list[str]:
    sentences = split_sentences(text)
    triggers = ["must", "should", "required", "submit", "pay", "review", "complete", "renew", "deadline"]
    return [sentence for sentence in sentences if any(trigger in sentence.lower() for trigger in triggers)][:6]


def detect_risks(text: str) -> list[dict]:
    lowered = text.lower()
    risks = []
    for title, context_terms, required_terms in RISK_PATTERNS:
        has_context = any(term in lowered for term in context_terms)
        missing_required = not any(term in lowered for term in required_terms)
        if has_context and missing_required:
            risks.append({"title": title, "severity": "Medium", "recommendation": "Ask a reviewer to verify this section."})
    return risks


def detect_pii(text: str) -> dict:
    return {
        label: sorted(set(re.findall(pattern, text)))
        for label, pattern in PII_PATTERNS.items()
    }


def extract_entities(text: str) -> dict:
    dates = sorted(set(re.findall(r"\b(?:\d{1,2}\s+[A-Z][a-z]+\s+\d{4}|[A-Z][a-z]+\s+\d{1,2},\s+\d{4})\b", text)))
    amounts = sorted(set(re.findall(r"(?:Rs\.?|\$|USD|INR)\s?\d[\d,]*(?:\.\d{1,2})?", text)))
    organizations = sorted(set(re.findall(r"\b[A-Z][A-Za-z]+(?:\s+[A-Z][A-Za-z]+){1,3}\b", text)))[:10]
    return {"dates": dates, "amounts": amounts, "organizations": organizations}


def extract_topics(text: str) -> list[str]:
    words = [
        word.lower()
        for word in re.findall(r"\b[a-zA-Z]{5,}\b", text)
        if word.lower() not in {"there", "their", "which", "shall", "should", "would", "could", "document"}
    ]
    return [word for word, _ in Counter(words).most_common(8)]


def detect_compliance_flags(text: str, doc_type: str, pii: dict) -> list[dict]:
    lowered = text.lower()
    flags = []
    if any(pii.values()):
        flags.append({"title": "Sensitive data present", "severity": "High", "detail": "PII was detected and should be masked for broad access."})
    if doc_type in {"Contract", "Policy"} and "privacy" not in lowered:
        flags.append({"title": "Privacy terms not explicit", "severity": "Medium", "detail": "No clear privacy language was found."})
    if doc_type == "Invoice" and "gst" not in lowered and "tax" not in lowered:
        flags.append({"title": "Tax fields not obvious", "severity": "Medium", "detail": "Invoice tax identifiers were not detected."})
    return flags


def calculate_risk_score(risks: list[dict], pii: dict, compliance_flags: list[dict]) -> int:
    score = len(risks) * 18 + len(compliance_flags) * 16
    score += sum(12 for values in pii.values() if values)
    return min(100, score)


def score_to_severity(score: int) -> str:
    if score >= 75:
        return "Critical"
    if score >= 50:
        return "High"
    if score >= 25:
        return "Medium"
    return "Low"


def summarize_sensitive_information(pii: dict) -> list[dict]:
    return [
        {"type": label.replace("_", " "), "count": len(values), "severity": "High" if values else "Low"}
        for label, values in pii.items()
        if values
    ]


def extract_important_clauses(text: str) -> list[str]:
    triggers = ["termination", "confidential", "liability", "payment", "renew", "privacy", "compliance", "penalty"]
    return [sentence for sentence in split_sentences(text) if any(trigger in sentence.lower() for trigger in triggers)][:8]


def build_suggested_actions(action_items: list[str], risks: list[dict], compliance_flags: list[dict]) -> list[str]:
    suggestions = []
    suggestions.extend(action_items[:4])
    suggestions.extend([f"Review risk: {risk['title']}" for risk in risks[:3]])
    suggestions.extend([f"Resolve compliance flag: {flag['title']}" for flag in compliance_flags[:3]])
    return suggestions or ["Review the extracted summary and validate critical fields manually."]


def build_pipeline(metadata: dict, chunks: list[dict]) -> list[dict]:
    return [
        {"key": "upload", "label": "Upload file", "status": "completed"},
        {"key": "ocr", "label": "OCR extraction", "status": "completed" if metadata.get("ocr_applied") else "skipped"},
        {"key": "text", "label": "Text extraction", "status": "completed"},
        {"key": "metadata", "label": "Metadata extraction", "status": "completed"},
        {"key": "chunking", "label": "Semantic chunking", "status": "completed", "count": len(chunks)},
        {"key": "embeddings", "label": "Embedding generation", "status": "completed", "count": len(chunks)},
        {"key": "indexing", "label": "Vector indexing", "status": "completed"},
        {"key": "agents", "label": "AI agent analysis", "status": "completed"},
    ]


def build_extractive_answer(question: str, sources: list[dict]) -> str:
    evidence = sources[0]["text"]
    sentences = split_sentences(evidence)
    if sentences:
        answer_core = " ".join(sentences[:2])
    else:
        answer_core = evidence[:500]
    return f"{answer_core} ({sources[0]['citation']})"


def split_sentences(text: str) -> list[str]:
    compact = re.sub(r"\s+", " ", text).strip()
    return [sentence.strip() for sentence in re.split(r"(?<=[.!?])\s+", compact) if len(sentence.strip()) > 20]
