"""
core.py — Backend RAG engine for Docgen.

Pure logic module. **No Streamlit imports, no UI concerns.**

Public surface:
    - initialize_rag_pipeline(zip_file, groq_api_key) -> RagBundle
        Sets up embeddings, ephemeral Chroma vector store, retriever,
        ChatGroq LLM, an LCEL retrieval-augmented chain, and a textual
        directory tree of the extracted repo.
    - generate_document(bundle, kind) -> str
        Produces a "README.md" or "ARCHITECTURE.md" string from the index.
    - answer_with_citations(bundle, question, history) -> str
        High-level helper used by the chatbot tab; runs the LCEL chain and
        appends a bold Markdown source-citation block.
    - build_citation_block(docs) -> str
        Formats retrieved document paths as bold Markdown citations.
    - Constants: EMBED_MODEL_NAME, GROQ_MODEL_NAME, LLM_TEMPERATURE.

`zip_file` accepts a Streamlit UploadedFile (duck-typed via `.getvalue()`),
raw `bytes`, or any file-like with `.read()` — no Streamlit import needed
inside this module.
"""

from __future__ import annotations

import io
import re
import tempfile
import zipfile
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Iterable, Tuple

import pathspec

from langchain_core.documents import Document
from langchain_core.output_parsers import StrOutputParser
from langchain_core.prompts import ChatPromptTemplate
from langchain_core.runnables import Runnable

from langchain_text_splitters import RecursiveCharacterTextSplitter
from langchain_chroma import Chroma
from langchain_groq import ChatGroq
from langchain_huggingface import HuggingFaceEmbeddings


# ---------------------------------------------------------------------------
# Configuration constants
# ---------------------------------------------------------------------------
EMBED_MODEL_NAME = "BAAI/bge-small-en-v1.5"
GROQ_MODEL_NAME = "openai/gpt-oss-120b"
LLM_TEMPERATURE = 0.2

# Files we consider worth indexing.
CODE_EXTENSIONS = {
    ".py", ".js", ".jsx", ".ts", ".tsx", ".mjs", ".cjs",
    ".java", ".kt", ".scala", ".groovy",
    ".c", ".cpp", ".cc", ".cxx", ".h", ".hpp", ".hh",
    ".cs", ".vb", ".fs",
    ".go", ".rs", ".rb", ".php", ".swift", ".m", ".mm",
    ".sh", ".bash", ".zsh", ".ps1", ".bat", ".cmd",
    ".sql", ".html", ".htm", ".css", ".scss", ".sass", ".less",
    ".md", ".rst", ".txt",
    ".json", ".yaml", ".yml", ".xml", ".toml", ".ini", ".cfg",
    ".gradle", ".proto",
}
SPECIAL_FILENAMES = {"dockerfile", "makefile", "rakefile", "gemfile", ".env.example"}

# OS / VCS metadata files we always skip (covers `.DS_Store` etc.).
HIDDEN_FILE_NAMES = {
    ".ds_store", "desktop.ini", "thumbs.db",
    ".spotlight-v100", ".fseventsd", ".trashes",
    ".directory", "icon\r", ".metadata",
    ".git", ".gitkeep", ".gitignore", ".gitattributes", ".gitmodules",
    ".env", ".envrc",
}

# Vendor / VCS / build dirs we always exclude.
HARD_EXCLUDED_DIRS = {
    ".git", ".hg", ".svn",
    "node_modules", "venv", ".venv", "env", ".env",
    "__pycache__", ".pytest_cache", ".mypy_cache", ".ruff_cache",
    "dist", "build", "out", "target", "bin", "obj",
    ".idea", ".vscode",
}

CHUNK_SIZE = 1500
CHUNK_OVERLAP = 200
TEXT_ENCODINGS: Tuple[str, ...] = ("utf-8", "utf-8-sig", "latin-1", "cp1252")
CHAT_RETRIEVE_K = 8
CHAT_RETRIEVE_FETCH_K = 20


# ---------------------------------------------------------------------------
# Encoding-safe file reader (every fallback wrapped in try/except)
# ---------------------------------------------------------------------------
def read_file_safely(path: Path) -> str:
    """Read text, trying encodings in order; returns "" on any failure."""
    for enc in TEXT_ENCODINGS:
        try:
            return path.read_text(encoding=enc)
        except (UnicodeDecodeError, LookupError):
            continue
        except OSError:
            return ""
    try:
        return path.read_bytes().decode("utf-8", errors="ignore")
    except OSError:
        return ""


def is_hidden_system_file(name: str) -> bool:
    return name.lower() in HIDDEN_FILE_NAMES


