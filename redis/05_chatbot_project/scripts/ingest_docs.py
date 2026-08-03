"""
Ingest TechBot documentation into the Redis vector store.

Run this once before starting TechBot:
  python scripts/ingest_docs.py

In production, replace SAMPLE_DOCS with real content loaded from:
  - PDF files (use langchain_community.document_loaders.PyPDFLoader)
  - Markdown files (use langchain_community.document_loaders.TextLoader)
  - Web pages (use langchain_community.document_loaders.WebBaseLoader)
  - Notion, Confluence, etc.

And split with:
  from langchain_text_splitters import RecursiveCharacterTextSplitter
  splitter = RecursiveCharacterTextSplitter(chunk_size=500, chunk_overlap=50)
  chunks = splitter.split_documents(docs)
"""

import os
import sys
import numpy as np
from sentence_transformers import SentenceTransformer
from redisvl.index import SearchIndex

REDIS_URL = os.getenv("REDIS_URL", "redis://localhost:6379")

SAMPLE_DOCS = [
    {"text": "To install the TechBot SDK, run: pip install techbot-sdk. Requires Python 3.9 or higher.",
     "source": "manual", "category": "install", "page": 1},
    {"text": "On Windows, install the SDK using: pip install techbot-sdk. For conda: conda install -c techcorp techbot-sdk",
     "source": "manual", "category": "install", "page": 2},
    {"text": "Docker: docker pull techcorp/techbot-sdk:latest. Run with: docker run -e TECHBOT_API_KEY=your_key techcorp/techbot-sdk",
     "source": "manual", "category": "install", "page": 3},
    {"text": "Authenticate by setting TECHBOT_API_KEY environment variable. In Python: from techbot import Client; client = Client()",
     "source": "manual", "category": "auth", "page": 10},
    {"text": "Password reset: go to https://app.techcorp.com/settings/security. Click Reset Password. Tokens expire after 24 hours.",
     "source": "manual", "category": "auth", "page": 11},
    {"text": "API key rotation: Settings > API Keys > Rotate. Old keys are invalidated immediately.",
     "source": "api-ref", "category": "auth", "page": 5},
    {"text": "Billing is monthly on the 1st. View invoices at https://app.techcorp.com/billing.",
     "source": "manual", "category": "billing", "page": 20},
    {"text": "Free tier: 1,000 API calls/month. Pro ($29/month): 100,000 calls. Overage: $0.001/call.",
     "source": "manual", "category": "billing", "page": 21},
    {"text": "401 Unauthorized: your API key is invalid or expired. Verify TECHBOT_API_KEY is set correctly.",
     "source": "manual", "category": "troubleshoot", "page": 30},
    {"text": "429 Too Many Requests: you exceeded your plan's API limit. Wait for next billing cycle or upgrade.",
     "source": "manual", "category": "troubleshoot", "page": 31},
]

RAG_SCHEMA = {
    "index": {
        "name": "rag-docs",
        "prefix": "doc",
        "storage_type": "hash",
    },
    "fields": [
        {"name": "text",      "type": "text"},
        {"name": "source",    "type": "tag"},
        {"name": "category",  "type": "tag"},
        {"name": "page",      "type": "numeric"},
        {"name": "embedding", "type": "vector",
         "attrs": {
             "algorithm": "hnsw", "dims": 384,
             "distance_metric": "cosine", "datatype": "float32",
             "m": 16, "ef_construction": 200, "ef_runtime": 10,
         }},
    ],
}


def main():
    print("Loading embedding model (all-MiniLM-L6-v2)...")
    model = SentenceTransformer("all-MiniLM-L6-v2")
    print("Model loaded.")

    print(f"\nCreating Redis vector index 'rag-docs'...")
    index = SearchIndex.from_dict(RAG_SCHEMA, redis_url=REDIS_URL)
    index.create(overwrite=True)
    print("Index created.")

    print(f"\nEmbedding {len(SAMPLE_DOCS)} document chunks...")
    texts = [d["text"] for d in SAMPLE_DOCS]
    embeddings = model.encode(texts, batch_size=16, show_progress_bar=True)

    docs_to_load = []
    for i, (doc, emb) in enumerate(zip(SAMPLE_DOCS, embeddings)):
        docs_to_load.append({
            **doc,
            "embedding": np.array(emb, dtype=np.float32).tobytes(),
            "id": f"{i+1:04d}",
        })

    print("\nLoading into Redis...")
    keys = index.load(docs_to_load, id_field="id")
    print(f"Loaded {len(keys)} documents.")

    info = index.info()
    print(f"\nIndex stats:")
    print(f"  Name:     {info['index_name']}")
    print(f"  Docs:     {info['num_docs']}")
    print(f"  Indexing: done")
    print("\nIngest complete. TechBot's knowledge base is ready.")


if __name__ == "__main__":
    main()
