/**
 * Domain types for the Docgen SPA.
 *
 * These mirror the Python `core.py` payloads so the front-end can be wired
 * to a real FastAPI/Flask backend later by simply replacing the mock
 * fetchers with real ones. Strict typing throughout.
 */

/* -------------------------------------------------------------------- */
/* RAG pipeline                                                         */
/* -------------------------------------------------------------------- */

export interface RagBundle {
  /** Backend handle for the in-memory Chroma instance. */
  id: string;
  fileCount: number;
  chunkCount: number;
  vectorStoreRef: string;
  embedModel: string;
  retrieverK: number;
  retrieverFetchK: number;
  llmModel: string;
  llmTemperature: number;
  directoryTree: string;
  /** Unix ms. */
  createdAt: number;
}

export type UploadState =
  | "idle"
  | "uploading"
  | "processing"
  | "ready"
  | "error";

export interface UploadStatus {
  state: UploadState;
  filename?: string;
  /** 0..1. */
  progress?: number;
  message?: string;
  error?: string;
}

/* -------------------------------------------------------------------- */
/* Chat                                                                 */
/* -------------------------------------------------------------------- */

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  citations?: string[];
  /** Unix ms. */
  timestamp: number;
}

/* -------------------------------------------------------------------- */
/* Documentation generator                                              */
/* -------------------------------------------------------------------- */

export type DocKind = "README.md" | "ARCHITECTURE.md";

export interface DocArtifact {
  kind: DocKind;
  content: string;
  /** Unix ms. */
  generatedAt: number;
}

/* -------------------------------------------------------------------- */
/* Configuration panel                                                  */
/* -------------------------------------------------------------------- */

export interface AppConfig {
  groqModel: string;
  temperature: number;
  retrieverK: number;
  embedModel: string;
  chunkSize: number;
  chunkOverlap: number;
  maxTreeDepth: number;
  persistChunks: boolean;
}

export const DEFAULT_CONFIG: AppConfig = {
  groqModel: "openai/gpt-oss-120b",
  temperature: 0.2,
  retrieverK: 8,
  embedModel: "BAAI/bge-small-en-v1.5",
  chunkSize: 1500,
  chunkOverlap: 200,
  maxTreeDepth: 4,
  persistChunks: false,
};

/* -------------------------------------------------------------------- */
/* Tabs / view state                                                    */
/* -------------------------------------------------------------------- */

export type TabKey = "docs" | "chat";

/* -------------------------------------------------------------------- */
/* Repository summary (mock analytics for the dashboard tiles)          */
/* -------------------------------------------------------------------- */

export interface RepoFileEntry {
  path: string;
  size: number;
  language: string;
  indexed: boolean;
}

export interface LanguageSlice {
  name: string;
  count: number;
  pct: number;
}

export interface RepoSummary {
  name: string;
  totalFiles: number;
  totalBytes: number;
  languages: LanguageSlice[];
  fileTree: RepoFileEntry[];
}