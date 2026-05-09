def build_workflow_trace(document: dict) -> dict:
    analysis = document["analysis"]
    metadata = document.get("metadata", {})
    structured = analysis.get("structured_extraction", {})
    processor = structured.get("processor", {"name": "General Processor"})
    chunk_count = len(document.get("chunks", []))
    field_count = len([field for field in structured.get("fields", []) if field.get("status") == "extracted"])
    pii_count = sum(len(values) for values in analysis.get("pii", {}).values())
    query_count = len(document.get("queries", []))

    nodes = [
        _node("upload", "Upload Gateway", "input", "completed", "File received and stored", 120, {"filename": document["filename"]}),
        _node("parser", "Format Router", "router", "completed", f"{metadata.get('extension', 'unknown')} document routed", 80, metadata),
        _node("ocr", "OCR Agent", "agent", "completed" if metadata.get("ocr_applied") else "skipped", "Image OCR extraction" if metadata.get("ocr_applied") else "Native text path", 540 if metadata.get("ocr_applied") else 0, {"ocr_applied": metadata.get("ocr_applied", False)}),
        _node("extract", "Text Extraction", "tool", "completed", "Raw text extracted", 180, {"characters": len(document.get("text", ""))}),
        _node("metadata", "Metadata Agent", "agent", "completed", "Document metadata normalized", 95, metadata),
        _node("chunker", "Semantic Chunker", "agent", "completed", f"{chunk_count} citation chunks created", 210, {"chunks": chunk_count}),
        _node("embedder", "Embedding Generator", "model", "completed", "Embedding IDs generated for vector indexing", 260, {"vectors": chunk_count}),
        _node("indexer", "Vector Indexer", "store", "completed", "Chunks indexed for retrieval", 160, {"indexed_chunks": chunk_count}),
        _node("classifier", "Classifier Agent", "agent", "completed", analysis["document_type"], 140, {"confidence": analysis["classification_confidence"]}),
        _node("processor", processor["name"], "processor", "completed", f"{field_count} structured fields extracted", 320, {"review_status": structured.get("review_status", "Needs review"), "quality_score": structured.get("quality_score", 0)}),
        _node("pii", "PII Detection Agent", "agent", "completed", f"{pii_count} sensitive signals", 120, {"pii_alerts": pii_count}),
        _node("risk", "Risk & Compliance Agent", "agent", "completed", f"{analysis.get('risk_severity', 'Low')} risk score {analysis.get('risk_score', 0)}", 180, {"risk_score": analysis.get("risk_score", 0)}),
        _node("summary", "Summarizer Agent", "agent", "completed", "Executive summary and actions generated", 220, {"actions": len(analysis.get("suggested_actions", []))}),
        _node("rag", "RAG Runtime", "runtime", "idle" if query_count == 0 else "completed", f"{query_count} grounded queries answered", 0 if query_count == 0 else 280, {"queries": query_count}),
        _node("review", "Human Review", "human", structured.get("review_status", "Needs review"), "Structured output review gate", 0, {"status": structured.get("review_status", "Needs review")}),
        _node("export", "JSON Export", "output", "ready", "Structured payload available for business systems", 0, {"endpoint": f"/api/documents/{document['id']}/export"}),
    ]

    edges = [
        _edge("upload", "parser"),
        _edge("parser", "ocr"),
        _edge("parser", "extract"),
        _edge("ocr", "extract"),
        _edge("extract", "metadata"),
        _edge("extract", "chunker"),
        _edge("chunker", "embedder"),
        _edge("embedder", "indexer"),
        _edge("extract", "classifier"),
        _edge("classifier", "processor"),
        _edge("extract", "pii"),
        _edge("processor", "risk"),
        _edge("pii", "risk"),
        _edge("extract", "summary"),
        _edge("indexer", "rag"),
        _edge("processor", "review"),
        _edge("review", "export"),
    ]

    return {
        "workflow_id": f"documind-{document['id']}",
        "name": "DocuMind Intelligent Document Pipeline",
        "status": "completed",
        "nodes": nodes,
        "edges": edges,
        "summary": {
            "total_nodes": len(nodes),
            "completed_nodes": len([node for node in nodes if node["status"] in {"completed", "ready", "skipped", "idle", "Approved", "Auto-approved"}]),
            "agents": len([node for node in nodes if node["type"] in {"agent", "processor", "model", "runtime"}]),
            "total_duration_ms": sum(node["duration_ms"] for node in nodes),
            "routing_decision": f"{analysis['document_type']} -> {processor['name']}",
        },
    }


def _node(node_id: str, label: str, node_type: str, status: str, detail: str, duration_ms: int, output: dict) -> dict:
    return {
        "id": node_id,
        "label": label,
        "type": node_type,
        "status": status,
        "detail": detail,
        "duration_ms": duration_ms,
        "output": output,
    }


def _edge(source: str, target: str) -> dict:
    return {"source": source, "target": target}
