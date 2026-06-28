import threading
from pathlib import Path
from typing import Optional

from langchain_text_splitters import RecursiveCharacterTextSplitter
from langchain_classic.retrievers.parent_document_retriever import ParentDocumentRetriever
from langchain_community.vectorstores import FAISS
from langchain_core.stores import InMemoryByteStore
from langchain_core.documents import Document
from langchain_google_genai import GoogleGenerativeAIEmbeddings
from sentence_transformers import CrossEncoder

from config import GOOGLE_API_KEY

FAISS_INDEX_DIR = Path(__file__).parent / "data" / "faiss_index"

_embeddings = GoogleGenerativeAIEmbeddings(
    model="models/text-embedding-004",
    google_api_key=GOOGLE_API_KEY,
)

_child_splitter = RecursiveCharacterTextSplitter(
    chunk_size=600,
    chunk_overlap=60,
    separators=["\n\n", ".\n", ". ", "\n", " "],
)

_parent_splitter = RecursiveCharacterTextSplitter(
    chunk_size=3200,
    chunk_overlap=200,
    separators=["\n\n\n", "\n\n", ".\n", "\n"],
)

_lock = threading.Lock()
_store = InMemoryByteStore()
_vectorstore: FAISS | None = None
_retriever: ParentDocumentRetriever | None = None

_reranker: CrossEncoder | None = None
_reranker_lock = threading.Lock()


def _get_reranker() -> CrossEncoder:
    global _reranker
    if _reranker is not None:
        return _reranker
    with _reranker_lock:
        if _reranker is None:
            _reranker = CrossEncoder("BAAI/bge-reranker-base")
        return _reranker


def _load_or_create_vectorstore() -> FAISS:
    global _vectorstore
    if _vectorstore is not None:
        return _vectorstore
    if FAISS_INDEX_DIR.exists():
        _vectorstore = FAISS.load_local(
            str(FAISS_INDEX_DIR),
            _embeddings,
            allow_dangerous_deserialization=True,
        )
    else:
        _vectorstore = FAISS.from_texts(["__init__"], _embeddings)
    return _vectorstore


def _get_retriever() -> ParentDocumentRetriever:
    global _retriever
    if _retriever is not None:
        return _retriever
    vs = _load_or_create_vectorstore()
    _retriever = ParentDocumentRetriever(
        vectorstore=vs,
        docstore=_store,
        child_splitter=_child_splitter,
        parent_splitter=_parent_splitter,
    )
    return _retriever


def ingest(
    text: str,
    source: str = "upload",
    grade_level: Optional[str] = None,
    reading_difficulty: Optional[str] = None,
) -> int:
    with _lock:
        retriever = _get_retriever()
        metadata: dict = {"source": source}
        if grade_level is not None:
            metadata["grade_level"] = str(grade_level)
        if reading_difficulty is not None:
            metadata["reading_difficulty"] = reading_difficulty
        doc = Document(page_content=text, metadata=metadata)
        parent_docs = _parent_splitter.split_documents([doc])
        retriever.add_documents(parent_docs)
        FAISS_INDEX_DIR.parent.mkdir(parents=True, exist_ok=True)
        retriever.vectorstore.save_local(str(FAISS_INDEX_DIR))
        return len(parent_docs)


def _rerank(query: str, docs: list[Document], top_k: int) -> list[Document]:
    if not docs:
        return docs
    reranker = _get_reranker()
    pairs = [(query, doc.page_content) for doc in docs]
    scores = reranker.predict(pairs)
    ranked = sorted(zip(scores, docs), key=lambda x: x[0], reverse=True)
    return [doc for _, doc in ranked[:top_k]]


def _metadata_filter(
    docs: list[Document],
    grade_level: Optional[str],
    reading_difficulty: Optional[str],
) -> list[Document]:
    if grade_level is None and reading_difficulty is None:
        return docs
    filtered = []
    for doc in docs:
        meta = doc.metadata
        if grade_level is not None and "grade_level" in meta:
            if meta["grade_level"] != str(grade_level):
                continue
        if reading_difficulty is not None and "reading_difficulty" in meta:
            if meta["reading_difficulty"] != reading_difficulty:
                continue
        filtered.append(doc)
    return filtered or docs


def retrieve(
    query: str,
    k: int = 4,
    grade_level: Optional[str] = None,
    reading_difficulty: Optional[str] = None,
) -> list[Document]:
    with _lock:
        retriever = _get_retriever()
        retriever.search_kwargs = {"k": 12}
        candidates = retriever.invoke(query)
    candidates = _metadata_filter(candidates, grade_level, reading_difficulty)
    return _rerank(query, candidates, k)