# ---------------------------------------------------------------------------
# .gitignore → PathSpec
# ---------------------------------------------------------------------------
def load_gitignore_spec(extracted_dir: Path) -> pathspec.PathSpec:
    """Build a gitwildmatch PathSpec from the repo's .gitignore + hard excludes."""
    gitignore = extracted_dir / ".gitignore"
    patterns: list[str] = []
    if gitignore.is_file():
        patterns.extend(read_file_safely(gitignore).splitlines())
    for d in HARD_EXCLUDED_DIRS:
        patterns.append(f"/{d}/")
        patterns.append(f"{d}/")
        patterns.append(f"**/{d}/**")
    return pathspec.PathSpec.from_lines("gitwildmatch", patterns)


def is_path_ignored(rel_posix: str, spec: pathspec.PathSpec) -> bool:
    if not rel_posix or rel_posix == ".":
        return True
    return spec.match_file(rel_posix)


# ---------------------------------------------------------------------------
# Secure ZIP extraction (in-memory via tempfile + Zip-Slip guard)
# ---------------------------------------------------------------------------
def extract_repo_zip(zip_bytes: bytes) -> Path:
    """Extract a ZIP (raw bytes) into a fresh tempfile dir, with Zip-Slip guard."""
    tmp_root = Path(tempfile.mkdtemp(prefix="docgen_repo_")).resolve()
    with zipfile.ZipFile(io.BytesIO(zip_bytes)) as zf:
        for member in zf.infolist():
            name = member.filename
            if name.startswith(("/", "\\")) or re.match(r"^[A-Za-z]:", name):
                continue
            target = (tmp_root / name).resolve()
            try:
                target.relative_to(tmp_root)
            except ValueError:
                continue
            if member.is_dir():
                target.mkdir(parents=True, exist_ok=True)
                continue
            target.parent.mkdir(parents=True, exist_ok=True)
            with zf.open(member) as src, open(target, "wb") as dst:
                for chunk in iter(lambda: src.read(1024 * 1024), b""):
                    dst.write(chunk)
    return tmp_root


def _coerce_zip_bytes(zip_file: Any) -> bytes:
    """
    Normalize a ZIP input to raw bytes.

    Accepts:
        - Streamlit UploadedFile (duck-typed via `.getvalue()`)
        - `bytes` / `bytearray`
        - Any file-like exposing `.read()`
    """
    if hasattr(zip_file, "getvalue") and callable(zip_file.getvalue):
        return zip_file.getvalue()
    if isinstance(zip_file, (bytes, bytearray)):
        return bytes(zip_file)
    if hasattr(zip_file, "read") and callable(zip_file.read):
        return zip_file.read()
    raise TypeError(
        "zip_file must be a file-like (UploadedFile), bytes, or bytearray."
    )


# ---------------------------------------------------------------------------
# Codebase walking + chunking
# ---------------------------------------------------------------------------
def iter_candidate_files(
    root: Path, spec: pathspec.PathSpec
) -> Iterable[Tuple[Path, str]]:
    """Yield (absolute_path, repo-relative-posix-path) for indexable files."""
    for p in root.rglob("*"):
        if not p.is_file():
            continue
        try:
            rel = p.relative_to(root).as_posix()
        except ValueError:
            continue
        if is_path_ignored(rel, spec):
            continue
        if is_hidden_system_file(p.name):
            continue
        if p.suffix.lower() in CODE_EXTENSIONS or p.name.lower() in SPECIAL_FILENAMES:
            yield p, rel


def chunk_codebase(root: Path, spec: pathspec.PathSpec) -> list[Document]:
    """
    Walk the repo, read each candidate file safely, and split into chunks.

    Every per-file step (read, split) is wrapped in its own try/except so
    a single bad file cannot poison the indexing job.
    """
    splitter = RecursiveCharacterTextSplitter(
        chunk_size=CHUNK_SIZE,
        chunk_overlap=CHUNK_OVERLAP,
        separators=["\n\n", "\n", " ", ""],
    )
    docs: list[Document] = []
    for path, rel in iter_candidate_files(root, spec):
        try:
            text = read_file_safely(path)
        except Exception:
            continue
        if not text or not text.strip():
            continue
        try:
            chunks = splitter.split_text(text)
        except Exception:
            continue
        for i, chunk in enumerate(chunks):
            docs.append(
                Document(
                    page_content=chunk,
                    metadata={"source": rel, "chunk_index": i},
                )
            )
    return docs


