import React, { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import * as DocumentPicker from "expo-document-picker";
import { StatusBar as ExpoStatusBar } from "expo-status-bar";
import { Ionicons } from "@expo/vector-icons";

const LAPTOP_API_BASE = "http://192.168.1.3:8010/api";
const DEFAULT_API_BASE = Platform.select({
  android: LAPTOP_API_BASE,
  ios: LAPTOP_API_BASE,
  default: LAPTOP_API_BASE,
});

export default function App() {
  const [apiBase, setApiBase] = useState(DEFAULT_API_BASE);
  const [metrics, setMetrics] = useState(null);
  const [documents, setDocuments] = useState([]);
  const [activeDocument, setActiveDocument] = useState(null);
  const [answer, setAnswer] = useState(null);
  const [question, setQuestion] = useState("");
  const [loading, setLoading] = useState("workspace");
  const [refreshing, setRefreshing] = useState(false);
  const [screen, setScreen] = useState("home");
  const [showConnection, setShowConnection] = useState(true);
  const [connectionStatus, setConnectionStatus] = useState("Checking backend connection...");

  useEffect(() => {
    refreshWorkspace();
  }, [apiBase]);

  const activeAnalysis = activeDocument?.analysis;
  const queryStats = useMemo(() => buildQueryStats(activeDocument, answer), [activeDocument, answer]);

  async function request(path, options) {
    const response = await fetch(`${apiBase}${path}`, options);
    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.detail || "Request failed.");
    }
    return data;
  }

  async function refreshWorkspace() {
    setLoading((value) => value || "workspace");
    try {
      const [docData, metricData] = await Promise.all([
        request("/documents"),
        request("/documents/metrics"),
      ]);
      setDocuments(docData.documents || []);
      setMetrics(metricData);
      setConnectionStatus("Connected to DocuMind backend");
      setShowConnection(false);
      if (activeDocument) {
        const fresh = await request(`/documents/${activeDocument.id}`);
        setActiveDocument(fresh);
      }
    } catch (error) {
      setConnectionStatus(`Could not connect: ${error.message}`);
      setShowConnection(true);
      Alert.alert("DocuMind connection", `${error.message}\n\nFor a real phone, replace 127.0.0.1 or 10.0.2.2 with your laptop IP address.`);
    } finally {
      setLoading("");
      setRefreshing(false);
    }
  }

  async function openDocument(documentId) {
    setLoading("document");
    setAnswer(null);
    try {
      const document = await request(`/documents/${documentId}`);
      setActiveDocument(document);
      setScreen("document");
    } catch (error) {
      Alert.alert("Could not open document", error.message);
    } finally {
      setLoading("");
    }
  }

  async function uploadDocument() {
    try {
      const picked = await DocumentPicker.getDocumentAsync({
        type: ["application/pdf", "text/plain", "application/vnd.openxmlformats-officedocument.wordprocessingml.document", "image/*"],
        copyToCacheDirectory: true,
      });
      if (picked.canceled) return;
      const file = picked.assets[0];
      const form = new FormData();
      form.append("file", {
        uri: file.uri,
        name: file.name,
        type: file.mimeType || "application/octet-stream",
      });
      setLoading("upload");
      const uploaded = await request("/documents/upload", {
        method: "POST",
        body: form,
        headers: { Accept: "application/json" },
      });
      setActiveDocument(uploaded);
      setScreen("document");
      await refreshWorkspace();
    } catch (error) {
      Alert.alert("Upload failed", error.message);
    } finally {
      setLoading("");
    }
  }

  async function askQuestion() {
    if (!activeDocument || !question.trim()) return;
    setLoading("ask");
    try {
      const response = await request(`/documents/${activeDocument.id}/ask`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: question.trim() }),
      });
      setAnswer(response);
      setQuestion("");
      const fresh = await request(`/documents/${activeDocument.id}`);
      setActiveDocument(fresh);
    } catch (error) {
      Alert.alert("RAG assistant", error.message);
    } finally {
      setLoading("");
    }
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <ExpoStatusBar style="light" />
      <StatusBar barStyle="light-content" />
      <KeyboardAvoidingView style={styles.keyboard} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <View style={styles.header}>
          <View style={styles.brandMark}>
            <Ionicons name="sparkles" size={22} color="#ecfeff" />
          </View>
          <View style={styles.headerCopy}>
            <Text style={styles.kicker}>{screen === "document" ? activeDocument?.analysis?.document_type || "Document" : "Enterprise AI Workspace"}</Text>
            <Text style={styles.title} numberOfLines={1}>{screen === "document" ? activeDocument?.filename || "Document" : "DocuMind AI"}</Text>
          </View>
          <Pressable style={styles.iconButton} onPress={uploadDocument}>
            {loading === "upload" ? <ActivityIndicator color="#ecfeff" /> : <Ionicons name="cloud-upload-outline" size={22} color="#ecfeff" />}
          </Pressable>
        </View>

        <ScrollView
          contentContainerStyle={styles.content}
          refreshControl={<RefreshControl tintColor="#22d3ee" refreshing={refreshing} onRefresh={() => { setRefreshing(true); refreshWorkspace(); }} />}
        >
          {showConnection && (
            <View style={styles.apiCard}>
              <Text style={styles.label}>API endpoint</Text>
              <TextInput value={apiBase} onChangeText={setApiBase} style={styles.apiInput} autoCapitalize="none" autoCorrect={false} />
              <Text style={styles.connectionStatus}>{connectionStatus}</Text>
              <Text style={styles.help}>Real phone: use your laptop IP, for example http://192.168.1.3:8010/api.</Text>
              <Pressable style={styles.connectionButton} onPress={refreshWorkspace}>
                <Ionicons name="refresh" size={16} color="#08111f" />
                <Text style={styles.connectionButtonText}>Test connection</Text>
              </Pressable>
            </View>
          )}

          {screen === "home" && (
            <HomeScreen
              metrics={metrics}
              documents={documents}
              onOpenDocument={openDocument}
              onUpload={uploadDocument}
              onToggleConnection={() => setShowConnection((value) => !value)}
            />
          )}

          {screen === "documents" && (
            <DocumentsScreen documents={documents} activeDocument={activeDocument} onOpenDocument={openDocument} onUpload={uploadDocument} loading={loading} />
          )}

          {screen === "document" && activeDocument && activeAnalysis && (
            <DocumentScreen
              document={activeDocument}
              analysis={activeAnalysis}
              queryStats={queryStats}
              answer={answer}
              question={question}
              loading={loading}
              onQuestionChange={setQuestion}
              onAsk={askQuestion}
              onBack={() => setScreen("documents")}
            />
          )}
        </ScrollView>

        <View style={styles.tabBar}>
          <TabButton active={screen === "home"} icon="grid-outline" label="Home" onPress={() => setScreen("home")} />
          <TabButton active={screen === "documents"} icon="folder-open-outline" label="Docs" onPress={() => setScreen("documents")} />
          <TabButton active={screen === "document"} icon="sparkles-outline" label="Insight" onPress={() => activeDocument ? setScreen("document") : setScreen("documents")} />
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function HomeScreen({ metrics, documents, onOpenDocument, onUpload, onToggleConnection }) {
  const recentDocuments = documents.slice(0, 3);
  return (
    <>
      <View style={styles.heroCard}>
        <Text style={styles.kicker}>AI operations</Text>
        <Text style={styles.heroTitle}>Document intelligence in your pocket.</Text>
        <Text style={styles.heroText}>Upload, analyze, risk-check, and ask grounded questions from a native mobile workspace.</Text>
        <View style={styles.heroActions}>
          <Pressable style={styles.primaryAction} onPress={onUpload}>
            <Ionicons name="cloud-upload-outline" size={18} color="#08111f" />
            <Text style={styles.primaryActionText}>Upload</Text>
          </Pressable>
          <Pressable style={styles.secondaryAction} onPress={onToggleConnection}>
            <Ionicons name="wifi-outline" size={18} color="#dbeafe" />
            <Text style={styles.secondaryActionText}>API</Text>
          </Pressable>
        </View>
      </View>

      <View style={styles.metricsGrid}>
        <Metric icon="document-text-outline" label="Documents" value={metrics?.total_documents ?? 0} />
        <Metric icon="cube-outline" label="Indexed" value={metrics?.indexed_documents ?? 0} />
        <Metric icon="chatbubble-ellipses-outline" label="Queries" value={metrics?.ai_queries ?? 0} />
        <Metric icon="finger-print-outline" label="PII alerts" value={metrics?.pii_alerts ?? 0} tone="warning" />
      </View>

      <SectionTitle title="Recent documents" meta={`${documents.length} total`} />
      {recentDocuments.length ? recentDocuments.map((item) => (
        <DocumentCard key={item.id} item={item} onPress={() => onOpenDocument(item.id)} />
      )) : (
        <EmptyPanel title="No documents yet" text="Upload a PDF, DOCX, TXT, or image to start the intelligence pipeline." />
      )}
    </>
  );
}

