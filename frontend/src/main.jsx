import React, { useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import { motion } from "framer-motion";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  Activity,
  AlertTriangle,
  Bot,
  Brain,
  CheckCircle2,
  ChevronRight,
  Clock3,
  Command,
  Cpu,
  Database,
  Download,
  Eye,
  FileSearch,
  FileText,
  Fingerprint,
  Gauge,
  Layers3,
  Loader2,
  LockKeyhole,
  LogOut,
  Mail,
  MessageSquareText,
  Network,
  PanelLeft,
  Radar,
  Search,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Upload,
  UserCircle,
  Workflow,
  X,
  Zap,
} from "lucide-react";
import {
  askDocument,
  clearSession,
  exportDocument,
  getDocument,
  getDocuments,
  getMetrics,
  getProcessors,
  getStoredSession,
  getWorkflow,
  reprocessDocument,
  searchDocuments,
  signInWithGoogle,
  signInWithEmail,
  storeSession,
  updateReviewStatus,
  uploadDocument,
} from "./api/client";
import "./styles.css";

const PIPELINE_STAGES = [
  "Uploading",
  "Extracting text",
  "Chunking",
  "Generating embeddings",
  "Indexing",
  "Completed",
];

const stagger = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { staggerChildren: 0.055 } },
};

const cardMotion = {
  hidden: { opacity: 0, y: 14 },
  show: { opacity: 1, y: 0, transition: { duration: 0.32, ease: "easeOut" } },
};

const tooltipStyle = {
  background: "rgba(15, 23, 42, 0.94)",
  border: "1px solid rgba(148, 163, 184, 0.28)",
  borderRadius: "12px",
  color: "#e5e7eb",
};

const riskColors = ["#22d3ee", "#f59e0b", "#fb7185", "#8b5cf6"];

