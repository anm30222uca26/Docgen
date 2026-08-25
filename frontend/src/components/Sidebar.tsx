/**
 * Sidebar.tsx — sticky left navigation column.
 *
 * Direct successor to Streamlit's `st.sidebar`:
 *   - Fixed width (`w-64`), full viewport height (`h-screen`).
 *   - File uploader, configuration accordion, live status, indexed stats.
 *
 * Stateless w.r.t. the bundle — receives everything via props and
 * surfaces every change through typed callbacks.
 */

import { useRef } from "react";
import type { ChangeEvent } from "react";
import type { AppConfig, RagBundle, UploadStatus } from "../types";
import { DEFAULT_CONFIG } from "../types";

/* -------------------------------------------------------------------- */
/* Sub-components                                                       */
/* -------------------------------------------------------------------- */

interface ConfigFieldProps {
  label: string;
  hint?: string;
  children: React.ReactNode;
}

function ConfigField({ label, hint, children }: ConfigFieldProps) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-xs font-medium text-(--color-ink-muted)">
        {label}
      </span>
      {children}
      {hint ? (
        <span className="text-[11px] leading-snug text-(--color-ink-muted)/70">
          {hint}
        </span>
      ) : null}
    </label>
  );
}

/* -------------------------------------------------------------------- */
/* Main component                                                       */
/* -------------------------------------------------------------------- */

export interface SidebarProps {
  upload: UploadStatus;
  bundle: RagBundle | null;
  config: AppConfig;
  onUploadFile: (file: File) => void;
  onReset: () => void;
  onConfigChange: <K extends keyof AppConfig>(key: K, value: AppConfig[K]) => void;
}

