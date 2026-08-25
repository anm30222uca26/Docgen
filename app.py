"""
app.py — Streamlit UI for Docgen.

Thin presentation layer over core.py. All RAG / parsing / embedding /
LLM logic lives in `core`. This file only handles:
    - Streamlit page config, layout, sidebar
    - API key resolution (secrets first, sidebar fallback)
    - Upload + Process button (calls core.initialize_rag_pipeline)
    - Multi-tab workspace (Documentation Generator + Code Q&A Chat)
    - session_state persistence for the RagBundle and chat history
"""

from __future__ import annotations

from typing import List, Optional

import streamlit as st

from core import (
    EMBED_MODEL_NAME,
    GROQ_MODEL_NAME,
    LLM_TEMPERATURE,
    RagBundle,
    answer_with_citations,
    generate_document,
    initialize_rag_pipeline,
)


# ---------------------------------------------------------------------------
# API key resolution: secrets first, manual input fallback
# ---------------------------------------------------------------------------
def resolve_groq_api_key() -> str:
    """Return the Groq API key from st.secrets if present, else via sidebar."""
    try:
        if "GROQ_API_KEY" in st.secrets and st.secrets["GROQ_API_KEY"]:
            return st.secrets["GROQ_API_KEY"]
    except Exception:
        # No secrets file configured — fall through to manual input.
        pass
    return st.sidebar.text_input(
        "Groq API Key",
        type="password",
        help="Used by ChatGroq. Prefer setting GROQ_API_KEY in .streamlit/secrets.toml.",
    )


# ---------------------------------------------------------------------------
# Page setup
# ---------------------------------------------------------------------------
st.set_page_config(page_title="Docgen", page_icon="📝", layout="wide")
st.title("📝 Docgen — Repository Documentation & Code Q&A")
st.caption(
    "Upload a repo ZIP → get an auto-generated README, architecture spec, "
    "and an interactive chatbot over your code."
)

# Session state defaults.
for key, default in {
    "bundle": None,
    "last_doc": None,
    "last_doc_name": None,
    "chat_history": [],
}.items():
    st.session_state.setdefault(key, default)

# ---------------------------------------------------------------------------
# Sidebar: configuration + upload
# ---------------------------------------------------------------------------
with st.sidebar:
    st.header("1. Configuration")
    api_key = resolve_groq_api_key()

    st.header("2. Upload")
    uploaded = st.file_uploader(
        "Repository ZIP",
        type=["zip"],
        accept_multiple_files=False,
        help="ZIP archive of the local repo you want to document.",
    )

    process_btn = st.button(
        "⚙️ Process repository",
        disabled=not (uploaded and api_key),
        use_container_width=True,
    )

# ---------------------------------------------------------------------------
# Processing pipeline
# ---------------------------------------------------------------------------
if process_btn:
    if not api_key:
        st.error("Please provide a Groq API key (via secrets or the sidebar).")
        st.stop()
    if not uploaded:
        st.error("Please upload a repository ZIP file.")
        st.stop()
    try:
        with st.spinner("Extracting ZIP securely & building RAG index..."):
            bundle: RagBundle = initialize_rag_pipeline(uploaded, api_key)
        st.session_state["bundle"] = bundle
        st.session_state["chat_history"] = []
        st.success(
            f"Indexed {bundle.file_count} files into {bundle.chunk_count} chunks."
        )
    except Exception as e:
        st.exception(e)
        st.stop()

bundle: Optional[RagBundle] = st.session_state.get("bundle")
if bundle is None:
    st.info("Upload a repository ZIP and press **Process repository** to begin.")
    st.stop()

# ---------------------------------------------------------------------------
# Status header + repository tree
# ---------------------------------------------------------------------------
st.markdown(
    f"**Indexed:** {bundle.file_count} files · "
    f"{bundle.chunk_count} chunks · "
    f"Vector store: in-memory ChromaDB · LLM: `{GROQ_MODEL_NAME}` · T={LLM_TEMPERATURE}"
)

with st.expander("📂 Repository structure", expanded=False):
    st.code(bundle.directory_tree, language="text")

# ---------------------------------------------------------------------------
# Multi-tab workspace
# ---------------------------------------------------------------------------
tab_docs, tab_chat = st.tabs(["📄 Documentation Generator", "💬 Codebase Q&A Chat"])

# --- Tab 1: Documentation Generator ---------------------------------------
with tab_docs:
    st.subheader("Automated Documentation Generator")
    c1, c2 = st.columns(2)

    with c1:
        if st.button("📝 Generate README.md", use_container_width=True):
            try:
                with st.spinner("Generating README.md..."):
                    st.session_state["last_doc"] = generate_document(bundle, "README.md")
                    st.session_state["last_doc_name"] = "README.md"
            except Exception as e:
                st.exception(e)

    with c2:
        if st.button("🏗️ Generate Architecture Spec", use_container_width=True):
            try:
                with st.spinner("Generating Architecture Spec..."):
                    st.session_state["last_doc"] = generate_document(bundle, "ARCHITECTURE.md")
                    st.session_state["last_doc_name"] = "ARCHITECTURE.md"
            except Exception as e:
                st.exception(e)

    last_doc = st.session_state["last_doc"]
    last_name = st.session_state["last_doc_name"]
    if last_doc and last_name:
        st.markdown("---")
        st.markdown(f"### {last_name}")
        st.markdown(last_doc)
        st.download_button(
            label=f"⬇️ Download {last_name}",
            data=last_doc.encode("utf-8"),
            file_name=last_name,
            mime="text/markdown",
            use_container_width=True,
        )

# --- Tab 2: Codebase Q&A Chat ---------------------------------------------
with tab_chat:
    st.subheader("Ask anything about the codebase")

    history: List[dict] = st.session_state["chat_history"]
    for turn in history:
        with st.chat_message(turn["role"]):
            st.markdown(turn["content"])

    user_q = st.chat_input("Ask a question about the repo...")
    if user_q:
        history.append({"role": "user", "content": user_q})
        with st.chat_message("user"):
            st.markdown(user_q)
        try:
            with st.chat_message("assistant"):
                with st.spinner("Thinking..."):
                    # Pass prior turns (excluding the one we just appended)
                    # so the chain has short-term memory but doesn't echo
                    # the current question.
                    answer = answer_with_citations(
                        bundle,
                        user_q,
                        history[:-1][-6:],
                    )
                st.markdown(answer)
            history.append({"role": "assistant", "content": answer})
        except Exception as e:
            st.exception(e)