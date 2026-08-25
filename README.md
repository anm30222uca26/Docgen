# Docgen — Repository Analyzer

A local-first **Streamlit app** that ingests a ZIP of any software
repository and produces **automated documentation** (README + Architecture
Spec) and an **interactive chatbot** over the code.

Powered by:

- 🧠 [**Groq `openai/gpt-oss-120b`**](https://console.groq.com/) — long-context LLM for generation & chat
- 🔍 [**BAAI/bge-small-en-v1.5**](https://huggingface.co/BAAI/bge-small-en-v1.5) — HuggingFace embeddings
- 🗂️ [**ChromaDB**](https://www.trychroma.com/) — ephemeral, in-memory vector store
- 🖥️ [**Streamlit**](https://streamlit.io/) — multi-tab dashboard UI

## What it does

1. Upload a `.zip` of any codebase.
2. The app extracts it safely with `tempfile.mkdtemp`, applies the repo's
   own `.gitignore` via `pathspec`, reads files with an encoding-safe
   fallback chain, and chunks the code.
3. Chunks are embedded and indexed in a **fresh in-memory ChromaDB instance**.
4. **Tab 1 — Documentation Generator** produces a `README.md` or
   `ARCHITECTURE.md` with one click and lets you download the result.
5. **Tab 2 — Codebase Q&A** is a RAG chatbot that answers questions and
   cites the exact files it pulled context from.

## Prerequisites

- **Python 3.10+**
- A **Groq API key** — grab one at <https://console.groq.com/keys>

## Quick start

```bash
# 1. Create and activate a virtual environment
python -m venv .venv

# Windows (PowerShell)
.\.venv\Scripts\Activate.ps1
# Windows (cmd)
.\.venv\Scripts\activate.bat
# macOS / Linux
# source .venv/bin/activate

# 2. Install dependencies
pip install -r requirements.txt

# 3. (Optional) Provide your Groq key via Streamlit secrets
mkdir -p .streamlit
echo 'GROQ_API_KEY = "gsk_your_key_here"' > .streamlit/secrets.toml

# 4. Launch the app
streamlit run app.py
```

The app opens at <http://localhost:8501>.

> Skip step 3 and the sidebar will prompt you to paste the key on first
> upload. Skip step 1 at your own risk — installing into the system Python
> is fragile and not recommended.

## Security notes

- `.streamlit/secrets.toml` is **gitignored** — never commit your API key.
- Uploaded ZIPs are extracted into a fresh `tempfile.mkdtemp` directory
  and never persisted after the Streamlit process exits.
- The vector store is **ephemeral**: no embeddings are written to disk,
  no cache survives a restart.

## Project structure

```
.
├── app.py              # Streamlit app (UI + RAG pipeline)
├── requirements.txt    # Pinned dependencies
├── .gitignore          # Venvs, secrets, caches, OS junk
└── README.md           # You are here
```

## License

Add your license of choice (MIT / Apache-2.0 / etc.) before publishing.