export function Sidebar({
  upload,
  bundle,
  config,
  onUploadFile,
  onReset,
  onConfigChange,
}: SidebarProps) {
  const inputRef = useRef<HTMLInputElement | null>(null);

  const handlePick = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) onUploadFile(file);
  };

  const isBusy = upload.state === "uploading" || upload.state === "processing";

  return (
    <aside
      className="fixed top-0 left-0 z-30 flex h-screen w-64 flex-col border-r border-(--color-line) bg-(--color-card) scrollbar-thin"
      aria-label="Primary navigation"
    >
      {/* Brand */}
      <div className="flex items-center gap-3 border-b border-(--color-line) px-5 py-5">
        <div className="grid h-9 w-9 place-items-center rounded-xl bg-(--color-accent) text-white shadow-sm">
          <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden="true">
            <path
              fill="currentColor"
              d="M5 3h11l3 3v15a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1Zm10 1.5V8h3.5L15 4.5ZM7 11h10v1.5H7V11Zm0 4h10v1.5H7V15Zm0 4h7v1.5H7V19Z"
            />
          </svg>
        </div>
        <div className="flex flex-col leading-tight">
          <span className="text-sm font-semibold text-(--color-ink)">Docgen</span>
          <span className="text-[11px] text-(--color-ink-muted)">
            Repo Analyzer
          </span>
        </div>
      </div>

      {/* Scrollable body */}
      <div className="flex-1 overflow-y-auto scrollbar-thin px-5 py-5 space-y-6">
        {/* Upload */}
        <section>
          <h3 className="text-xs font-semibold uppercase tracking-wider text-(--color-ink-muted)">
            Upload repository
          </h3>

          <div className="mt-3 rounded-xl border border-dashed border-(--color-line) bg-(--color-accent-soft) p-4">
            <input
              ref={inputRef}
              id="repo-zip"
              type="file"
              accept=".zip,application/zip,application/x-zip-compressed"
              onChange={handlePick}
              disabled={isBusy}
              className="hidden"
            />
            <label
              htmlFor="repo-zip"
              className="flex cursor-pointer flex-col items-center gap-1 text-center text-xs"
            >
              <svg viewBox="0 0 24 24" className="h-6 w-6 text-(--color-accent)" aria-hidden="true">
                <path
                  fill="currentColor"
                  d="M12 3a1 1 0 0 1 1 1v9.59l3.3-3.3a1 1 0 1 1 1.4 1.42l-5 5a1 1 0 0 1-1.4 0l-5-5a1 1 0 1 1 1.4-1.42L11 13.59V4a1 1 0 0 1 1-1Zm-7 16h14a1 1 0 1 1 0 2H5a1 1 0 1 1 0-2Z"
                />
              </svg>
              <span className="font-medium text-(--color-ink)">
                {upload.filename ?? "Drop a ZIP or click to browse"}
              </span>
              <span className="text-[11px] text-(--color-ink-muted)">
                Max ~50 MB
              </span>
            </label>
          </div>

          {/* Progress */}
          {isBusy ? (
            <div className="mt-3">
              <div className="flex justify-between text-[11px] text-(--color-ink-muted)">
                <span>
                  {upload.state === "uploading" ? "Uploading…" : "Indexing…"}
                </span>
                {typeof upload.progress === "number" ? (
                  <span>{Math.round(upload.progress * 100)}%</span>
                ) : null}
              </div>
              <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-(--color-line)">
                <div
                  className="h-full rounded-full bg-(--color-accent) transition-all"
                  style={{ width: `${Math.round((upload.progress ?? 0) * 100)}%` }}
                />
              </div>
            </div>
          ) : null}

          {upload.error ? (
            <p className="mt-3 rounded-md bg-(--color-danger)/10 px-3 py-2 text-xs text-(--color-danger)">
              {upload.error}
            </p>
          ) : null}

          {bundle ? (
            <button
              type="button"
              onClick={onReset}
              className="mt-3 w-full rounded-md border border-(--color-line) px-3 py-1.5 text-xs text-(--color-ink-muted) transition-colors hover:bg-(--color-accent-soft) hover:text-(--color-ink)"
            >
              Clear & re-upload
            </button>
          ) : null}
        </section>

        {/* Configuration accordion */}
        <section>
          <details className="group">
            <summary className="flex cursor-pointer items-center justify-between text-xs font-semibold uppercase tracking-wider text-(--color-ink-muted)">
              <span>Configuration</span>
              <svg
                viewBox="0 0 24 24"
                className="h-4 w-4 transition-transform group-open:rotate-180"
                aria-hidden="true"
              >
                <path fill="currentColor" d="M7 10l5 5 5-5z" />
              </svg>
            </summary>

            <div className="mt-3 space-y-3">
              <ConfigField label="LLM model">
                <select
                  value={config.groqModel}
                  onChange={(e) =>
                    onConfigChange("groqModel", e.target.value)
                  }
                  className="w-full rounded-md border border-(--color-line) bg-(--color-card) px-2 py-1.5 text-xs text-(--color-ink) focus:border-(--color-accent) focus:outline-none focus:ring-2 focus:ring-(--color-accent-ring)"
                >
                  <option value="openai/gpt-oss-120b">
                    openai/gpt-oss-120b
                  </option>
                  <option value="openai/gpt-oss-20b">
                    openai/gpt-oss-20b
                  </option>
                  <option value="llama-3.3-70b-versatile">
                    llama-3.3-70b-versatile
                  </option>
                </select>
              </ConfigField>

              <ConfigField label="Temperature" hint={`${config.temperature.toFixed(2)}`}>
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.05}
                  value={config.temperature}
                  onChange={(e) =>
                    onConfigChange("temperature", Number(e.target.value))
                  }
                  className="h-2 w-full cursor-pointer appearance-none rounded-full bg-(--color-line) accent-(--color-accent)"
                />
              </ConfigField>

              <ConfigField label="Retriever k">
                <input
                  type="number"
                  min={1}
                  max={50}
                  value={config.retrieverK}
                  onChange={(e) =>
                    onConfigChange("retrieverK", Number(e.target.value))
                  }
                  className="w-full rounded-md border border-(--color-line) bg-(--color-card) px-2 py-1.5 text-xs text-(--color-ink) focus:border-(--color-accent) focus:outline-none focus:ring-2 focus:ring-(--color-accent-ring)"
                />
              </ConfigField>

              <ConfigField label="Chunk size">
                <input
                  type="number"
                  min={250}
                  max={4000}
                  step={50}
                  value={config.chunkSize}
                  onChange={(e) =>
                    onConfigChange("chunkSize", Number(e.target.value))
                  }
                  className="w-full rounded-md border border-(--color-line) bg-(--color-card) px-2 py-1.5 text-xs text-(--color-ink) focus:border-(--color-accent) focus:outline-none focus:ring-2 focus:ring-(--color-accent-ring)"
                />
              </ConfigField>

              <ConfigField label="Chunk overlap">
                <input
                  type="number"
                  min={0}
                  max={500}
                  step={20}
                  value={config.chunkOverlap}
                  onChange={(e) =>
                    onConfigChange("chunkOverlap", Number(e.target.value))
                  }
                  className="w-full rounded-md border border-(--color-line) bg-(--color-card) px-2 py-1.5 text-xs text-(--color-ink) focus:border-(--color-accent) focus:outline-none focus:ring-2 focus:ring-(--color-accent-ring)"
                />
              </ConfigField>

              <ConfigField label="Embedding model">
                <input
                  type="text"
                  value={config.embedModel}
                  onChange={(e) =>
                    onConfigChange("embedModel", e.target.value)
                  }
                  className="w-full rounded-md border border-(--color-line) bg-(--color-card) px-2 py-1.5 text-xs text-(--color-ink) focus:border-(--color-accent) focus:outline-none focus:ring-2 focus:ring-(--color-accent-ring)"
                />
              </ConfigField>

              <label className="flex items-center gap-2 text-xs text-(--color-ink-muted)">
                <input
                  type="checkbox"
                  checked={config.persistChunks}
                  onChange={(e) =>
                    onConfigChange("persistChunks", e.target.checked)
                  }
                  className="h-4 w-4 rounded border-(--color-line) text-(--color-accent) focus:ring-(--color-accent)"
                />
                Persist vector store to disk
              </label>

              <button
                type="button"
                onClick={() => onConfigChange("temperature", DEFAULT_CONFIG.temperature)}
                className="w-full rounded-md border border-(--color-line) px-3 py-1.5 text-[11px] text-(--color-ink-muted) hover:bg-(--color-accent-soft) hover:text-(--color-ink)"
              >
                Reset to defaults
              </button>
            </div>
          </details>
        </section>

        {/* Status / stats */}
        <section>
          <h3 className="text-xs font-semibold uppercase tracking-wider text-(--color-ink-muted)">
            Status
          </h3>
          <div className="mt-3 space-y-2">
            <StatusRow
              label="Vector store"
              value={bundle ? "in-memory" : "—"}
              tone={bundle ? "ok" : "muted"}
            />
            <StatusRow
              label="LLM"
              value={config.groqModel}
              tone="muted"
            />
            <StatusRow
              label="Files indexed"
              value={bundle ? `${bundle.fileCount}` : "—"}
              tone={bundle ? "ok" : "muted"}
            />
            <StatusRow
              label="Chunks"
              value={bundle ? `${bundle.chunkCount}` : "—"}
              tone={bundle ? "ok" : "muted"}
            />
          </div>
        </section>
      </div>

      {/* Footer */}
      <div className="border-t border-(--color-line) px-5 py-3 text-[11px] text-(--color-ink-muted)">
        Groq · ChromaDB · HuggingFace
      </div>
    </aside>
  );
}

function StatusRow({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: "ok" | "muted";
}) {
  return (
    <div className="flex items-center justify-between text-xs">
      <span className="text-(--color-ink-muted)">{label}</span>
      <span
        className={
          tone === "ok"
            ? "rounded-full bg-(--color-success)/10 px-2 py-0.5 font-medium text-(--color-success)"
            : "text-(--color-ink-muted)"
        }
      >
        {value}
      </span>
    </div>
  );
}