# ---------------------------------------------------------------------------
# Directory tree (textual, used for UI display)
# ---------------------------------------------------------------------------
def build_directory_tree(
    root: Path, spec: pathspec.PathSpec, max_depth: int = 4
) -> str:
    """Render a small textual tree of the repo, respecting the ignore spec."""
    lines: list[str] = [f"{root.name}/"]

    def _walk(path: Path, prefix: str, depth: int) -> None:
        if depth > max_depth:
            return
        try:
            entries = sorted(
                (p for p in path.iterdir()),
                key=lambda p: (not p.is_dir(), p.name.lower()),
            )
            entries = [
                p for p in entries
                if not is_path_ignored(p.relative_to(root).as_posix(), spec)
                and not is_hidden_system_file(p.name)
            ]
        except OSError:
            return
        for i, entry in enumerate(entries):
            last = i == len(entries) - 1
            connector = "└── " if last else "├── "
            suffix = "/" if entry.is_dir() else ""
            lines.append(f"{prefix}{connector}{entry.name}{suffix}")
            if entry.is_dir():
                ext = "    " if last else "│   "
                _walk(entry, prefix + ext, depth + 1)

    _walk(root, "", 1)
    return "\n".join(lines)


# ---------------------------------------------------------------------------
# Vector store + LLM builders
# ---------------------------------------------------------------------------
def get_embeddings() -> HuggingFaceEmbeddings:
    return HuggingFaceEmbeddings(model_name=EMBED_MODEL_NAME)


def build_vector_store(docs: list[Document]) -> Chroma:
    if not docs:
        raise ValueError(
            "No indexable files found after applying .gitignore / excludes."
        )
    return Chroma.from_documents(
        documents=docs,
        embedding=get_embeddings(),
        collection_name="docgen_codebase",
    )


def get_llm(api_key: str) -> ChatGroq:
    return ChatGroq(
        groq_api_key=api_key,
        model_name=GROQ_MODEL_NAME,
        temperature=LLM_TEMPERATURE,
    )


# ---------------------------------------------------------------------------
# LCEL QA chain (chat) — invoke with {"question": str, "history": list[dict]}
# ---------------------------------------------------------------------------
QA_SYSTEM_PROMPT = (
    "You are a code-aware assistant. Answer the user's question using ONLY the "
    "codebase context in the retrieved documents. If the answer is not in the "
    "context, say you don't know and point to likely files to inspect."
)


def _format_docs(docs: list[Document]) -> str:
    return "\n\n".join(
        f"----- FILE: {d.metadata.get('source', 'unknown')} -----\n{d.page_content}"
        for d in docs
    )


def _history_to_messages(history: list[dict]) -> list[Tuple[str, str]]:
    """Convert plain {role, content} dicts into LangChain message tuples."""
    out: list[Tuple[str, str]] = []
    for turn in history:
        role = "human" if turn.get("role") == "user" else "ai"
        out.append((role, turn.get("content", "")))
    return out


def build_qa_chain(retriever: Any, llm: ChatGroq) -> Runnable:
    """LCEL retrieval-augmented chat chain. Invoke with {question, history}."""
    prompt = ChatPromptTemplate.from_messages([
        ("system", QA_SYSTEM_PROMPT),
        ("placeholder", "{history}"),
        ("human", "CODEBASE CONTEXT:\n{context}\n\nQUESTION:\n{question}"),
    ])
    chain = (
        {
            "context": lambda x: _format_docs(retriever.invoke(x["question"])),
            "question": lambda x: x["question"],
            "history": lambda x: _history_to_messages(x.get("history", [])),
        }
        | prompt
        | llm
        | StrOutputParser()
    )
    return chain


# ---------------------------------------------------------------------------
# Citation formatting
# ---------------------------------------------------------------------------
def build_citation_block(docs: list[Document]) -> str:
    """Bold-Markdown citation block from unique retrieved sources."""
    seen: set[str] = set()
    for d in docs:
        src = d.metadata.get("source")
        if src:
            seen.add(str(src))
    if not seen:
        return ""
    return "\n\n**Sources:**\n" + "\n".join(f"- **{p}**" for p in sorted(seen))


# ---------------------------------------------------------------------------
# Documentation generation
# ---------------------------------------------------------------------------
README_SYSTEM = "You are a senior software engineer writing production-grade README files."
README_PROMPT = """Write a README.md for the repository described by the excerpts below.

Rules:
- Use ONLY information present in the excerpts. If something is unclear, say so.
- Be concise but complete.
- Use Markdown headings, code blocks, and bullet lists.

Sections (omit any you cannot justify from the excerpts):
1. # Project Title
2. ## Overview
3. ## Key Features
4. ## Tech Stack
5. ## Project Structure
6. ## Setup & Installation
7. ## Usage
8. ## Configuration
9. ## Contributing
10. ## License  (only if explicit evidence exists)

CODEBASE EXCERPTS:
{context}
"""

