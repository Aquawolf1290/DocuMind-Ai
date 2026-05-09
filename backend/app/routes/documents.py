from pathlib import Path

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from pydantic import BaseModel

from app.services.agents import analyze_document, answer_question
from app.services.auth import CurrentUser, get_current_user
from app.services.parser import parse_document, parse_stored_document
from app.services.processors import build_export_payload, list_processors
from app.services.store import document_store
from app.services.workflow import build_workflow_trace

router = APIRouter()


class QuestionRequest(BaseModel):
    question: str


class ReviewRequest(BaseModel):
    status: str


@router.get("/processors")
def get_processors(current_user: CurrentUser = Depends(get_current_user)):
    return {"processors": list_processors()}


@router.get("/metrics")
def get_metrics(current_user: CurrentUser = Depends(get_current_user)):
    return document_store.metrics(current_user.id)


@router.get("/search")
def search_documents(q: str, current_user: CurrentUser = Depends(get_current_user)):
    if not q.strip():
        raise HTTPException(status_code=400, detail="Search query cannot be empty.")
    return document_store.search(current_user.id, q.strip())


@router.get("")
def list_documents(current_user: CurrentUser = Depends(get_current_user)):
    return document_store.list_documents(current_user.id)


@router.post("/upload")
async def upload_document(file: UploadFile = File(...), current_user: CurrentUser = Depends(get_current_user)):
    if not file.filename:
        raise HTTPException(status_code=400, detail="A filename is required.")

    parsed = await parse_document(file)
    analysis = analyze_document(parsed["text"], parsed["pages"], parsed["metadata"])
    document = document_store.create_document(
        owner_id=current_user.id,
        filename=parsed["filename"],
        content_type=parsed["content_type"],
        path=parsed["path"],
        text=parsed["text"],
        chunks=analysis["chunks"],
        analysis=analysis,
        metadata=parsed["metadata"],
    )
    return document


@router.get("/{document_id}")
def get_document(document_id: str, current_user: CurrentUser = Depends(get_current_user)):
    document = document_store.get_document(document_id, current_user.id)
    if not document:
        raise HTTPException(status_code=404, detail="Document not found.")
    if "risk_score" not in document.get("analysis", {}) or "structured_extraction" not in document.get("analysis", {}):
        document["analysis"] = analyze_document(
            document["text"],
            [{"page": 1, "text": document["text"]}],
            document.get("metadata", {"extension": "", "size_bytes": 0, "page_count": 1, "ocr_applied": False}),
        )
        document["chunks"] = document["analysis"]["chunks"]
        document_store.update_document(document_id, current_user.id, document)
    return document


@router.get("/{document_id}/export")
def export_document(document_id: str, current_user: CurrentUser = Depends(get_current_user)):
    document = get_document(document_id, current_user)
    return build_export_payload(document)


@router.get("/{document_id}/workflow")
def get_workflow(document_id: str, current_user: CurrentUser = Depends(get_current_user)):
    document = get_document(document_id, current_user)
    return build_workflow_trace(document)


@router.post("/{document_id}/reanalyze")
def reanalyze_document(document_id: str, current_user: CurrentUser = Depends(get_current_user)):
    document = get_document(document_id, current_user)
    metadata = document.get("metadata", {"extension": "", "size_bytes": 0, "page_count": 1, "ocr_applied": False})
    analysis = analyze_document(document["text"], [{"page": 1, "text": document["text"]}], metadata)
    return document_store.reanalyze_document(document_id, current_user.id, analysis)


@router.post("/{document_id}/reprocess")
def reprocess_document(document_id: str, current_user: CurrentUser = Depends(get_current_user)):
    document = get_document(document_id, current_user)
    parsed = parse_stored_document(
        Path(document["path"]),
        document["filename"],
        document.get("content_type", "application/octet-stream"),
        document.get("metadata", {}).get("size_bytes"),
    )
    analysis = analyze_document(parsed["text"], parsed["pages"], parsed["metadata"])
    document["text"] = parsed["text"]
    document["metadata"] = parsed["metadata"]
    document["analysis"] = analysis
    document["chunks"] = analysis["chunks"]
    document_store.update_document(document_id, current_user.id, document)
    return document


@router.patch("/{document_id}/review")
def update_review_status(document_id: str, payload: ReviewRequest, current_user: CurrentUser = Depends(get_current_user)):
    allowed = {"Needs review", "In review", "Approved", "Rejected"}
    if payload.status not in allowed:
        raise HTTPException(status_code=400, detail="Invalid review status.")
    document = get_document(document_id, current_user)
    document["analysis"]["structured_extraction"]["review_status"] = payload.status
    document_store.update_document(document_id, current_user.id, document)
    return {"document_id": document_id, "review_status": payload.status}


@router.post("/{document_id}/ask")
def ask_document(document_id: str, payload: QuestionRequest, current_user: CurrentUser = Depends(get_current_user)):
    document = document_store.get_document(document_id, current_user.id)
    if not document:
        raise HTTPException(status_code=404, detail="Document not found.")
    if not payload.question.strip():
        raise HTTPException(status_code=400, detail="Question cannot be empty.")

    response = answer_question(document["text"], document["chunks"], payload.question, document.get("analysis", {}))
    document_store.add_query(document_id, current_user.id, payload.question, response["answer"])
    return response