function DocumentsScreen({ documents, activeDocument, onOpenDocument, onUpload, loading }) {
  return (
    <>
      <Pressable style={styles.uploadPanel} onPress={onUpload}>
        {loading === "upload" ? <ActivityIndicator color="#22d3ee" /> : <Ionicons name="cloud-upload-outline" size={24} color="#22d3ee" />}
        <View style={styles.documentCopy}>
          <Text style={styles.documentTitle}>Upload document</Text>
          <Text style={styles.muted}>PDF, DOCX, TXT, PNG, JPG, WEBP</Text>
        </View>
      </Pressable>
      <SectionTitle title="All documents" meta={`${documents.length} files`} />
      {documents.map((item) => (
        <DocumentCard key={item.id} item={item} active={activeDocument?.id === item.id} onPress={() => onOpenDocument(item.id)} />
      ))}
    </>
  );
}

function DocumentScreen({ document, analysis, queryStats, answer, question, loading, onQuestionChange, onAsk, onBack }) {
  return (
    <>
      <Pressable style={styles.backButton} onPress={onBack}>
        <Ionicons name="chevron-back" size={18} color="#dbeafe" />
        <Text style={styles.secondaryActionText}>Back to documents</Text>
      </Pressable>

      <View style={styles.documentHero}>
        <View style={styles.documentIconLarge}>
          <Ionicons name={documentIcon(analysis.document_type)} size={30} color="#ecfeff" />
        </View>
        <View style={styles.documentCopy}>
          <Text style={styles.documentHeroTitle} numberOfLines={2}>{document.filename}</Text>
          <View style={styles.pills}>
            <Pill text={analysis.document_type} />
            <Pill text={`${analysis.risk_severity} risk`} tone={analysis.risk_score >= 50 ? "danger" : "default"} />
            <Pill text={`${Math.round(analysis.classification_confidence * 100)}% confidence`} />
          </View>
        </View>
      </View>

      <SectionTitle title="AI insights" meta="summary" />
      <View style={styles.panel}>
        <Text style={styles.summary}>{analysis.summary}</Text>
        <View style={styles.keyPointBox}>
          <Text style={styles.answerTitle}>Key points</Text>
          {(analysis.key_points || []).slice(0, 3).map((point) => <Text key={point} style={styles.bullet}>• {point}</Text>)}
        </View>
        <View style={styles.pills}>{analysis.tags?.slice(0, 6).map((tag) => <Pill key={tag} text={tag} />)}</View>
      </View>

      <SectionTitle title="Query analytics" meta="this document" />
      <View style={styles.metricsGrid}>
        <Metric icon="analytics-outline" label="Queries" value={queryStats.total} />
        <Metric icon="checkmark-circle-outline" label="Grounded" value={queryStats.grounded} />
        <Metric icon="alert-circle-outline" label="No evidence" value={queryStats.noEvidence} tone="warning" />
        <Metric icon="git-branch-outline" label="Citations" value={queryStats.citations} />
      </View>

      <SectionTitle title="Risk and PII" meta={`${analysis.risk_score}/100`} />
      <View style={styles.panel}>
        {(analysis.compliance_flags?.length || analysis.sensitive_information?.length) ? (
          <>
            {analysis.compliance_flags?.map((flag) => <RiskRow key={flag.title} title={flag.title} detail={`${flag.severity} / ${flag.detail}`} />)}
            {analysis.sensitive_information?.map((item) => <RiskRow key={item.type} title={item.type} detail={`${item.count} detection(s)`} />)}
          </>
        ) : (
          <Text style={styles.muted}>No risk or sensitive information signals were detected.</Text>
        )}
      </View>

      <SectionTitle title="Enterprise RAG" meta="citation grounded" />
      <View style={styles.panel}>
        <View style={styles.askRow}>
          <TextInput value={question} onChangeText={onQuestionChange} placeholder="Ask this document..." placeholderTextColor="#64748b" style={styles.askInput} />
          <Pressable style={styles.askButton} onPress={onAsk} disabled={loading === "ask"}>
            {loading === "ask" ? <ActivityIndicator color="#08111f" /> : <Ionicons name="send" size={18} color="#08111f" />}
          </Pressable>
        </View>
        {answer && (
          <View style={styles.answerBox}>
            <Text style={styles.answerTitle}>Answer</Text>
            <Text style={styles.summary}>{answer.answer}</Text>
            {answer.sources?.slice(0, 3).map((source) => (
              <Text key={`${source.chunk_id}-${source.citation}`} style={styles.citation}>{source.citation} / relevance {source.score}</Text>
            ))}
          </View>
        )}
      </View>
    </>
  );
}

