/**
 * App.tsx — root assembly.
 *
 * Owns global state (config, bundle, chat, doc) and wires mock async
 * fetches that target a theoretical FastAPI/Flask backend:
 *
 *     POST /api/v1/rag/initialize    → RagBundle
 *     POST /api/v1/docs/generate     → DocArtifact
 *     POST /api/v1/chat              → ChatMessage
 *
 * Swap the mock implementations for real `fetch(...)` calls when the
 * Python service is ready.
 */

import { useCallback, useState } from "react";
import { Sidebar } from "./components/Sidebar";
import { MainDashboard } from "./components/MainDashboard";
import type {
  AppConfig,
  ChatMessage,
  DocArtifact,
  DocKind,
  RagBundle,
  TabKey,
  UploadStatus,
} from "./types";
import { DEFAULT_CONFIG } from "./types";

/* -------------------------------------------------------------------- */
/* Mock async network — replace with real fetch() when API is ready.   */
/* -------------------------------------------------------------------- */

async function mockFetchInitialize(
  file: File,
  config: AppConfig,
  onProgress: (p: number) => void,
): Promise<RagBundle> {
  // Simulate upload progress
  for (let i = 1; i <= 5; i++) {
    await new Promise((r) => setTimeout(r, 120));
    onProgress(i / 10);
  }

  // Pretend to talk to backend:
  // const res = await fetch("/api/v1/rag/initialize", {
  //   method: "POST",
  //   body: formData,
  //   headers: { "X-Config": JSON.stringify(config) },
  // });
  // return await res.json();

  for (let i = 6; i <= 10; i++) {
    await new Promise((r) => setTimeout(r, 150));
    onProgress(i / 10);
  }

  // Derive some realistic-looking numbers from file size.
  const baseSize = Math.max(1, Math.round(file.size / 12_000));
  const fileCount = 24 + baseSize;
  const chunkCount = Math.round(fileCount * 2.3);

  // Build a small fake directory tree.
  const tree = [
    `${file.name.replace(/\.zip$/i, "")}/`,
    "├── README.md",
    "├── package.json",
    "├── src/",
    "│   ├── index.ts",
    "│   ├── api/",
    "│   │   ├── routes.ts",
    "│   │   └── handlers.ts",
    "│   ├── components/",
    "│   │   ├── Button.tsx",
    "│   │   ├── Modal.tsx",
    "│   │   └── Sidebar.tsx",
    "│   └── utils/",
    "│       ├── format.ts",
    "│       └── http.ts",
    "├── tests/",
    "│   └── smoke.test.ts",
    "└── docs/",
    "    └── architecture.md",
  ].join("\n");

return {
    id: `rag_${Date.now()}`,
    fileCount,
    chunkCount,
    vectorStoreRef: "Chroma:0xA3F1",
    embedModel: config.embedModel,
    retrieverK: config.retrieverK,
    retrieverFetchK: Math.round(config.retrieverK * 2.5),
    llmModel: config.groqModel,
    llmTemperature: config.temperature,
    directoryTree: tree,
    createdAt: Date.now(),
  };
}

async function mockFetchGenerateDoc(
  bundle: RagBundle,
  kind: DocKind,
): Promise<DocArtifact> {
  // const res = await fetch("/api/v1/docs/generate", { ... });
  await new Promise((r) => setTimeout(r, 900));
  const stamp = new Date(bundle.createdAt).toISOString().slice(0, 10);
  const body =
    kind === "README.md"
      ? `# Uploaded Repo\n\n_Auto-generated on ${stamp} from ${bundle.fileCount} files._\n\n## Overview\n\nThis project was indexed into **${bundle.chunkCount} chunks** using \`${bundle.embedModel}\`.\n\n## Tech Stack\n\n- LLM: \`${bundle.llmModel}\`\n- Vector store: ${bundle.vectorStoreRef}\n\n## Setup\n\n1. Clone the repository.\n2. Install dependencies.\n3. Run the application.\n\n## Usage\n\nSee \`docs/architecture.md\` for the high-level design.\n`
      : `# Architecture Specification\n\n_Generated ${stamp}._\n\n## 1. System Overview\n\nThe system consists of ${bundle.fileCount} source files indexed into ${bundle.chunkCount} retrieval chunks.\n\n## 2. High-Level Diagram\n\n\`\`\`\n┌──────────┐    ┌─────────────┐    ┌──────────┐\n│  Client  │───▶│  API layer  │───▶│  Store   │\n└──────────┘    └─────────────┘    └──────────┘\n\`\`\`\n\n## 3. Modules & Responsibilities\n\n- \`src/api\`: HTTP routes + handlers\n- \`src/components\`: UI primitives\n- \`src/utils\`: cross-cutting helpers\n\n## 4. Data Flow\n\nClient → Router → Handler → Service → Store → Response\n`;
  return { kind, content: body, generatedAt: Date.now() };
}

