/**
 * MainDashboard.tsx — primary content area.
 *
 * Successor to Streamlit's main script body, with two tabs:
 *   1. Documentation Generator  → README.md / ARCHITECTURE.md
 *   2. Codebase Q&A Chat        → RAG chatbot with citations
 *
 * Side panel shows the indexed repo summary (tree, language mix).
 */

import { useMemo } from "react";
import type { FormEvent } from "react";
import type {
  ChatMessage,
  DocArtifact,
  DocKind,
  RagBundle,
  RepoSummary,
  TabKey,
  UploadStatus,
} from "../types";

/* -------------------------------------------------------------------- */
/* Static helpers                                                       */
/* -------------------------------------------------------------------- */

/** Parse a `directoryTree` string (root/├─/└─/│ format) into rows. */
function parseTree(tree: string): { depth: number; name: string; isDir: boolean }[] {
  const lines = tree.split("\n").slice(1); // drop root line
  return lines.map((line) => {
    const indentMatch = line.match(/^(?:[│ ]+)?(?:├── |└── )?/);
    const indent = indentMatch ? indentMatch[0].length : 0;
    const depth = Math.floor(indent / 4);
    const name = line.replace(/^[│ ]*(?:├── |└── )/, "").trimEnd();
    const isDir = name.endsWith("/");
    return {
      depth,
      name: isDir ? name.slice(0, -1) : name,
      isDir,
    };
  });
}

function mockRepoSummary(bundle: RagBundle | null): RepoSummary | null {
  if (!bundle) return null;
  // Pretend distribution inferred from chunk count.
  const total = bundle.chunkCount;
  const py = Math.round(total * 0.46);
  const ts = Math.round(total * 0.22);
  const md = Math.round(total * 0.14);
  const rest = Math.max(0, total - py - ts - md);
  return {
    name: "uploaded-repo",
    totalFiles: bundle.fileCount,
    totalBytes: bundle.chunkCount * 1240,
    languages: [
      { name: "Python", count: py, pct: (py / total) * 100 },
      { name: "TypeScript", count: ts, pct: (ts / total) * 100 },
      { name: "Markdown", count: md, pct: (md / total) * 100 },
      { name: "Other", count: rest, pct: (rest / total) * 100 },
    ],
    fileTree: [],
  };
}

/* -------------------------------------------------------------------- */
/* Sub-components                                                       */
/* -------------------------------------------------------------------- */

function StatCard({
  label,
  value,
  hint,
}: {
  label: string;
  value: string | number;
  hint?: string;
}) {
  return (
    <div className="rounded-xl border border-(--color-line) bg-(--color-card) p-4">
      <div className="text-[11px] font-medium uppercase tracking-wider text-(--color-ink-muted)">
        {label}
      </div>
      <div className="mt-2 text-2xl font-semibold tabular-nums text-(--color-ink)">
        {value}
      </div>
      {hint ? (
        <div className="mt-1 text-[11px] text-(--color-ink-muted)">{hint}</div>
      ) : null}
    </div>
  );
}