function DocumentCard({ item, active, onPress }) {
  return (
    <Pressable style={[styles.documentCard, active && styles.activeDocument]} onPress={onPress}>
      <View style={styles.documentIcon}>
        <Ionicons name={documentIcon(item.document_type)} size={22} color="#ecfeff" />
      </View>
      <View style={styles.documentCopy}>
        <Text style={styles.documentTitle} numberOfLines={2}>{item.filename}</Text>
        <Text style={styles.muted}>{item.document_type} / {item.review_status} / Risk {item.risk_score}</Text>
        <View style={styles.pills}>
          <Pill text={`${item.chunk_count} chunks`} />
          <Pill text={`${item.query_count} queries`} />
          <Pill text={`Q ${item.quality_score}`} />
        </View>
      </View>
    </Pressable>
  );
}

function TabButton({ active, icon, label, onPress }) {
  return (
    <Pressable style={[styles.tabButton, active && styles.tabButtonActive]} onPress={onPress}>
      <Ionicons name={icon} size={20} color={active ? "#22d3ee" : "#94a3b8"} />
      <Text style={[styles.tabText, active && styles.tabTextActive]}>{label}</Text>
    </Pressable>
  );
}

function Metric({ icon, label, value, tone }) {
  return (
    <View style={[styles.metric, tone === "warning" && styles.metricWarning]}>
      <Ionicons name={icon} size={20} color={tone === "warning" ? "#fbbf24" : "#22d3ee"} />
      <Text style={styles.metricValue}>{value}</Text>
      <Text style={styles.muted}>{label}</Text>
    </View>
  );
}