async function mockFetchChat(
  _bundle: RagBundle,
  question: string,
): Promise<ChatMessage> {
  // const res = await fetch("/api/v1/chat", { method: "POST", body: JSON.stringify({ question }) });
  await new Promise((r) => setTimeout(r, 700));
  return {
    id: `msg_${Date.now()}`,
    role: "assistant",
    content: `Based on the indexed codebase, here's what I found about "${question}":\n\nThe relevant logic lives in the routing layer; request validation is handled at the handler boundary. Consider extracting it into a dedicated middleware if cross-cutting concerns grow.`,
    citations: [
      "src/api/handlers.ts",
      "src/api/routes.ts",
      "src/utils/http.ts",
    ],
    timestamp: Date.now(),
  };
}

/* -------------------------------------------------------------------- */
/* Root component                                                       */
/* -------------------------------------------------------------------- */

export default function App() {
  const [config, setConfig] = useState<AppConfig>(DEFAULT_CONFIG);
  const [bundle, setBundle] = useState<RagBundle | null>(null);
  const [upload, setUpload] = useState<UploadStatus>({ state: "idle" });
  const [activeTab, setActiveTab] = useState<TabKey>("docs");
  const [doc, setDoc] = useState<DocArtifact | null>(null);
  const [docBusy, setDocBusy] = useState(false);
  const [chat, setChat] = useState<ChatMessage[]>([]);
  const [chatBusy, setChatBusy] = useState(false);

  /* ---- Config updater (typed) ----------------------------------- */
  const handleConfigChange = useCallback(
    <K extends keyof AppConfig>(key: K, value: AppConfig[K]) => {
      setConfig((prev) => ({ ...prev, [key]: value }));
    },
    [],
  );

  /* ---- Upload + initialize -------------------------------------- */
  const handleUploadFile = useCallback(
    async (file: File) => {
      try {
        setUpload({ state: "uploading", filename: file.name, progress: 0 });
        setBundle(null);
        setDoc(null);
        setChat([]);

        const result = await mockFetchInitialize(file, config, (p) => {
          setUpload((u) => ({ ...u, state: "uploading", progress: p }));
        });

        setUpload({
          state: "processing",
          filename: file.name,
          progress: 1,
          message: "Indexing…",
        });
        await new Promise((r) => setTimeout(r, 200));

        setBundle(result);
        setUpload({ state: "ready", filename: file.name });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        setUpload({ state: "error", filename: file.name, error: message });
      }
    },
    [config],
  );

  const handleReset = useCallback(() => {
    setBundle(null);
    setDoc(null);
    setChat([]);
    setUpload({ state: "idle" });
  }, []);

  /* ---- Documentation -------------------------------------------- */
  const handleGenerateDoc = useCallback(
    async (kind: DocKind) => {
      if (!bundle || docBusy) return;
      setDocBusy(true);
      try {
        const result = await mockFetchGenerateDoc(bundle, kind);
        setDoc(result);
      } finally {
        setDocBusy(false);
      }
    },
    [bundle, docBusy],
  );

  const handleDownloadDoc = useCallback((d: DocArtifact) => {
    const blob = new Blob([d.content], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = d.kind;
    a.click();
    URL.revokeObjectURL(url);
  }, []);

  /* ---- Chat ----------------------------------------------------- */
  const handleSendChat = useCallback(
    async (text: string) => {
      if (!bundle || chatBusy) return;
      const userMsg: ChatMessage = {
        id: `msg_${Date.now()}`,
        role: "user",
        content: text,
        timestamp: Date.now(),
      };
      setChat((prev) => [...prev, userMsg]);
      setChatBusy(true);
      try {
        const reply = await mockFetchChat(bundle, text);
        setChat((prev) => [...prev, reply]);
      } finally {
        setChatBusy(false);
      }
    },
    [bundle, chatBusy],
  );

  /* ---- Render ---------------------------------------------------- */
  return (
    <div className="min-h-screen bg-(--color-surface) text-(--color-ink)">
      <Sidebar
        upload={upload}
        bundle={bundle}
        config={config}
        onUploadFile={handleUploadFile}
        onReset={handleReset}
        onConfigChange={handleConfigChange}
      />
      <MainDashboard
        bundle={bundle}
        upload={upload}
        activeTab={activeTab}
        onTabChange={setActiveTab}
        doc={doc}
        docBusy={docBusy}
        onGenerateDoc={handleGenerateDoc}
        onDownloadDoc={handleDownloadDoc}
        chat={chat}
        chatBusy={chatBusy}
        onSendChat={handleSendChat}
      />
    </div>
  );
}