function LanguageBar({ slices }: { slices: { name: string; pct: number }[] }) {
  return (
    <div>
      <div className="flex h-2 w-full overflow-hidden rounded-full bg-(--color-line)">
        {slices.map((s, i) => (
          <div
            key={s.name}
            style={{
              width: `${s.pct}%`,
              background: [
                "var(--color-accent)",
                "var(--color-success)",
                "var(--color-warning)",
                "var(--color-danger)",
              ][i % 4],
            }}
            title={`${s.name} ${s.pct.toFixed(1)}%`}
          />
        ))}
      </div>
      <div className="mt-3 grid grid-cols-2 gap-y-1 text-xs">
        {slices.map((s, i) => (
          <div key={s.name} className="flex items-center gap-2">
            <span
              className="h-2 w-2 rounded-full"
              style={{
                background: [
                  "var(--color-accent)",
                  "var(--color-success)",
                  "var(--color-warning)",
                  "var(--color-danger)",
                ][i % 4],
              }}
            />
            <span className="text-(--color-ink-muted)">{s.name}</span>
            <span className="ml-auto tabular-nums text-(--color-ink)">
              {s.pct.toFixed(1)}%
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function DirectoryTreeView({ bundle }: { bundle: RagBundle }) {
  const rows = useMemo(() => parseTree(bundle.directoryTree), [bundle.directoryTree]);
  return (
    <div className="overflow-hidden rounded-xl border border-(--color-line) bg-(--color-card)">
      <div className="flex items-center justify-between border-b border-(--color-line) px-4 py-2">
        <h4 className="text-xs font-semibold text-(--color-ink)">
          Repository structure
        </h4>
        <span className="text-[11px] text-(--color-ink-muted)">
          {bundle.fileCount} files · {bundle.chunkCount} chunks
        </span>
      </div>
      <pre className="max-h-72 overflow-y-auto scrollbar-thin p-4 font-mono text-[12px] leading-5 text-(--color-ink)">
        {rows.map((r, i) => (
          <div
            key={i}
            style={{ paddingLeft: `${r.depth * 16}px` }}
            className="flex items-center gap-1"
          >
            <span className={r.isDir ? "text-(--color-accent)" : "text-(--color-ink-muted)"}>
              {r.isDir ? "▸" : "·"}
            </span>
            <span>{r.name}</span>
          </div>
        ))}
      </pre>
    </div>
  );
}

function DocPreview({ doc, onDownload }: { doc: DocArtifact; onDownload: () => void }) {
  return (
    <div className="overflow-hidden rounded-xl border border-(--color-line) bg-(--color-card)">
      <div className="flex items-center justify-between border-b border-(--color-line) bg-(--color-accent-soft) px-4 py-2">
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold text-(--color-ink)">
            {doc.kind}
          </span>
          <span className="rounded-full bg-(--color-success)/10 px-2 py-0.5 text-[10px] font-medium text-(--color-success)">
            Generated
          </span>
        </div>
        <button
          type="button"
          onClick={onDownload}
          className="inline-flex items-center gap-1 rounded-md bg-(--color-accent) px-2.5 py-1 text-[11px] font-medium text-white shadow-sm transition-colors hover:bg-(--color-accent)/90"
        >
          <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" aria-hidden="true">
            <path fill="currentColor" d="M12 3v10.59l3.3-3.3 1.4 1.42L12 16.41 7.3 11.71l1.4-1.42 3.3 3.3V3zM5 19h14v2H5z" />
          </svg>
          Download
        </button>
      </div>
      <pre className="max-h-[28rem] overflow-y-auto scrollbar-thin p-5 font-mono text-[12.5px] leading-6 text-(--color-ink) whitespace-pre-wrap">
        {doc.content}
      </pre>
    </div>
  );
}

function ChatBubble({ message }: { message: ChatMessage }) {
  const isUser = message.role === "user";
  return (
    <div className={`flex gap-3 ${isUser ? "justify-end" : "justify-start"}`}>
      {!isUser ? (
        <div className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-(--color-accent) text-[10px] font-bold text-white">
          AI
        </div>
      ) : null}
      <div
        className={`max-w-[80%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed shadow-sm ${
          isUser
            ? "bg-(--color-accent) text-white"
            : "bg-(--color-card) border border-(--color-line) text-(--color-ink)"
        }`}
      >
        <p className="whitespace-pre-wrap">{message.content}</p>
        {message.citations && message.citations.length > 0 ? (
          <div className="mt-3 border-t border-(--color-line)/60 pt-2 text-[11px]">
            <div className="mb-1 font-semibold text-(--color-ink-muted)">
              Sources
            </div>
            <ul className="space-y-0.5">
              {message.citations.map((c) => (
                <li key={c}>
                  <code className="rounded bg-(--color-accent-soft) px-1.5 py-0.5 text-(--color-ink)">
                    {c}
                  </code>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </div>
      {isUser ? (
        <div className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-(--color-ink-muted) text-[10px] font-bold text-white">
          You
        </div>
      ) : null}
    </div>
  );
}

/* -------------------------------------------------------------------- */
/* Main component                                                       */
/* -------------------------------------------------------------------- */

export interface MainDashboardProps {
  bundle: RagBundle | null;
  upload: UploadStatus;
  activeTab: TabKey;
  onTabChange: (k: TabKey) => void;
  doc: DocArtifact | null;
  docBusy: boolean;
  onGenerateDoc: (kind: DocKind) => void;
  onDownloadDoc: (doc: DocArtifact) => void;
  chat: ChatMessage[];
  chatBusy: boolean;
  onSendChat: (text: string) => void;
}

export function MainDashboard({
  bundle,
  upload,
  activeTab,
  onTabChange,
  doc,
  docBusy,
  onGenerateDoc,
  onDownloadDoc,
  chat,
  chatBusy,
  onSendChat,
}: MainDashboardProps) {
  const summary = useMemo(() => mockRepoSummary(bundle), [bundle]);

  /* ---- Empty state ------------------------------------------------ */
  if (!bundle) {
    return (
      <main className="ml-64 min-h-screen px-10 py-12">
        <div className="mx-auto max-w-2xl text-center">
          <div className="mx-auto mb-6 grid h-16 w-16 place-items-center rounded-2xl bg-(--color-accent-soft) text-(--color-accent)">
            <svg viewBox="0 0 24 24" className="h-8 w-8" aria-hidden="true">
              <path
                fill="currentColor"
                d="M12 3a1 1 0 0 1 1 1v9.59l3.3-3.3a1 1 0 1 1 1.4 1.42l-5 5a1 1 0 0 1-1.4 0l-5-5a1 1 0 1 1 1.4-1.42L11 13.59V4a1 1 0 0 1 1-1Zm-7 16h14a1 1 0 1 1 0 2H5a1 1 0 1 1 0-2Z"
              />
            </svg>
          </div>
          <h1 className="text-3xl font-semibold tracking-tight text-(--color-ink)">
            Upload a repository to begin
          </h1>
          <p className="mt-3 text-(--color-ink-muted)">
            Drop a ZIP in the sidebar. We'll index its source files,
            vectorize them with <strong>BAAI/bge-small-en-v1.5</strong>,
            and let you chat with the code or auto-generate docs.
          </p>
          {upload.state === "processing" ? (
            <p className="mt-6 inline-flex items-center gap-2 rounded-full bg-(--color-accent-soft) px-4 py-2 text-xs font-medium text-(--color-accent)">
              <span className="h-2 w-2 animate-pulse rounded-full bg-(--color-accent)" />
              Indexing your codebase…
            </p>
          ) : null}
        </div>
      </main>
    );
  }

  /* ---- Indexed dashboard -------------------------------------------- */
  return (
    <main className="ml-64 min-h-screen px-8 py-8 space-y-6">
      {/* Header / KPIs */}
      <header className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-(--color-ink)">
            {summary?.name ?? "Repo"}
          </h1>
          <p className="mt-1 text-sm text-(--color-ink-muted)">
            Indexed in-memory · LLM{" "}
            <code className="rounded bg-(--color-accent-soft) px-1.5 py-0.5 text-(--color-ink)">
              {bundle.llmModel}
            </code>{" "}
            @ T={bundle.llmTemperature}
          </p>
        </div>
        <span className="rounded-full bg-(--color-success)/10 px-3 py-1 text-[11px] font-medium text-(--color-success)">
          ● Vector store ready
        </span>
      </header>

      {/* KPI grid */}
      <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Files" value={bundle.fileCount} hint="After .gitignore filter" />
        <StatCard label="Chunks" value={bundle.chunkCount} hint={`${bundle.retrieverK} per query`} />
        <StatCard label="Top language" value={summary?.languages[0].name ?? "—"} hint={`${summary?.languages[0].pct.toFixed(1) ?? "0"}% of chunks`} />
        <StatCard label="Embedding" value={bundle.vectorStoreRef} hint="In-memory ChromaDB" />
      </section>

      {/* Tabs */}
      <section>
        <div role="tablist" className="flex w-fit rounded-full border border-(--color-line) bg-(--color-card) p-1">
          {(
            [
              { key: "docs", label: "📄 Documentation" },
              { key: "chat", label: "💬 Codebase Q&A" },
            ] as const
          ).map((t) => {
            const active = activeTab === t.key;
            return (
              <button
                key={t.key}
                role="tab"
                aria-selected={active}
                onClick={() => onTabChange(t.key)}
                className={`rounded-full px-4 py-1.5 text-xs font-medium transition-colors ${
                  active
                    ? "bg-(--color-accent) text-white shadow-sm"
                    : "text-(--color-ink-muted) hover:bg-(--color-accent-soft) hover:text-(--color-ink)"
                }`}
              >
                {t.label}
              </button>
            );
          })}
        </div>

        {/* Tab panels */}
        <div className="mt-5 grid grid-cols-1 gap-5 lg:grid-cols-3">
          {/* Side panel */}
          <aside className="space-y-5 lg:col-span-1">
            <div className="rounded-xl border border-(--color-line) bg-(--color-card) p-4">
              <h4 className="text-xs font-semibold text-(--color-ink)">
                Language mix
              </h4>
              <div className="mt-3">
                {summary ? <LanguageBar slices={summary.languages} /> : null}
              </div>
            </div>
            <DirectoryTreeView bundle={bundle} />
          </aside>

          {/* Main panel */}
          <div className="lg:col-span-2">
            {activeTab === "docs" ? (
              <DocsPanel
                doc={doc}
                docBusy={docBusy}
                onGenerate={onGenerateDoc}
                onDownload={onDownloadDoc}
              />
            ) : (
              <ChatPanel
                chat={chat}
                chatBusy={chatBusy}
                onSend={onSendChat}
              />
            )}
          </div>
        </div>
      </section>
    </main>
  );
}

/* -------------------------------------------------------------------- */
/* Tab panels                                                           */
/* -------------------------------------------------------------------- */

function DocsPanel({
  doc,
  docBusy,
  onGenerate,
  onDownload,
}: {
  doc: DocArtifact | null;
  docBusy: boolean;
  onGenerate: (kind: DocKind) => void;
  onDownload: (doc: DocArtifact) => void;
}) {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <button
          type="button"
          onClick={() => onGenerate("README.md")}
          disabled={docBusy}
          className="rounded-xl border border-(--color-line) bg-(--color-card) p-4 text-left transition-all hover:border-(--color-accent) hover:bg-(--color-accent-soft) disabled:opacity-50"
        >
          <div className="text-sm font-semibold text-(--color-ink)">📝 Generate README.md</div>
          <div className="mt-1 text-[11px] text-(--color-ink-muted)">
            Project overview, setup, usage, configuration
          </div>
        </button>
        <button
          type="button"
          onClick={() => onGenerate("ARCHITECTURE.md")}
          disabled={docBusy}
          className="rounded-xl border border-(--color-line) bg-(--color-card) p-4 text-left transition-all hover:border-(--color-accent) hover:bg-(--color-accent-soft) disabled:opacity-50"
        >
          <div className="text-sm font-semibold text-(--color-ink)">🏗️ Generate Architecture Spec</div>
          <div className="mt-1 text-[11px] text-(--color-ink-muted)">
            Modules, data flow, dependencies
          </div>
        </button>
      </div>

      {docBusy ? (
        <div className="rounded-xl border border-(--color-line) bg-(--color-card) p-6 text-center">
          <div className="mx-auto mb-3 h-6 w-6 animate-spin rounded-full border-2 border-(--color-accent) border-t-transparent" />
          <p className="text-sm text-(--color-ink-muted)">
            Generating {doc?.kind ?? "document"}…
          </p>
        </div>
      ) : doc ? (
        <DocPreview doc={doc} onDownload={() => onDownload(doc)} />
      ) : (
        <div className="rounded-xl border border-dashed border-(--color-line) bg-(--color-card) p-8 text-center text-sm text-(--color-ink-muted)">
          No document generated yet. Pick one of the buttons above to start.
        </div>
      )}
    </div>
  );
}

function ChatPanel({
  chat,
  chatBusy,
  onSend,
}: {
  chat: ChatMessage[];
  chatBusy: boolean;
  onSend: (text: string) => void;
}) {
  const handleSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = e.currentTarget;
    const input = form.elements.namedItem("question") as HTMLInputElement | null;
    const text = input?.value.trim();
    if (!text || chatBusy) return;
    onSend(text);
    if (input) input.value = "";
  };

  return (
    <div className="flex h-[36rem] flex-col overflow-hidden rounded-xl border border-(--color-line) bg-(--color-card)">
      <div className="flex-1 space-y-3 overflow-y-auto scrollbar-thin p-4">
        {chat.length === 0 ? (
          <div className="grid h-full place-items-center text-center">
            <div>
              <p className="text-sm text-(--color-ink-muted)">
                Try asking about a specific function, file, or design decision.
              </p>
              <p className="mt-2 text-[11px] text-(--color-ink-muted)/70">
                Example: <em>"Where is request validation handled?"</em>
              </p>
            </div>
          </div>
        ) : (
          chat.map((m) => <ChatBubble key={m.id} message={m} />)
        )}
        {chatBusy ? (
          <div className="flex gap-3">
            <div className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-(--color-accent) text-[10px] font-bold text-white">
              AI
            </div>
            <div className="rounded-2xl border border-(--color-line) bg-(--color-card) px-4 py-2.5 text-sm text-(--color-ink-muted)">
              <span className="inline-flex gap-1">
                <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-(--color-accent) [animation-delay:-0.3s]" />
                <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-(--color-accent) [animation-delay:-0.15s]" />
                <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-(--color-accent)" />
              </span>
            </div>
          </div>
        ) : null}
      </div>
      <form
        onSubmit={handleSubmit}
        className="flex items-center gap-2 border-t border-(--color-line) bg-(--color-surface) p-3"
      >
        <input
          name="question"
          type="text"
          autoComplete="off"
          placeholder="Ask a question about the repo…"
          className="flex-1 rounded-lg border border-(--color-line) bg-(--color-card) px-3 py-2 text-sm text-(--color-ink) placeholder:text-(--color-ink-muted)/70 focus:border-(--color-accent) focus:outline-none focus:ring-2 focus:ring-(--color-accent-ring)"
        />
        <button
          type="submit"
          disabled={chatBusy}
          className="rounded-lg bg-(--color-accent) px-4 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-(--color-accent)/90 disabled:opacity-50"
        >
          Send
        </button>
      </form>
    </div>
  );
}