ARCH_SYSTEM = "You are a principal engineer drafting architecture specifications."
ARCH_PROMPT = """Write an ARCHITECTURE.md for the repository described by the excerpts below.

Rules:
- Use ONLY information present in the excerpts. Be explicit about unknowns.
- Prefer ASCII or Mermaid diagrams over prose where it helps.

Sections:
1. # System Overview
2. # High-Level Component Diagram (ASCII or Mermaid)
3. # Modules & Responsibilities
4. # Data Flow
5. # External Dependencies
6. # Non-Functional Considerations (only if evidence exists)
7. # Open Questions / Unknowns

CODEBASE EXCERPTS:
{context}
"""


def _invoke_llm(llm: ChatGroq, messages: list[dict]) -> str:
    resp = llm.invoke(messages)
    return getattr(resp, "content", str(resp))


def generate_document(bundle: "RagBundle", kind: str) -> str:
    """Produce a 'README.md' or 'ARCHITECTURE.md' string from the bundle's index."""
    retriever = bundle.vector_store.as_retriever(
        search_type="mmr",
        search_kwargs={"k": CHAT_RETRIEVE_K, "fetch_k": CHAT_RETRIEVE_FETCH_K},
    )
    retrieved = retriever.invoke(
        "repository structure, modules, configuration, usage, dependencies"
    )
    context = _format_docs(retrieved)
    if kind == "README.md":
        system, user, out_name = README_SYSTEM, README_PROMPT.format(context=context), "README.md"
    else:
        system, user, out_name = ARCH_SYSTEM, ARCH_PROMPT.format(context=context), "ARCHITECTURE.md"
    body = _invoke_llm(
        bundle.llm,
        [
            {"role": "system", "content": system},
            {"role": "user", "content": user},
        ],
    )
    return f"# {out_name}\n\n{body.strip()}\n"


# ---------------------------------------------------------------------------
# RagBundle: the unified result of initialize_rag_pipeline
# ---------------------------------------------------------------------------
@dataclass
class RagBundle:
    """Everything the UI needs from one pipeline initialization."""

    extracted_dir: Path
    file_count: int
    chunk_count: int
    vector_store: Chroma
    retriever: Any
    llm: ChatGroq
    qa_chain: Runnable
    directory_tree: str


# ---------------------------------------------------------------------------
# Unified entry point
# ---------------------------------------------------------------------------
def initialize_rag_pipeline(zip_file: Any, groq_api_key: str) -> RagBundle:
    """
    End-to-end RAG pipeline.

    Args:
        zip_file: A file-like (Streamlit UploadedFile), `bytes`, or `bytearray`.
        groq_api_key: Groq API key for the ChatGroq LLM.

    Returns:
        RagBundle with vector store, retriever, LLM, LCEL QA chain, and a
        textual directory tree of the extracted repo.

    Raises:
        TypeError: If `zip_file` cannot be coerced to bytes.
        ValueError: If the ZIP is malformed, or no indexable files remain
                    after `.gitignore` filtering.
    """
    zip_bytes = _coerce_zip_bytes(zip_file)

    extracted = extract_repo_zip(zip_bytes)
    spec = load_gitignore_spec(extracted)

    chunks = chunk_codebase(extracted, spec)
    file_count = sum(1 for _ in iter_candidate_files(extracted, spec))
    if not chunks:
        raise ValueError(
            "No indexable files found after applying .gitignore / excludes."
        )

    vector_store = build_vector_store(chunks)
    llm = get_llm(groq_api_key)
    retriever = vector_store.as_retriever(
        search_type="mmr",
        search_kwargs={"k": CHAT_RETRIEVE_K, "fetch_k": CHAT_RETRIEVE_FETCH_K},
    )
    qa_chain = build_qa_chain(retriever, llm)
    directory_tree = build_directory_tree(extracted, spec)

    return RagBundle(
        extracted_dir=extracted,
        file_count=file_count,
        chunk_count=len(chunks),
        vector_store=vector_store,
        retriever=retriever,
        llm=llm,
        qa_chain=qa_chain,
        directory_tree=directory_tree,
    )


def answer_with_citations(
    bundle: RagBundle, question: str, history: list[dict]
) -> str:
    """Run the LCEL QA chain and append a bold-Markdown citation block."""
    answer = bundle.qa_chain.invoke({"question": question, "history": history})
    retrieved = bundle.retriever.invoke(question)
    citations = build_citation_block(retrieved)
    return f"{answer.rstrip()}{citations}"