function App() {
  const [session, setSession] = useState(() => getStoredSession());
  const [documents, setDocuments] = useState([]);
  const [metrics, setMetrics] = useState(null);
  const [processors, setProcessors] = useState([]);
  const [activeDocument, setActiveDocument] = useState(null);
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState(null);
  const [workflow, setWorkflow] = useState(null);
  const [loading, setLoading] = useState("");
  const [error, setError] = useState("");
  const [pipelineStep, setPipelineStep] = useState(0);
  const [globalQuery, setGlobalQuery] = useState("");
  const [searchResults, setSearchResults] = useState([]);
  const [installPrompt, setInstallPrompt] = useState(null);
  const [isInstalled, setIsInstalled] = useState(false);

  useEffect(() => {
    if (session) refreshWorkspace();
  }, [session?.access_token]);

  useEffect(() => {
    const onExpired = () => {
      setSession(null);
      setError("Session expired. Please sign in again.");
    };
    window.addEventListener("documind:session-expired", onExpired);
    return () => window.removeEventListener("documind:session-expired", onExpired);
  }, []);

  useEffect(() => {
    document.documentElement.dataset.theme = "dark";
  }, []);

  useEffect(() => {
    registerServiceWorker();
    const onBeforeInstallPrompt = (event) => {
      event.preventDefault();
      setInstallPrompt(event);
    };
    const onInstalled = () => {
      setIsInstalled(true);
      setInstallPrompt(null);
    };
    window.addEventListener("beforeinstallprompt", onBeforeInstallPrompt);
    window.addEventListener("appinstalled", onInstalled);
    setIsInstalled(window.matchMedia?.("(display-mode: standalone)").matches || window.navigator.standalone === true);
    return () => {
      window.removeEventListener("beforeinstallprompt", onBeforeInstallPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  useEffect(() => {
    if (loading !== "upload") return undefined;
    const timer = window.setInterval(() => {
      setPipelineStep((step) => Math.min(step + 1, PIPELINE_STAGES.length - 1));
    }, 650);
    return () => window.clearInterval(timer);
  }, [loading]);

  const filteredDocuments = useMemo(() => {
    if (!globalQuery.trim()) return documents;
    const query = globalQuery.toLowerCase();
    return documents.filter((doc) => `${doc.filename} ${doc.document_type} ${doc.summary}`.toLowerCase().includes(query));
  }, [documents, globalQuery]);

  async function refreshWorkspace() {
    try {
      const [docData, metricData, processorData] = await Promise.all([getDocuments(), getMetrics(), getProcessors()]);
      setDocuments(docData.documents);
      setMetrics(metricData);
      setProcessors(processorData.processors);
    } catch (err) {
      setError(err.message);
    }
  }

  function handleAuthenticated(nextSession) {
    storeSession(nextSession);
    setSession(nextSession);
    setError("");
  }

  function handleLogout() {
    clearSession();
    setSession(null);
    setDocuments([]);
    setMetrics(null);
    setProcessors([]);
    setActiveDocument(null);
    setAnswer(null);
    setWorkflow(null);
  }

  async function handleGlobalSearch(value) {
    setGlobalQuery(value);
    if (value.trim().length < 2) {
      setSearchResults([]);
      return;
    }
    try {
      const response = await searchDocuments(value.trim());
      setSearchResults(response.results);
    } catch {
      setSearchResults([]);
    }
  }

  async function handleUploadFile(file) {
    if (!file) return;
    setError("");
    setAnswer(null);
    setPipelineStep(0);
    setLoading("upload");
    try {
      const uploaded = await uploadDocument(file);
      setPipelineStep(PIPELINE_STAGES.length - 1);
      setActiveDocument(uploaded);
      await refreshWorkspace();
    } catch (err) {
      setError(err.message);
    } finally {
      window.setTimeout(() => setLoading(""), 550);
    }
  }

  async function handleAsk(event) {
    event.preventDefault();
    if (!activeDocument || !question.trim()) return;
    setLoading("ask");
    setError("");
    try {
      const response = await askDocument(activeDocument.id, question.trim());
      setAnswer(response);
      setQuestion("");
      await refreshWorkspace();
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading("");
    }
  }

  async function handleInstallApp() {
    if (!installPrompt) return;
    await installPrompt.prompt();
    const choice = await installPrompt.userChoice;
    if (choice.outcome === "accepted") {
      setInstallPrompt(null);
      setIsInstalled(true);
    }
  }

  const analysis = activeDocument?.analysis;

  useEffect(() => {
    if (!activeDocument) {
      setWorkflow(null);
      return;
    }
    getWorkflow(activeDocument.id).then(setWorkflow).catch(() => setWorkflow(null));
  }, [activeDocument?.id]);

  if (!session) {
    return <AuthScreen onAuthenticated={handleAuthenticated} />;
  }

  return (
    <main className="app-shell">
      <div className="ambient-layer" aria-hidden="true" />
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark"><Brain size={22} /></div>
          <div>
            <h1>DocuMind AI</h1>
            <p>Enterprise AI Operating System</p>
          </div>
        </div>

        <div className="system-card">
          <span className="live-dot" />
          <div>
            <strong>Runtime online</strong>
            <small>{metrics?.indexed_documents ?? 0} indexed docs / {metrics?.ai_queries ?? 0} grounded queries</small>
          </div>
        </div>

        <div className="user-card">
          {session.user.avatar ? <img src={session.user.avatar} alt="" /> : <UserCircle size={34} />}
          <div>
            <strong>{session.user.name}</strong>
            <small>{session.user.role} / {session.user.email}</small>
          </div>
          <button type="button" onClick={handleLogout} title="Sign out">
            <LogOut size={15} />
          </button>
        </div>

        <button className="install-app-button" onClick={handleInstallApp} disabled={!installPrompt || isInstalled}>
          <Download size={16} />
          <span>{isInstalled ? "App installed" : installPrompt ? "Install DocuMind app" : "Install ready soon"}</span>
        </button>

        <UploadZone loading={loading === "upload"} onUpload={handleUploadFile} />

        <nav className="nav-stack">
          <a href="#dashboard"><PanelLeft size={16} /> Operations</a>
          <a href="#workflow"><Workflow size={16} /> Orchestration</a>
          <a href="#insights"><Sparkles size={16} /> AI Insights</a>
          <a href="#rag"><MessageSquareText size={16} /> Enterprise RAG</a>
        </nav>

        <nav className="document-list">
          <span className="nav-label">Workspace documents</span>
          {filteredDocuments.map((doc) => (
            <button key={doc.id} className={activeDocument?.id === doc.id ? "active" : ""} onClick={() => fetchDocument(doc.id, setActiveDocument, setError)}>
              <DocumentThumb type={doc.document_type} />
              <span>
                <strong>{doc.filename}</strong>
                <small>{doc.document_type} / {doc.review_status}</small>
              </span>
              <i className={`risk-dot ${doc.risk_severity?.toLowerCase()}`} />
            </button>
          ))}
        </nav>
      </aside>

      <section className="workspace">
        <header className="topbar">
          <div>
            <p className="eyebrow">AI-native document intelligence</p>
            <h2>{activeDocument ? activeDocument.filename : "AI operations center"}</h2>
          </div>
          <div className="top-actions">
            <div className="command-search">
              <Command size={16} />
              <input value={globalQuery} onChange={(event) => handleGlobalSearch(event.target.value)} placeholder="Search documents, risks, topics..." />
              <kbd>Ctrl K</kbd>
            </div>
            <button className="icon-button" title="Runtime monitor">
              <Activity size={17} />
            </button>
          </div>
        </header>

        {error && <div className="notice error">{error}</div>}
        {searchResults.length > 0 && <SearchResults results={searchResults} onOpen={(id) => fetchDocument(id, setActiveDocument, setError)} />}
        {loading === "upload" && <PipelineProgress step={pipelineStep} />}

        {!activeDocument ? (
          <Dashboard metrics={metrics} documents={filteredDocuments} processors={processors} />
        ) : (
          <DocumentWorkspace
            document={activeDocument}
            analysis={analysis}
            answer={answer}
            workflow={workflow}
            question={question}
            loading={loading}
            onQuestionChange={setQuestion}
            onAsk={handleAsk}
            onDocumentUpdated={setActiveDocument}
            onReviewUpdated={refreshWorkspace}
          />
        )}
      </section>
    </main>
  );
}

function AuthScreen({ onAuthenticated }) {
  const googleClientId = import.meta.env.VITE_GOOGLE_CLIENT_ID;
  const [mode, setMode] = useState("signin");
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [authError, setAuthError] = useState("");
  const [loadingAuth, setLoadingAuth] = useState("");

  useEffect(() => {
    if (!googleClientId) return undefined;

    const mountGoogleButton = () => {
      if (!window.google?.accounts?.id) return;
      window.google.accounts.id.initialize({
        client_id: googleClientId,
        callback: async (response) => {
          setAuthError("");
          setLoadingAuth("google");
          try {
            const session = await signInWithGoogle(response.credential);
            onAuthenticated(session);
          } catch (err) {
            setAuthError(err.message);
          } finally {
            setLoadingAuth("");
          }
        },
      });
      window.google.accounts.id.renderButton(document.getElementById("googleSignInButton"), {
        theme: "filled_black",
        size: "large",
        shape: "pill",
        text: "continue_with",
        width: 320,
      });
    };

    if (window.google?.accounts?.id) {
      mountGoogleButton();
      return undefined;
    }

    const script = document.createElement("script");
    script.src = "https://accounts.google.com/gsi/client";
    script.async = true;
    script.defer = true;
    script.onload = mountGoogleButton;
    document.head.appendChild(script);
    return () => {
      script.onload = null;
    };
  }, [googleClientId, onAuthenticated]);

  async function handleDemoSignIn(event) {
    event.preventDefault();
    if (!password.trim()) {
      setAuthError("Enter a password to continue.");
      return;
    }
    setAuthError("");
    setLoadingAuth("demo");
    try {
      const session = await signInWithEmail({ email: email.trim(), password, name: name.trim(), mode });
      onAuthenticated(session);
    } catch (err) {
      setAuthError(err.message);
    } finally {
      setLoadingAuth("");
    }
  }

  return (
    <main className="auth-shell">
      <div className="ambient-layer" aria-hidden="true" />
      <section className="auth-hero">
        <div className="brand large">
          <div className="brand-mark"><Brain size={26} /></div>
          <div>
            <h1>DocuMind AI</h1>
            <p>Secure enterprise document intelligence</p>
          </div>
        </div>
        <h2>Sign in to your AI operations workspace.</h2>
        <p>Use Google sign-in for workspace identity, RBAC-ready access, document audit trails, and secure AI workflows.</p>
        <div className="auth-signal-grid">
          <span><ShieldCheck size={16} /> Google identity</span>
          <span><LockKeyhole size={16} /> RBAC ready</span>
          <span><Radar size={16} /> Audit aware</span>
        </div>
      </section>

      <section className="auth-card panel">
        <div className="auth-card-head">
          <span><Sparkles size={18} /></span>
          <div>
            <strong>{mode === "signin" ? "Welcome back" : "Create your account"}</strong>
            <small>{mode === "signin" ? "Sign in to continue to DocuMind" : "Start a secure AI workspace"}</small>
          </div>
        </div>

        <div className="auth-tabs" role="tablist" aria-label="Authentication mode">
          <button type="button" className={mode === "signin" ? "active" : ""} onClick={() => setMode("signin")}>Sign in</button>
          <button type="button" className={mode === "signup" ? "active" : ""} onClick={() => setMode("signup")}>Sign up</button>
        </div>

        <div className="google-auth-box">
          {googleClientId ? (
            <div id="googleSignInButton" />
          ) : (
            <button type="button" className="google-auth-button" onClick={() => setAuthError("Google sign-in is not configured yet. Add the Google OAuth Client ID to enable it.")}>
              <span className="google-logo">G</span>
              Continue with Google
            </button>
          )}
        </div>

        <div className="auth-divider"><span>or continue with email</span></div>

        <form className="auth-form" onSubmit={handleDemoSignIn}>
          {mode === "signup" && (
            <label>
              <span>Full name</span>
              <input value={name} onChange={(event) => setName(event.target.value)} placeholder="Your name" autoComplete="name" />
            </label>
          )}
          <label>
            <span>Email</span>
            <div className="input-with-icon">
              <Mail size={16} />
              <input type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@company.com" autoComplete="email" required />
            </div>
          </label>
          <label>
            <span>Password</span>
            <div className="input-with-icon">
              <LockKeyhole size={16} />
              <input type="password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Enter your password" autoComplete={mode === "signin" ? "current-password" : "new-password"} required />
            </div>
          </label>
          <div className="auth-options">
            <label className="remember-row">
              <input type="checkbox" defaultChecked />
              <span>Remember me</span>
            </label>
            {mode === "signin" && <button type="button">Forgot password?</button>}
          </div>
          <button className="primary-auth-button" type="submit" disabled={loadingAuth === "demo"}>
            {loadingAuth === "demo" ? <Loader2 className="spin" size={16} /> : <UserCircle size={16} />}
            {mode === "signin" ? "Sign in" : "Create account"}
          </button>
        </form>

        <p className="auth-footnote">
          {mode === "signin" ? "New to DocuMind?" : "Already have an account?"}{" "}
          <button type="button" onClick={() => setMode(mode === "signin" ? "signup" : "signin")}>
            {mode === "signin" ? "Create an account" : "Sign in"}
          </button>
        </p>

        {!googleClientId && (
          <p className="auth-admin-note">
            Admin setup: add `VITE_GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_ID` to activate real Google OAuth.
          </p>
        )}

        {loadingAuth === "google" && <p className="auth-status"><Loader2 className="spin" size={14} /> Verifying Google account...</p>}
        {authError && <div className="notice error">{authError}</div>}
      </section>
    </main>
  );
}

function UploadZone({ loading, onUpload }) {
  const [dragging, setDragging] = useState(false);
  return (
    <label
      className={`upload-zone ${dragging ? "dragging" : ""}`}
      onDragOver={(event) => {
        event.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(event) => {
        event.preventDefault();
        setDragging(false);
        onUpload(event.dataTransfer.files?.[0]);
      }}
    >
      <input type="file" accept=".pdf,.docx,.txt,.png,.jpg,.jpeg,.webp,.tiff" onChange={(event) => onUpload(event.target.files?.[0])} />
      {loading ? <Loader2 className="spin" /> : <Upload />}
      <span>Upload or drop document</span>
      <small>PDF, DOCX, TXT, images</small>
    </label>
  );
}

function PipelineProgress({ step }) {
  return (
    <section className="pipeline panel">
      <div className="panel-title">
        <Workflow />
        <h3>Intelligent ingestion pipeline</h3>
      </div>
      <div className="pipeline-steps">
        {PIPELINE_STAGES.map((stage, index) => (
          <div className={`pipeline-step ${index <= step ? "complete" : ""}`} key={stage}>
            <span>{index < step ? <CheckCircle2 size={16} /> : index === step ? <Loader2 className="spin" size={16} /> : <Clock3 size={16} />}</span>
            <small>{stage}</small>
          </div>
        ))}
      </div>
    </section>
  );
}

function Dashboard({ metrics, documents, processors }) {
  if (!metrics) return <SkeletonDashboard />;
  const usageData = buildUsageData(metrics);
  const categoryData = toChartData(metrics.top_categories);
  const riskData = toChartData(metrics.risk_distribution);
  return (
    <motion.div className="dashboard" id="dashboard" initial="hidden" animate="show" variants={stagger}>
      <section className="hero-console panel">
        <div>
          <p className="eyebrow">Command center</p>
          <h2>Enterprise AI workspace for grounded document operations.</h2>
          <p>Ingest, classify, extract, monitor risk, detect PII, and ask citation-backed questions across your indexed corpus.</p>
        </div>
        <div className="hero-orbit">
          <span><Brain size={22} /></span>
          <i />
          <strong>{metrics.processing_analytics.chunks_indexed}</strong>
          <small>indexed chunks</small>
        </div>
      </section>

      <Metric icon={<FileText />} label="Total documents" value={metrics.total_documents} detail="Files in workspace" />
      <Metric icon={<Database />} label="Indexed documents" value={metrics.indexed_documents} detail="Search-ready corpus" />
      <Metric icon={<Clock3 />} label="Processing queue" value={metrics.processing_queue} detail="Live async jobs" />
      <Metric icon={<MessageSquareText />} label="AI queries" value={metrics.ai_queries} detail="Grounded answers" />
      <Metric icon={<ShieldAlert />} label="High-risk docs" value={metrics.high_risk_documents} tone="danger" detail="Needs attention" />
      <Metric icon={<Fingerprint />} label="PII alerts" value={metrics.pii_alerts} tone="warning" detail="Sensitive signals" />
      <Metric icon={<FileSearch />} label="Needs review" value={metrics.needs_review} tone="warning" detail="Human review lane" />

      <section className="panel chart-panel wide-panel">
        <PanelHeading icon={<Activity />} title="Query analytics" meta="live from backend" />
        <div className="chart-shell">
          <ResponsiveContainer width="100%" height={230}>
            <AreaChart data={usageData}>
              <defs>
                <linearGradient id="usageGlow" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#7c3aed" stopOpacity={0.55} />
                  <stop offset="95%" stopColor="#22d3ee" stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <CartesianGrid stroke="rgba(148, 163, 184, 0.14)" vertical={false} />
              <XAxis dataKey="name" stroke="#94a3b8" tickLine={false} axisLine={false} />
              <YAxis stroke="#94a3b8" tickLine={false} axisLine={false} />
              <Tooltip contentStyle={tooltipStyle} />
              <Area type="monotone" dataKey="value" stroke="#8b5cf6" fill="url(#usageGlow)" strokeWidth={3} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </section>

      <section className="panel recent-panel">
        <PanelHeading icon={<Workflow />} title="Workflow processing" meta="processor catalog" />
        <div className="processor-grid">
          {processors.map((processor) => (
            <article key={processor.id} className="processor-card">
              <span>{processor.category}</span>
              <strong>{processor.name}</strong>
              <p>{processor.description}</p>
              <small>{processor.document_types.join(", ")}</small>
            </article>
          ))}
        </div>
      </section>

      <section className="panel chart-panel">
        <PanelHeading icon={<Layers3 />} title="Top categories" meta="classification" />
        <ResponsiveContainer width="100%" height={230}>
          <BarChart data={categoryData}>
            <CartesianGrid stroke="rgba(148, 163, 184, 0.14)" vertical={false} />
            <XAxis dataKey="name" stroke="#94a3b8" tickLine={false} axisLine={false} />
            <YAxis stroke="#94a3b8" tickLine={false} axisLine={false} />
            <Tooltip contentStyle={tooltipStyle} />
            <Bar dataKey="value" radius={[8, 8, 0, 0]} fill="#22d3ee" />
          </BarChart>
        </ResponsiveContainer>
      </section>

      <section className="panel chart-panel">
        <PanelHeading icon={<Gauge />} title="Risk monitoring" meta="severity mix" />
        <ResponsiveContainer width="100%" height={230}>
          <PieChart>
            <Pie data={riskData} dataKey="value" nameKey="name" innerRadius={58} outerRadius={90} paddingAngle={4}>
              {riskData.map((entry, index) => <Cell key={entry.name} fill={riskColors[index % riskColors.length]} />)}
            </Pie>
            <Tooltip contentStyle={tooltipStyle} />
          </PieChart>
        </ResponsiveContainer>
        <DistributionChart data={metrics.risk_distribution} />
      </section>

      <section className="panel recent-panel">
        <PanelHeading icon={<Zap />} title="Live AI activity" meta="audit stream" />
        {metrics.recent_activity.length ? metrics.recent_activity.map((item) => (
          <article key={`${item.type}-${item.created_at}`} className="activity-row">
            <span><Sparkles size={15} /></span>
            <div>
              <strong>{item.label}</strong>
              <small>{new Date(item.created_at).toLocaleString()}</small>
            </div>
          </article>
        )) : <EmptyState title="No activity yet" text="Upload a document to start the intelligence pipeline." />}
      </section>

      <section className="panel recent-panel">
        <PanelHeading icon={<FileSearch />} title="Document inventory" meta="hover to inspect" />
        {documents.length ? documents.map((doc) => (
          <article key={doc.id} className="document-row">
            <DocumentThumb type={doc.document_type} />
            <div>
              <strong>{doc.filename}</strong>
              <p>{doc.processor} / {doc.review_status} / Quality {doc.quality_score}</p>
              <p>{doc.summary}</p>
              <div className="doc-actions">
                <span>{doc.document_type}</span>
                <span>{doc.chunk_count} chunks</span>
                <span>{doc.query_count} queries</span>
              </div>
            </div>
            <span className={`severity ${doc.risk_severity?.toLowerCase()}`}>{doc.risk_severity}</span>
          </article>
        )) : <EmptyState title="No documents indexed" text="The operations center will populate from real uploads and queries." />}
      </section>
    </motion.div>
  );
}

function DocumentWorkspace({ document, analysis, answer, workflow, question, loading, onQuestionChange, onAsk, onDocumentUpdated, onReviewUpdated }) {
  const structured = analysis.structured_extraction;
  const [reprocessing, setReprocessing] = useState(false);

  async function handleExport() {
    const payload = await exportDocument(document.id);
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = window.document.createElement("a");
    anchor.href = url;
    anchor.download = `${document.filename}-extraction.json`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  async function handleReviewChange(status) {
    await updateReviewStatus(document.id, status);
    const updated = await getDocument(document.id);
    onDocumentUpdated(updated);
    onReviewUpdated();
    window.location.hash = `review-${status}`;
  }

  async function handleReprocess() {
    setReprocessing(true);
    try {
      const updated = await reprocessDocument(document.id);
      onDocumentUpdated(updated);
      onReviewUpdated();
    } finally {
      setReprocessing(false);
    }
  }

  return (
    <div className="analysis-grid">
      <AIInsightsPanel analysis={analysis} structured={structured} document={document} />

      <section className="panel summary-panel">
        <PanelHeading icon={<FileSearch />} title="Document AI processor output" meta={structured.processor.category} />
        <div className="processor-toolbar">
          <div>
            <span className="category-pill">{structured.processor.name}</span>
            <span className={`severity ${structured.review_status === "Needs review" ? "medium" : "low"}`}>{structured.review_status}</span>
            <span>Quality {structured.quality_score}</span>
          </div>
          <div>
            <select defaultValue={structured.review_status} onChange={(event) => handleReviewChange(event.target.value)}>
              <option>Needs review</option>
              <option>In review</option>
              <option>Approved</option>
              <option>Rejected</option>
            </select>
            <button className="secondary-button" onClick={handleExport} title="Export structured JSON">
              <Download size={16} />
              Export JSON
            </button>
            <button className="secondary-button" onClick={handleReprocess} disabled={reprocessing} title="Re-read the original file with OCR-assisted extraction">
              {reprocessing ? <Loader2 className="spin" size={16} /> : <FileSearch size={16} />}
              Re-read PDF
            </button>
          </div>
        </div>
        <div className="extraction-quality">
          <span>{document.metadata?.words_extracted || 0} words extracted</span>
          <span>{document.metadata?.page_count || 0} pages</span>
          <span>{document.metadata?.ocr_applied ? "OCR assisted" : "Native text"}</span>
          <span>{document.metadata?.extraction_engine || "native"}</span>
        </div>
        <div className="field-grid">
          {structured.fields.map((field) => (
            <article className={`field-card ${field.status}`} key={field.name}>
              <small>{field.label}</small>
              <strong>{field.value || "Missing"}</strong>
              <span>{Math.round(field.confidence * 100)}% confidence</span>
              {field.source && <p>{field.source.citation}</p>}
            </article>
          ))}
        </div>
        {structured.tables.length > 0 && (
          <div className="table-preview">
            <strong>Detected table candidates</strong>
            {structured.tables[0].rows.slice(0, 5).map((row, index) => (
              <p key={index}>{row.cells.join(" | ")}</p>
            ))}
          </div>
        )}
        {structured.review_reasons.length > 0 && (
          <div className="review-reasons">
            {structured.review_reasons.map((reason) => <span key={reason}>{reason}</span>)}
          </div>
        )}
      </section>

      <WorkflowCanvas workflow={workflow} />

      <DocumentQueryAnalytics document={document} answer={answer} />

      <section className="panel">
        <PanelHeading icon={<Workflow />} title="Pipeline status" meta="live states" />
        <div className="compact-pipeline">
          {analysis.pipeline.map((stage) => (
            <div key={stage.key}>
              <CheckCircle2 size={16} />
              <span>{stage.label}</span>
              <small>{stage.status}{stage.count ? ` | ${stage.count}` : ""}</small>
            </div>
          ))}
        </div>
      </section>

      <section className="panel">
        <PanelHeading icon={<FileSearch />} title="Entities & topics" meta="semantic signals" />
        <StructuredEntities analysis={analysis} />
      </section>

      <section className="panel">
        <PanelHeading icon={<AlertTriangle />} title="Risk monitoring" meta={`${analysis.risk_score}/100`} />
        {analysis.risks.length || analysis.compliance_flags.length ? (
          [...analysis.risks, ...analysis.compliance_flags].map((item) => (
            <div className="risk-row" key={item.title}>
              <strong>{item.title}</strong>
              <small>{item.severity} | {item.recommendation || item.detail}</small>
            </div>
          ))
        ) : (
          <EmptyState title="No risk flags" text="The risk agent did not detect notable policy, payment, privacy, or legal gaps." />
        )}
      </section>

      <section className="panel">
        <PanelHeading icon={<ShieldCheck />} title="PII alerts" meta="masking required" />
        {analysis.sensitive_information.length ? (
          analysis.sensitive_information.map((item) => (
            <div className="risk-row" key={item.type}>
              <strong>{item.type}</strong>
              <small>{item.count} detection(s) | Mask before broad sharing</small>
            </div>
          ))
        ) : <EmptyState title="No PII detected" text="No email, phone, Aadhaar/PAN-like, or bank number patterns were found." />}
      </section>

      <section className="panel">
        <PanelHeading icon={<CheckCircle2 />} title="Suggested actions" meta="next steps" />
        <ul>{analysis.suggested_actions.map((item) => <li key={item}>{item}</li>)}</ul>
      </section>

      <section className="panel qa-panel" id="rag">
        <PanelHeading icon={<MessageSquareText />} title="Enterprise RAG assistant" meta="citation grounded" />
        <form onSubmit={onAsk} className="ask-form">
          <input
            value={question}
            onChange={(event) => onQuestionChange(event.target.value)}
            placeholder="Ask about termination, invoices, cybersecurity, clauses, dates..."
          />
          <button disabled={loading === "ask"} title="Ask document">
            {loading === "ask" ? <Loader2 className="spin" /> : <MessageSquareText />}
            <span>Ask</span>
          </button>
        </form>
        {loading === "ask" && <div className="typing"><Loader2 className="spin" size={16} /> Grounding answer in indexed chunks...</div>}
        {answer && (
          <div className="answer">
            <strong>Answer</strong>
            <p>{answer.answer}</p>
            <strong>Grounded citations</strong>
            {answer.sources.map((source) => (
              <blockquote key={source.chunk_id}>
                <span>{source.citation} | relevance {source.score}</span>
                {source.text}
              </blockquote>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function AIInsightsPanel({ analysis, structured, document }) {
  const extractedFields = structured.fields?.filter((field) => field.status === "extracted").length || 0;
  const confidence = Math.round(analysis.classification_confidence * 100);
  const keyPoints = buildDisplayKeyPoints(analysis, structured);
  const topTags = analysis.tags?.slice(0, 6) || [];
  const brief = buildExpectedSummary(analysis, structured, document);

  return (
    <section className="panel summary-panel ai-insights-panel" id="insights">
      <PanelHeading icon={<Bot />} title="AI Insights" meta="document intelligence" />

      <div className="insights-hero">
        <div className="insight-primary">
          <div className="insight-header refined">
            <span className="category-pill">{analysis.document_type}</span>
            <span className={`severity ${analysis.risk_severity.toLowerCase()}`}>{analysis.risk_severity} risk</span>
            <span>{confidence}% confidence</span>
          </div>
          <h3>Expected summary</h3>
          <div className="expected-summary-grid">
            <SummaryLine label="What it is" value={brief.whatItIs} />
            <SummaryLine label="Main purpose" value={brief.mainPurpose} />
            <SummaryLine label="AI conclusion" value={brief.aiConclusion} />
            <SummaryLine label="Needs attention" value={brief.needsAttention} tone={analysis.risk_score >= 50 ? "danger" : "default"} />
          </div>
        </div>

        <div className="insight-score-card">
          <span>Risk score</span>
          <strong>{analysis.risk_score}</strong>
          <small>{analysis.risk_severity} severity / {document.chunks?.length || 0} indexed chunks</small>
        </div>
      </div>

      <div className="insight-stats-grid">
        <InsightStat icon={<FileSearch />} label="Extracted fields" value={extractedFields} />
        <InsightStat icon={<Fingerprint />} label="PII signals" value={analysis.sensitive_information?.length || 0} tone="warning" />
        <InsightStat icon={<ShieldAlert />} label="Compliance flags" value={analysis.compliance_flags?.length || 0} tone={analysis.compliance_flags?.length ? "danger" : "default"} />
        <InsightStat icon={<MessageSquareText />} label="Queries asked" value={document.queries?.length || 0} />
      </div>

      <div className="insight-sections">
        <div className="insight-card">
          <strong>Key points</strong>
          {keyPoints.length ? (
            <ul className="clean-list">
              {keyPoints.map((point) => <li key={point}>{point}</li>)}
            </ul>
          ) : (
            <p className="muted">No key points detected.</p>
          )}
        </div>

        <div className="insight-card">
          <strong>AI generated summary</strong>
          <GeneratedSummary summary={analysis.summary} />
        </div>
      </div>

      <div className="insight-sections secondary">
        <div className="insight-card">
          <strong>Suggested actions</strong>
          <ul className="clean-list">
            {(analysis.suggested_actions || []).slice(0, 3).map((action) => <li key={action}>{action}</li>)}
          </ul>
        </div>
        <div className="insight-card">
          <strong>Top signals</strong>
          <div className="tag-row focused-tags">
            {topTags.length ? topTags.map((tag) => <span key={tag}>{tag}</span>) : <span>No tags</span>}
          </div>
        </div>
      </div>
    </section>
  );
}

function GeneratedSummary({ summary }) {
  const lines = formatGeneratedSummary(summary);
  if (!lines.length) {
    return <p className="summary-copy compact">No summary generated yet.</p>;
  }

  return (
    <div className="generated-summary-box" aria-label="AI generated summary">
      {lines.map((line, index) => (
        <div className="generated-summary-line" key={`${line}-${index}`}>
          <span>{String(index + 1).padStart(2, "0")}</span>
          <p>{line}</p>
        </div>
      ))}
    </div>
  );
}

function buildDisplayKeyPoints(analysis, structured) {
  const fields = Object.fromEntries((structured?.fields || []).map((field) => [field.name, field.value]));

  if (analysis.document_type === "Resume") {
    const resumePoints = [
      fields.candidate_name && `${fields.candidate_name} is the candidate profile selected for review.`,
      fields.education && `Education: ${fields.education}.`,
      fields.experience && `Experience: ${fields.experience}.`,
      fields.skills && `Core skills: ${fields.skills}.`,
      fields.projects && `Project work includes ${fields.projects}.`,
      fields.job_fit_summary,
    ];
    const cleanedResumePoints = resumePoints.map(cleanInsightText).filter(Boolean);
    if (cleanedResumePoints.length) return cleanedResumePoints.slice(0, 5);
  }

  return (analysis.key_points || [])
    .map(cleanInsightText)
    .filter(Boolean)
    .slice(0, 5);
}

function formatGeneratedSummary(summary = "") {
  const normalized = cleanInsightText(summary)
    .replace(/\b(Technologies|Developed|Built|Analyzed|Cleaned|Processed|Created|Designed|Implemented|Integrated|Education|Experience|Projects|Skills|Certifications|Data Analyst|AI Chatbot|Loan Approval|Sales Data|Dashboard)\b/gi, " | $1")
    .replace(/\s+\|\s+/g, " | ")
    .trim();

  return normalized
    .split(/\s*\|\s*|(?<=\.)\s+(?=[A-Z])/)
    .map((line) => line.replace(/^[-:,\s]+/, "").replace(/\s{2,}/g, " ").trim())
    .filter(Boolean)
    .filter((line, index, lines) => lines.indexOf(line) === index)
    .slice(0, 8);
}

function cleanInsightText(value = "") {
  const text = String(value || "").replace(/\s+/g, " ").trim();
  if (!text) return "";

  const tokens = text.split(" ");
  const singleCharacterTokens = tokens.filter((token) => /^[A-Za-z]$/.test(token)).length;
  const isCharacterSpaced = singleCharacterTokens > 12 && singleCharacterTokens / Math.max(tokens.length, 1) > 0.45;

  return text
    .replace(isCharacterSpaced ? /\s+/g : /$^/, "")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/([A-Z]{2,})([A-Z][a-z])/g, "$1 $2")
    .replace(/([a-zA-Z])(\d)/g, "$1 $2")
    .replace(/(\d)([a-zA-Z])/g, "$1 $2")
    .replace(/([,.:;])(?=\S)/g, "$1 ")
    .replace(/\s{2,}/g, " ")
    .trim();
}

function SummaryLine({ label, value, tone = "default" }) {
  return (
    <article className={`summary-line ${tone}`}>
      <span>{label}</span>
      <strong>{value}</strong>
    </article>
  );
}

function buildExpectedSummary(analysis, structured, document) {
  const fields = Object.fromEntries((structured.fields || []).map((field) => [field.name, field.value]));
  const extractedFields = (structured.fields || []).filter((field) => field.status === "extracted").length;
  const piiCount = (analysis.sensitive_information || []).reduce((sum, item) => sum + Number(item.count || 0), 0);
  const reviewStatus = structured.review_status || "Needs review";
  const fallbackPurpose = analysis.key_points?.[0] || analysis.summary || "The document was processed and indexed for AI analysis.";

  if (analysis.document_type === "Resume") {
    return {
      whatItIs: `${fields.candidate_name || "Candidate"} resume / HR profile`,
      mainPurpose: `Evaluate skills, projects, education, and job-fit signals for ${fields.experience || "an AI/data role"}.`,
      aiConclusion: fields.job_fit_summary || fallbackPurpose,
      needsAttention: reviewStatus === "Needs review" ? "Human review required for missing or low-confidence fields." : "No major extraction review blocker.",
    };
  }

  return {
    whatItIs: `${analysis.document_type} / ${structured.processor?.name || "Document processor"}`,
    mainPurpose: fallbackPurpose,
    aiConclusion: `${extractedFields} structured fields extracted, ${document.chunks?.length || 0} chunks indexed, ${Math.round((analysis.classification_confidence || 0) * 100)}% classification confidence.`,
    needsAttention: piiCount || analysis.compliance_flags?.length
      ? `${piiCount} PII signal(s) and ${analysis.compliance_flags?.length || 0} compliance flag(s) need review.`
      : "No immediate compliance or PII blocker detected.",
  };
}

function InsightStat({ icon, label, value, tone = "default" }) {
  return (
    <article className={`insight-stat ${tone}`}>
      {React.cloneElement(icon, { size: 18 })}
      <div>
        <strong>{value}</strong>
        <span>{label}</span>
      </div>
    </article>
  );
}

function WorkflowCanvas({ workflow }) {
  const [selectedNodeId, setSelectedNodeId] = useState(null);
  if (!workflow) {
    return (
      <section className="panel summary-panel">
        <PanelHeading icon={<Network />} title="Visual AI workflow" />
        <EmptyState title="Workflow loading" text="Runtime orchestration trace is being prepared." />
      </section>
    );
  }

  const graph = buildWorkflowGraph(workflow);
  const selectedNode = selectedNodeId ? graph.nodes.find((node) => node.id === selectedNodeId) : null;
  return (
    <section className="panel summary-panel workflow-panel" id="workflow">
      <PanelHeading icon={<Network />} title="Visual AI workflow / agent orchestration" meta="runtime graph" />
      <div className="workflow-toolbar">
        <div>
          <button className="workflow-tab active">Editor</button>
          <button className="workflow-tab">Executions</button>
          <button className="workflow-tab">Evaluations</button>
        </div>
        <div>
          <span className="workflow-state"><span className="live-dot" /> Active</span>
          <button className="workflow-tab">Share</button>
        </div>
      </div>
      <div className="workflow-summary">
        <span>{workflow.summary.total_nodes} nodes</span>
        <span>{workflow.summary.agents} AI agents</span>
        <span>{workflow.summary.total_duration_ms} ms runtime</span>
        <span>{workflow.summary.routing_decision}</span>
      </div>
      <div className="workflow-canvas n8n-canvas">
        <div className="workflow-click-hint">Click any workflow task to inspect its runtime output.</div>
        <svg className="workflow-lines" viewBox={`0 0 ${graph.width} ${graph.height}`} aria-hidden="true">
          <defs>
            <marker id="workflowArrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse">
              <path d="M 0 0 L 10 5 L 0 10 z" fill="rgba(203, 213, 225, 0.75)" />
            </marker>
          </defs>
          {graph.edges.map((edge) => (
            <path
              key={`${edge.source}-${edge.target}`}
              className={`workflow-line ${edge.kind}`}
              d={edge.path}
              markerEnd="url(#workflowArrow)"
            />
          ))}
        </svg>
        {graph.nodes.map((node) => (
          <WorkflowGraphNode
            node={node}
            key={node.id}
            selected={selectedNode?.id === node.id}
            onSelect={() => setSelectedNodeId(node.id)}
          />
        ))}
        <WorkflowInspector node={selectedNode} graph={graph} onClose={() => setSelectedNodeId(null)} />
      </div>
    </section>
  );
}

function WorkflowGraphNode({ node, selected, onSelect }) {
  const Icon = workflowIcon(node.type, node.id);
  return (
    <button
      type="button"
      className={`workflow-node graph-node ${node.type} ${statusClass(node.status)} ${node.featured ? "featured" : ""} ${selected ? "selected" : ""}`}
      style={{ left: node.x, top: node.y }}
      onClick={onSelect}
      title={`Inspect ${node.label}`}
    >
      <span className="node-port node-port-in" />
      <span className="node-port node-port-out" />
      <div className="node-icon"><Icon size={18} /></div>
      <div className="node-copy">
        <strong>{node.label}</strong>
        <span>{node.type} / {node.status}</span>
      </div>
      <small>{node.detail}</small>
      <i>{node.duration_ms ? `${node.duration_ms} ms` : "ready"}</i>
    </button>
  );
}

function WorkflowInspector({ node, graph, onClose }) {
  if (!node) return null;
  const outputEntries = Object.entries(node.output || {});
  const placeLeft = node.x > graph.width - 520;
  const left = placeLeft ? Math.max(20, node.x - 292) : node.x + 188;
  const top = Math.min(Math.max(20, node.y - 12), graph.height - 310);
  return (
    <aside className="workflow-inspector" style={{ left, top }}>
      <div className="inspector-head">
        <span className={`inspector-status ${statusClass(node.status)}`} />
        <div>
          <strong>{node.label}</strong>
          <small>{node.type} / {node.status}</small>
        </div>
        <button type="button" className="inspector-close" onClick={onClose} aria-label="Close workflow inspector">
          <X size={14} />
        </button>
      </div>
      <p>{workflowInspectorCopy(node)}</p>
      <div className="inspector-metrics">
        <span>Duration <strong>{node.duration_ms || 0} ms</strong></span>
        <span>Node ID <strong>{node.id}</strong></span>
      </div>
      <div className="inspector-output">
        <strong>Runtime output</strong>
        {outputEntries.length ? outputEntries.slice(0, 3).map(([key, value]) => (
          <div key={key}>
            <span>{formatLabel(key)}</span>
            <code>{formatOutputValue(value)}</code>
          </div>
        )) : <small>No output payload for this step.</small>}
      </div>
    </aside>
  );
}

function workflowInspectorCopy(node) {
  const copy = {
    upload: "The ingestion gateway receives the file, validates its filename/type, stores it, and starts the document intelligence run.",
    parser: "The router decides which extraction path to use based on extension, content type, OCR requirements, and metadata.",
    ocr: "The OCR agent runs only for image-like documents, converting visual text into machine-readable content.",
    extract: "The extraction tool produces raw text that downstream AI agents can classify, chunk, summarize, and scan.",
    metadata: "The metadata agent normalizes page count, file size, extension, and OCR status for analytics and audit trails.",
    chunker: "The semantic chunker splits content into citation-aware evidence units for RAG retrieval.",
    embedder: "The embedding generator creates vector IDs for searchable chunks so questions can retrieve relevant evidence.",
    indexer: "The vector indexer stores searchable chunks for document Q&A and semantic discovery.",
    classifier: "The classifier agent predicts the document type and confidence used for processor routing.",
    processor: "The selected prebuilt processor extracts structured fields with confidence scores and review status.",
    pii: "The PII agent detects sensitive data patterns such as emails, phone numbers, IDs, and bank-like numbers.",
    risk: "The risk agent combines policy, PII, compliance, and extraction signals into severity and action recommendations.",
    summary: "The summarizer agent creates the executive summary, key points, tags, and suggested actions.",
    rag: "The RAG runtime answers user questions using indexed chunks and citations instead of guessing.",
    review: "The human review gate tracks whether structured extraction needs manual approval.",
    export: "The export node prepares a structured JSON payload for external systems and automation.",
  };
  return copy[node.id] || node.detail;
}

function formatLabel(value) {
  return value.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function formatOutputValue(value) {
  if (Array.isArray(value)) return value.join(", ");
  if (typeof value === "object" && value !== null) return JSON.stringify(value);
  return String(value);
}

function buildWorkflowGraph(workflow) {
  const positions = {
    upload: [60, 142],
    parser: [245, 142],
    ocr: [245, 320],
    extract: [445, 142],
    metadata: [445, 320],
    chunker: [650, 90],
    embedder: [650, 255],
    indexer: [650, 420],
    classifier: [870, 90],
    processor: [870, 255],
    pii: [870, 420],
    risk: [1090, 170],
    summary: [1090, 345],
    rag: [1310, 120],
    review: [1310, 305],
    export: [1510, 305],
  };
  const nodeSize = { width: 166, height: 92 };
  const nodeMap = Object.fromEntries(workflow.nodes.map((node) => [node.id, node]));
  const graphNodes = workflow.nodes.map((node) => {
    const [x, y] = positions[node.id] || [60, 60];
    return { ...node, x, y, ...nodeSize, featured: ["processor", "rag", "risk"].includes(node.id) };
  });
  const positionMap = Object.fromEntries(graphNodes.map((node) => [node.id, node]));
  const graphEdges = workflow.edges.map((edge) => {
    const source = positionMap[edge.source];
    const target = positionMap[edge.target];
    const startX = source.x + source.width;
    const startY = source.y + source.height / 2;
    const endX = target.x;
    const endY = target.y + target.height / 2;
    const bend = Math.max(70, Math.abs(endX - startX) * 0.45);
    const kind = nodeMap[edge.target]?.type || "default";
    return {
      ...edge,
      kind,
      path: `M ${startX} ${startY} C ${startX + bend} ${startY}, ${endX - bend} ${endY}, ${endX} ${endY}`,
    };
  });
  return { nodes: graphNodes, edges: graphEdges, width: 1720, height: 620 };
}

function workflowIcon(type, id) {
  if (id === "rag") return MessageSquareText;
  if (id === "risk") return ShieldAlert;
  if (id === "processor") return Bot;
  if (id === "embedder") return Brain;
  if (id === "indexer") return Database;
  if (id === "export") return Download;
  if (type === "agent") return Sparkles;
  if (type === "router") return Workflow;
  if (type === "tool") return Cpu;
  if (type === "model") return Brain;
  if (type === "store") return Database;
  if (type === "human") return Eye;
  if (type === "output") return Download;
  return FileText;
}

function DocumentQueryAnalytics({ document, answer }) {
  const queries = document.queries || [];
  const queryData = buildDocumentQueryData(document, answer);
  const successful = queries.filter((query) => !query.answer?.toLowerCase().includes("could not find strong evidence")).length;
  const noEvidence = Math.max(0, queries.length - successful);
  const latestSources = answer?.sources || [];
  const avgRelevance = latestSources.length
    ? Math.round((latestSources.reduce((sum, source) => sum + Number(source.score || 0), 0) / latestSources.length) * 100)
    : 0;

  return (
    <section className="panel summary-panel document-analytics-panel">
      <PanelHeading icon={<Activity />} title="Document query analytics" meta="selected document only" />
      <div className="doc-analytics-grid">
        <Metric icon={<MessageSquareText />} label="Queries on this doc" value={queries.length} detail="This document's history" />
        <Metric icon={<CheckCircle2 />} label="Grounded answers" value={successful} detail="Evidence-backed responses" />
        <Metric icon={<AlertTriangle />} label="No-evidence replies" value={noEvidence} tone="warning" detail="Needs better source match" />
        <Metric icon={<Database />} label="Indexed chunks" value={document.chunks?.length || 0} detail="Searchable evidence units" />
        <Metric icon={<Eye />} label="Latest citations" value={latestSources.length} detail="Sources in current answer" />
        <Metric icon={<Cpu />} label="Avg relevance" value={`${avgRelevance}%`} detail="Latest answer source score" />
      </div>
      <div className="document-query-body">
        <div className="chart-shell">
          <ResponsiveContainer width="100%" height={220}>
            <AreaChart data={queryData}>
              <defs>
                <linearGradient id="documentQueryGlow" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#22d3ee" stopOpacity={0.5} />
                  <stop offset="95%" stopColor="#a78bfa" stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <CartesianGrid stroke="rgba(148, 163, 184, 0.14)" vertical={false} />
              <XAxis dataKey="name" stroke="#94a3b8" tickLine={false} axisLine={false} />
              <YAxis stroke="#94a3b8" tickLine={false} axisLine={false} />
              <Tooltip contentStyle={tooltipStyle} />
              <Area type="monotone" dataKey="value" stroke="#22d3ee" fill="url(#documentQueryGlow)" strokeWidth={3} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
        <div className="query-history">
          <strong>Recent document questions</strong>
          {queries.length ? queries.slice(-5).reverse().map((query) => (
            <article key={`${query.created_at}-${query.question}`}>
              <span>{query.question}</span>
              <small>{new Date(query.created_at).toLocaleString()}</small>
            </article>
          )) : (
            <EmptyState title="No questions yet" text="Ask this document a question to populate per-document RAG analytics." />
          )}
        </div>
      </div>
    </section>
  );
}

function statusClass(status) {
  return status.toLowerCase().replaceAll(" ", "-");
}

async function fetchDocument(id, setActiveDocument, setError) {
  try {
    const document = await getDocument(id);
    setActiveDocument(document);
    setError("");
  } catch (err) {
    setError(err.message);
  }
}

function registerServiceWorker() {
  if (!("serviceWorker" in navigator)) return;
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch(() => {
      // The app still works in browser mode if service worker registration is unavailable.
    });
  });
}

function SearchResults({ results, onOpen }) {
  return (
    <section className="panel search-results">
      {results.map((result) => (
        <button key={result.id} onClick={() => onOpen(result.id)}>
          <Search size={16} />
          <span>{result.filename}</span>
          <small>{result.document_type}</small>
          <ChevronRight size={16} />
        </button>
      ))}
    </section>
  );
}

function DocumentThumb({ type }) {
  const Icon = type === "Resume" ? Radar : type === "Contract" ? ShieldCheck : type === "Invoice" ? Database : FileText;
  return (
    <span className="doc-thumb">
      <Icon size={18} />
    </span>
  );
}

function Metric({ icon, label, value, tone = "default", detail = "Live metric" }) {
  return (
    <motion.div className={`metric ${tone}`} variants={cardMotion} whileHover={{ y: -4, scale: 1.01 }}>
      {React.cloneElement(icon, { size: 22 })}
      <span>{value}</span>
      <small>{label}</small>
      <p>{detail}</p>
    </motion.div>
  );
}

function PanelHeading({ icon, title, meta }) {
  return (
    <div className="panel-title">
      <div>{React.cloneElement(icon, { size: 19 })}<h3>{title}</h3></div>
      {meta && <span>{meta}</span>}
    </div>
  );
}

function toChartData(data) {
  return Object.entries(data || {}).map(([name, value]) => ({ name, value }));
}

function buildUsageData(metrics) {
  const base = [
    metrics.indexed_documents,
    metrics.processing_analytics.chunks_indexed,
    metrics.pii_alerts,
    metrics.high_risk_documents,
    metrics.needs_review,
    metrics.ai_queries,
  ];
  return ["Docs", "Chunks", "PII", "Risk", "Review", "RAG"].map((name, index) => ({
    name,
    value: base[index] || 0,
  }));
}

function buildDocumentQueryData(document, answer) {
  const queries = document.queries || [];
  const successful = queries.filter((query) => !query.answer?.toLowerCase().includes("could not find strong evidence")).length;
  const noEvidence = Math.max(0, queries.length - successful);
  return [
    { name: "Queries", value: queries.length },
    { name: "Grounded", value: successful },
    { name: "No evidence", value: noEvidence },
    { name: "Chunks", value: document.chunks?.length || 0 },
    { name: "Citations", value: answer?.sources?.length || 0 },
  ];
}

function DistributionChart({ data }) {
  const entries = Object.entries(data || {});
  if (!entries.length) return <EmptyState title="No data" text="This chart will populate from indexed documents." />;
  const max = Math.max(...entries.map(([, value]) => value), 1);
  return (
    <div className="distribution">
      {entries.map(([label, value]) => (
        <div key={label}>
          <span>{label}</span>
          <div><i style={{ width: `${Math.max(8, (value / max) * 100)}%` }} /></div>
          <small>{value}</small>
        </div>
      ))}
    </div>
  );
}

function MiniBars({ values, labels }) {
  const max = Math.max(...values, 1);
  return <div className="mini-bars">{values.map((value, index) => <div key={labels[index]}><i style={{ height: `${Math.max(12, (value / max) * 100)}%` }} /><span>{labels[index]}</span></div>)}</div>;
}

function StructuredEntities({ analysis }) {
  const fields = Object.fromEntries(
    (analysis.structured_extraction?.fields || []).map((field) => [field.name, field.value])
  );
  const groups = analysis.document_type === "Resume"
    ? [
        { title: "Candidate", items: [fields.candidate_name, fields.location].filter(Boolean) },
        { title: "Contact", items: [fields.email, fields.phone, fields.linkedin_or_github].filter(Boolean) },
        { title: "Education", items: splitField(fields.education) },
        { title: "Skills", items: splitField(fields.skills) },
        { title: "Projects", items: splitField(fields.projects, ";") },
        { title: "Certifications", items: splitField(fields.certifications, ";") },
        { title: "Experience", items: splitField(fields.experience, ";") },
        { title: "AI topics", items: analysis.topics },
      ]
    : [
        { title: "Topics", items: analysis.topics },
        { title: "Dates", items: analysis.entities.dates },
        { title: "Amounts", items: analysis.entities.amounts },
        { title: "Organizations", items: analysis.entities.organizations },
      ];

  return (
    <div className="entity-board">
      {groups.map((group) => (
        <InfoGroup key={group.title} title={group.title} items={group.items} />
      ))}
    </div>
  );
}

function splitField(value, separator = ",") {
  if (!value) return [];
  return value
    .split(separator)
    .map((item) => item.trim())
    .filter(Boolean);
}

function InfoGroup({ title, items }) {
  return (
    <div className="info-group">
      <strong>{title}</strong>
      {items?.length ? <div className="tag-row">{items.map((item) => <span key={item}>{item}</span>)}</div> : <p className="muted">No signals detected.</p>}
    </div>
  );
}

function EmptyState({ title, text }) {
  return <div className="empty-state"><LockKeyhole size={18} /><strong>{title}</strong><p>{text}</p></div>;
}

function SkeletonDashboard() {
  return <div className="dashboard">{Array.from({ length: 6 }).map((_, index) => <div className="metric skeleton" key={index} />)}</div>;
}

createRoot(document.getElementById("root")).render(<App />);
