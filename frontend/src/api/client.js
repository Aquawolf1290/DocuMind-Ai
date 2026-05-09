const API_BASE = import.meta.env.VITE_API_BASE || "http://127.0.0.1:8010/api";
const SESSION_KEY = "documind_session";

function authHeaders(extra = {}) {
  const session = getStoredSession();
  return {
    ...extra,
    ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
  };
}

export function getStoredSession() {
  try {
    return JSON.parse(localStorage.getItem(SESSION_KEY) || "null");
  } catch {
    return null;
  }
}

export function storeSession(session) {
  localStorage.setItem(SESSION_KEY, JSON.stringify(session));
}

export function clearSession() {
  localStorage.removeItem(SESSION_KEY);
}

export async function signInWithGoogle(credential) {
  const response = await fetch(`${API_BASE}/auth/google`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ credential }),
  });
  return handleResponse(response);
}

export async function signInWithEmail({ email, password, name, mode }) {
  const response = await fetch(`${API_BASE}/auth/email`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password, name, mode }),
  });
  return handleResponse(response);
}

export async function getDocuments() {
  const response = await fetch(`${API_BASE}/documents`, { headers: authHeaders() });
  return handleResponse(response);
}

export async function getMetrics() {
  const response = await fetch(`${API_BASE}/documents/metrics`, { headers: authHeaders() });
  return handleResponse(response);
}

export async function searchDocuments(query) {
  const response = await fetch(`${API_BASE}/documents/search?q=${encodeURIComponent(query)}`, { headers: authHeaders() });
  return handleResponse(response);
}

export async function getProcessors() {
  const response = await fetch(`${API_BASE}/documents/processors`, { headers: authHeaders() });
  return handleResponse(response);
}

export async function getDocument(documentId) {
  const response = await fetch(`${API_BASE}/documents/${documentId}`, { headers: authHeaders() });
  return handleResponse(response);
}

export async function exportDocument(documentId) {
  const response = await fetch(`${API_BASE}/documents/${documentId}/export`, { headers: authHeaders() });
  return handleResponse(response);
}

export async function reprocessDocument(documentId) {
  const response = await fetch(`${API_BASE}/documents/${documentId}/reprocess`, {
    method: "POST",
    headers: authHeaders(),
  });
  return handleResponse(response);
}

export async function getWorkflow(documentId) {
  const response = await fetch(`${API_BASE}/documents/${documentId}/workflow`, { headers: authHeaders() });
  return handleResponse(response);
}

export async function updateReviewStatus(documentId, status) {
  const response = await fetch(`${API_BASE}/documents/${documentId}/review`, {
    method: "PATCH",
    headers: authHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify({ status }),
  });
  return handleResponse(response);
}

export async function uploadDocument(file) {
  const formData = new FormData();
  formData.append("file", file);
  const response = await fetch(`${API_BASE}/documents/upload`, {
    method: "POST",
    headers: authHeaders(),
    body: formData,
  });
  return handleResponse(response);
}

export async function askDocument(documentId, question) {
  const response = await fetch(`${API_BASE}/documents/${documentId}/ask`, {
    method: "POST",
    headers: authHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify({ question }),
  });
  return handleResponse(response);
}

async function handleResponse(response) {
  const data = await response.json();
  if (!response.ok) {
    if (response.status === 401) {
      clearSession();
      window.dispatchEvent(new Event("documind:session-expired"));
    }
    throw new Error(data.detail || "Something went wrong.");
  }
  return data;
}
