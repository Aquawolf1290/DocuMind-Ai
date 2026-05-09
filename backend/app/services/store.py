import json
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path
from uuid import uuid4

from app.services.database import connect, decode_payload, encode_payload, utc_now


LEGACY_DATA_PATH = Path("storage/documents.json")
LEGACY_OWNER_ID = "demo:admin@documind.ai"


class DocumentStore:
    def __init__(self):
        self._migrate_legacy_documents()

    def list_documents(self, owner_id: str) -> dict:
        documents = sorted(self._documents_for_owner(owner_id), key=lambda item: item["created_at"], reverse=True)
        return {
            "documents": [
                {
                    "id": item["id"],
                    "filename": item["filename"],
                    "document_type": item["analysis"]["document_type"],
                    "summary": item["analysis"]["summary"],
                    "risk_score": item["analysis"].get("risk_score", 0),
                    "risk_severity": item["analysis"].get("risk_severity", "Low"),
                    "processor": item["analysis"].get("structured_extraction", {}).get("processor", {}).get("name", "General Processor"),
                    "review_status": item["analysis"].get("structured_extraction", {}).get("review_status", "Needs review"),
                    "quality_score": item["analysis"].get("structured_extraction", {}).get("quality_score", 0),
                    "pii_alerts": sum(len(values) for values in item["analysis"].get("pii", {}).values()),
                    "indexed": bool(item.get("chunks")),
                    "chunk_count": len(item.get("chunks", [])),
                    "created_at": item["created_at"],
                    "query_count": len(item.get("queries", [])),
                }
                for item in documents
            ],
            "total": len(documents),
        }

    def get_document(self, document_id: str, owner_id: str) -> dict | None:
        with connect() as connection:
            row = connection.execute(
                "SELECT payload_json FROM documents WHERE id = ? AND owner_id = ?",
                (document_id, owner_id),
            ).fetchone()
        return decode_payload(row["payload_json"]) if row else None

    def update_document(self, document_id: str, owner_id: str, document: dict) -> None:
        document["owner_id"] = owner_id
        with connect() as connection:
            connection.execute(
                """
                UPDATE documents
                SET payload_json = ?, updated_at = ?
                WHERE id = ? AND owner_id = ?
                """,
                (encode_payload(document), utc_now(), document_id, owner_id),
            )

    def reanalyze_document(self, document_id: str, owner_id: str, analysis: dict, text: str | None = None) -> dict:
        document = self.get_document(document_id, owner_id)
        if not document:
            raise KeyError(document_id)
        if text is not None:
            document["text"] = text
        document["analysis"] = analysis
        document["chunks"] = analysis["chunks"]
        self.update_document(document_id, owner_id, document)
        return document

    def create_document(self, owner_id: str, filename: str, content_type: str, path: str, text: str, chunks: list, analysis: dict, metadata: dict) -> dict:
        document_id = uuid4().hex
        created_at = datetime.now(timezone.utc).isoformat()
        document = {
            "id": document_id,
            "owner_id": owner_id,
            "filename": filename,
            "content_type": content_type,
            "path": path,
            "text": text,
            "metadata": metadata,
            "analysis": analysis,
            "chunks": chunks,
            "queries": [],
            "created_at": created_at,
        }
        with connect() as connection:
            connection.execute(
                """
                INSERT INTO documents (id, owner_id, payload_json, created_at, updated_at)
                VALUES (?, ?, ?, ?, ?)
                """,
                (document_id, owner_id, encode_payload(document), created_at, created_at),
            )
        return document

    def metrics(self, owner_id: str) -> dict:
        documents = self._documents_for_owner(owner_id)
        category_counts = Counter(item["analysis"]["document_type"] for item in documents)
        risk_counts = Counter(item["analysis"].get("risk_severity", "Low") for item in documents)
        query_count = sum(len(item.get("queries", [])) for item in documents)
        pii_alerts = sum(sum(len(values) for values in item["analysis"].get("pii", {}).values()) for item in documents)
        high_risk = sum(1 for item in documents if item["analysis"].get("risk_score", 0) >= 50)
        needs_review = sum(1 for item in documents if item["analysis"].get("structured_extraction", {}).get("review_status") == "Needs review")
        activities = []
        for item in documents:
            activities.append({"type": "document.indexed", "label": f"Indexed {item['filename']}", "created_at": item["created_at"]})
            for query in item.get("queries", [])[-3:]:
                activities.append({"type": "query.answered", "label": query["question"], "created_at": query["created_at"]})
        return {
            "total_documents": len(documents),
            "indexed_documents": sum(1 for item in documents if item.get("chunks")),
            "processing_queue": 0,
            "ai_queries": query_count,
            "high_risk_documents": high_risk,
            "pii_alerts": pii_alerts,
            "needs_review": needs_review,
            "top_categories": dict(category_counts),
            "risk_distribution": dict(risk_counts),
            "processing_analytics": {
                "chunks_indexed": sum(len(item.get("chunks", [])) for item in documents),
                "average_chunks_per_document": round(sum(len(item.get("chunks", [])) for item in documents) / len(documents), 1) if documents else 0,
            },
            "recent_activity": sorted(activities, key=lambda item: item["created_at"], reverse=True)[:10],
        }

    def search(self, owner_id: str, query: str) -> dict:
        results = []
        lowered = query.lower()
        for document in self._documents_for_owner(owner_id):
            haystack = f"{document['filename']} {document['analysis']['document_type']} {document['text']}".lower()
            if lowered in haystack:
                results.append(
                    {
                        "id": document["id"],
                        "filename": document["filename"],
                        "document_type": document["analysis"]["document_type"],
                        "risk_score": document["analysis"].get("risk_score", 0),
                        "review_status": document["analysis"].get("structured_extraction", {}).get("review_status", "Needs review"),
                        "summary": document["analysis"]["summary"],
                    }
                )
        return {"results": results, "total": len(results)}

    def add_query(self, document_id: str, owner_id: str, question: str, answer: str) -> None:
        document = self.get_document(document_id, owner_id)
        if not document:
            raise KeyError(document_id)
        document.setdefault("queries", []).append(
            {
                "question": question,
                "answer": answer,
                "created_at": datetime.now(timezone.utc).isoformat(),
            }
        )
        self.update_document(document_id, owner_id, document)

    def _documents_for_owner(self, owner_id: str) -> list[dict]:
        with connect() as connection:
            rows = connection.execute(
                "SELECT payload_json FROM documents WHERE owner_id = ? ORDER BY created_at DESC",
                (owner_id,),
            ).fetchall()
        return [decode_payload(row["payload_json"]) for row in rows]

    def _migrate_legacy_documents(self) -> None:
        if not LEGACY_DATA_PATH.exists():
            return
        with connect() as connection:
            legacy_user = connection.execute("SELECT id FROM users WHERE id = ?", (LEGACY_OWNER_ID,)).fetchone()
            if not legacy_user:
                connection.execute(
                    """
                    INSERT INTO users (id, email, name, avatar, role, provider, password_hash, created_at)
                    VALUES (?, 'admin@documind.ai', 'DocuMind Admin', '', 'Admin', 'email', NULL, ?)
                    """,
                    (LEGACY_OWNER_ID, utc_now()),
                )

            existing = connection.execute("SELECT COUNT(*) AS count FROM documents WHERE owner_id = ?", (LEGACY_OWNER_ID,)).fetchone()
            if existing["count"]:
                return

            legacy_documents = json.loads(LEGACY_DATA_PATH.read_text(encoding="utf-8"))
            for document in legacy_documents.values():
                document["owner_id"] = LEGACY_OWNER_ID
                created_at = document.get("created_at", utc_now())
                connection.execute(
                    """
                    INSERT OR IGNORE INTO documents (id, owner_id, payload_json, created_at, updated_at)
                    VALUES (?, ?, ?, ?, ?)
                    """,
                    (document["id"], LEGACY_OWNER_ID, encode_payload(document), created_at, created_at),
                )


document_store = DocumentStore()