function SectionTitle({ title, meta }) {
  return (
    <View style={styles.sectionTitle}>
      <Text style={styles.sectionHeading}>{title}</Text>
      <Text style={styles.sectionMeta}>{meta}</Text>
    </View>
  );
}

function Pill({ text, tone }) {
  return <Text style={[styles.pill, tone === "danger" && styles.pillDanger]}>{text}</Text>;
}

function RiskRow({ title, detail }) {
  return (
    <View style={styles.riskRow}>
      <Text style={styles.documentTitle}>{title}</Text>
      <Text style={styles.muted}>{detail}</Text>
    </View>
  );
}

function EmptyPanel({ title, text }) {
  return (
    <View style={styles.panel}>
      <Ionicons name="file-tray-outline" size={22} color="#22d3ee" />
      <Text style={styles.documentTitle}>{title}</Text>
      <Text style={styles.muted}>{text}</Text>
    </View>
  );
}

function buildQueryStats(document, answer) {
  const queries = document?.queries || [];
  const grounded = queries.filter((query) => !query.answer?.toLowerCase().includes("could not find strong evidence")).length;
  return {
    total: queries.length,
    grounded,
    noEvidence: Math.max(0, queries.length - grounded),
    citations: answer?.sources?.length || 0,
  };
}

function documentIcon(type) {
  if (type === "Resume") return "person-circle-outline";
  if (type === "Contract") return "shield-checkmark-outline";
  if (type === "Invoice") return "receipt-outline";
  if (type === "Policy") return "lock-closed-outline";
  return "document-outline";
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: "#08090f" },
  keyboard: { flex: 1 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(190,205,255,0.12)",
    backgroundColor: "rgba(8,9,15,0.96)",
  },
  brandMark: {
    width: 44,
    height: 44,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#1d4ed8",
  },
  headerCopy: { flex: 1, minWidth: 0 },
  kicker: { color: "#22d3ee", fontSize: 11, fontWeight: "800", textTransform: "uppercase" },
  title: { color: "#eef2ff", fontSize: 22, fontWeight: "900" },
  iconButton: {
    width: 44,
    height: 44,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.08)",
    borderWidth: 1,
    borderColor: "rgba(190,205,255,0.14)",
  },
  content: { padding: 14, paddingBottom: 112, gap: 14 },
  heroCard: {
    borderWidth: 1,
    borderColor: "rgba(125,211,252,0.20)",
    backgroundColor: "rgba(17,19,31,0.92)",
    borderRadius: 18,
    padding: 18,
    gap: 12,
  },
  heroTitle: { color: "#eef2ff", fontSize: 28, lineHeight: 31, fontWeight: "900" },
  heroText: { color: "#cbd5e1", fontSize: 14, lineHeight: 21 },
  heroActions: { flexDirection: "row", gap: 10, marginTop: 2 },
  primaryAction: {
    flex: 1,
    minHeight: 46,
    borderRadius: 13,
    backgroundColor: "#22d3ee",
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 8,
  },
  primaryActionText: { color: "#08111f", fontWeight: "900" },
  secondaryAction: {
    minHeight: 46,
    minWidth: 86,
    borderRadius: 13,
    backgroundColor: "rgba(255,255,255,0.08)",
    borderWidth: 1,
    borderColor: "rgba(190,205,255,0.14)",
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 8,
  },
  secondaryActionText: { color: "#dbeafe", fontWeight: "800", fontSize: 13 },
  apiCard: {
    borderWidth: 1,
    borderColor: "rgba(190,205,255,0.14)",
    backgroundColor: "rgba(17,19,31,0.86)",
    borderRadius: 14,
    padding: 14,
    gap: 8,
  },
  label: { color: "#22d3ee", fontWeight: "800", fontSize: 12 },
  apiInput: {
    minHeight: 42,
    borderRadius: 10,
    paddingHorizontal: 12,
    color: "#eef2ff",
    backgroundColor: "rgba(255,255,255,0.07)",
  },
  help: { color: "#94a3b8", fontSize: 12, lineHeight: 18 },
  connectionStatus: { color: "#dbeafe", fontSize: 12, lineHeight: 18, fontWeight: "800" },
  connectionButton: {
    minHeight: 40,
    borderRadius: 11,
    backgroundColor: "#22d3ee",
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 8,
  },
  connectionButtonText: { color: "#08111f", fontWeight: "900", fontSize: 13 },
  metricsGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  metric: {
    flexGrow: 1,
    flexBasis: "47%",
    minWidth: 148,
    minHeight: 102,
    borderRadius: 14,
    padding: 13,
    gap: 7,
    backgroundColor: "rgba(17,19,31,0.86)",
    borderWidth: 1,
    borderColor: "rgba(190,205,255,0.14)",
  },
  metricWarning: { borderColor: "rgba(251,191,36,0.34)" },
  metricValue: { color: "#eef2ff", fontSize: 25, fontWeight: "900" },
  muted: { color: "#9aa7bd", fontSize: 12, lineHeight: 18 },
  sectionTitle: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: 6, gap: 12 },
  sectionHeading: { color: "#eef2ff", fontSize: 18, fontWeight: "900" },
  sectionMeta: { color: "#94a3b8", fontSize: 12, flexShrink: 1 },
  documentCard: {
    flexDirection: "row",
    gap: 12,
    padding: 14,
    marginBottom: 10,
    borderRadius: 14,
    backgroundColor: "rgba(17,19,31,0.86)",
    borderWidth: 1,
    borderColor: "rgba(190,205,255,0.14)",
  },
  activeDocument: { borderColor: "rgba(34,211,238,0.64)" },
  uploadPanel: {
    flexDirection: "row",
    gap: 12,
    padding: 16,
    borderRadius: 16,
    backgroundColor: "rgba(34,211,238,0.08)",
    borderWidth: 1,
    borderColor: "rgba(34,211,238,0.28)",
    alignItems: "center",
  },
  documentIcon: {
    width: 42,
    height: 48,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(34,211,238,0.18)",
  },
  documentCopy: { flex: 1, gap: 6, minWidth: 0 },
  documentTitle: { color: "#eef2ff", fontWeight: "800", fontSize: 14, lineHeight: 19 },
  backButton: {
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingVertical: 8,
    paddingRight: 10,
  },
  documentHero: {
    flexDirection: "row",
    gap: 14,
    borderRadius: 18,
    padding: 16,
    backgroundColor: "rgba(17,19,31,0.92)",
    borderWidth: 1,
    borderColor: "rgba(125,211,252,0.20)",
  },
  documentIconLarge: {
    width: 58,
    height: 64,
    borderRadius: 15,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(34,211,238,0.18)",
  },
  documentHeroTitle: { color: "#eef2ff", fontWeight: "900", fontSize: 19, lineHeight: 24 },
  pills: { flexDirection: "row", flexWrap: "wrap", gap: 7 },
  pill: {
    color: "#a5f3fc",
    backgroundColor: "rgba(34,211,238,0.11)",
    borderColor: "rgba(125,211,252,0.18)",
    borderWidth: 1,
    borderRadius: 999,
    paddingVertical: 5,
    paddingHorizontal: 9,
    fontSize: 11,
    fontWeight: "800",
  },
  pillDanger: { color: "#fecdd3", backgroundColor: "rgba(251,113,133,0.12)", borderColor: "rgba(251,113,133,0.28)" },
  panel: {
    borderRadius: 14,
    padding: 14,
    gap: 12,
    backgroundColor: "rgba(17,19,31,0.86)",
    borderWidth: 1,
    borderColor: "rgba(190,205,255,0.14)",
  },
  row: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  summary: { color: "#dbeafe", lineHeight: 22 },
  keyPointBox: {
    borderTopWidth: 1,
    borderTopColor: "rgba(190,205,255,0.12)",
    paddingTop: 12,
    gap: 8,
  },
  bullet: { color: "#cbd5e1", lineHeight: 20, fontSize: 13 },
  riskRow: { borderTopWidth: 1, borderTopColor: "rgba(190,205,255,0.12)", paddingTop: 10, gap: 4 },
  askRow: { flexDirection: "row", gap: 10 },
  askInput: {
    flex: 1,
    minHeight: 46,
    borderRadius: 12,
    paddingHorizontal: 12,
    color: "#eef2ff",
    backgroundColor: "rgba(255,255,255,0.07)",
  },
  askButton: {
    width: 48,
    height: 46,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#22d3ee",
  },
  answerBox: { gap: 8, borderTopWidth: 1, borderTopColor: "rgba(190,205,255,0.12)", paddingTop: 12 },
  answerTitle: { color: "#eef2ff", fontWeight: "900" },
  citation: { color: "#22d3ee", fontSize: 12, fontWeight: "800" },
  tabBar: {
    position: "absolute",
    left: 14,
    right: 14,
    bottom: Platform.OS === "ios" ? 14 : 10,
    minHeight: 64,
    borderRadius: 18,
    backgroundColor: "rgba(15,23,42,0.96)",
    borderWidth: 1,
    borderColor: "rgba(190,205,255,0.16)",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-around",
    paddingHorizontal: 8,
  },
  tabButton: {
    flex: 1,
    minHeight: 48,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    gap: 3,
  },
  tabButtonActive: { backgroundColor: "rgba(34,211,238,0.10)" },
  tabText: { color: "#94a3b8", fontSize: 11, fontWeight: "800" },
  tabTextActive: { color: "#22d3ee" },
});
