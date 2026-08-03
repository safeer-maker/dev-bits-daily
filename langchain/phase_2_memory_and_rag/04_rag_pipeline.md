# Module 04: Production RAG Pipeline with pgvector

Welcome to the most critical module for enterprise AI. We are building a **Retrieval-Augmented Generation (RAG)** pipeline.

**Scenario:** You need a "Document Q&A Bot" that can answer technical questions based on a local folder of AI/ML Research papers.

Instead of a toy vector store, we are using **PostgreSQL** with the **`pgvector`** extension. This is the industry standard for production. We will use **HuggingFace** `sentence-transformers` for 100% local, free, GPU-accelerated embeddings.

## 1. Infrastructure Setup (pgvector)

You need a running PostgreSQL instance with `pgvector` installed. The easiest way to do this locally is using Docker.

```bash
# Run a PostgreSQL database with pgvector pre-installed via Docker
docker run --name pgvector-db \
  -e POSTGRES_USER=postgres \
  -e POSTGRES_PASSWORD=postgres \
  -e POSTGRES_DB=rag_db \
  -p 5432:5432 \
  -d pgvector/pgvector:pg16
```

Now, install the Python dependencies:
```bash
pip install langchain langchain-community langchain-huggingface sentence-transformers psycopg2-binary pgvector pypdf
```

## 2. Document Loading and Splitting

Before we can embed text, we need to load PDFs and chop them into smaller chunks. Let's create a script `04_rag_ingest.py`.

```python
import os
from langchain_community.document_loaders import PyPDFDirectoryLoader
from langchain_text_splitters import RecursiveCharacterTextSplitter

# 1. Create a directory and put some sample AI research PDFs in it
os.makedirs("research_papers", exist_ok=True)
# -> PAUSE: Put a couple of sample PDF files inside the 'research_papers' folder!

# 2. Load Documents
print("Loading documents...")
loader = PyPDFDirectoryLoader("research_papers")
docs = loader.load()
print(f"Loaded {len(docs)} pages.")

# 3. Split Documents
# We split text so the vector search is granular.
# overlap ensures we don't cut a sentence in half and lose meaning.
text_splitter = RecursiveCharacterTextSplitter(
    chunk_size=1000, 
    chunk_overlap=200
)
chunks = text_splitter.split_documents(docs)
print(f"Split into {len(chunks)} chunks.")
```

## 3. Local Embeddings & pgvector Ingestion

Now, we convert those text chunks into numbers (vectors) and store them in Postgres.

Add this to the bottom of `04_rag_ingest.py`:

```python
from langchain_huggingface import HuggingFaceEmbeddings
from langchain_community.vectorstores import PGVector

# 4. Initialize Local Embeddings
# This will download the model the first time you run it. It runs on your local CPU/GPU.
# all-MiniLM-L6-v2 is fast and creates 384-dimensional vectors.
print("Initializing HuggingFace Embeddings...")
embeddings = HuggingFaceEmbeddings(model_name="sentence-transformers/all-MiniLM-L6-v2")

# 5. Connect to pgvector
CONNECTION_STRING = "postgresql+psycopg2://postgres:postgres@localhost:5432/rag_db"
COLLECTION_NAME = "ml_papers"

print("Inserting chunks into pgvector database...")
# This step might take a minute depending on how many PDFs you added
db = PGVector.from_documents(
    documents=chunks,
    embedding=embeddings,
    collection_name=COLLECTION_NAME,
    connection_string=CONNECTION_STRING,
    pre_delete_collection=True # Clears the DB if we re-run the script
)
print("Ingestion complete!")
```
Run `python 04_rag_ingest.py`.

*Under the hood:* `PGVector` creates a table called `langchain_pg_embedding` in your Postgres database. The vector column uses a special `VECTOR(384)` type, which allows for extremely fast Cosine Similarity searches using SQL queries like `ORDER BY embedding <=> query_vector`.

## 4. The Retrieval & Generation Pipeline

Now let's query the database and ask the LLM to generate an answer. Create `04_rag_query.py`.

```python
from dotenv import load_dotenv
from langchain_google_genai import ChatGoogleGenerativeAI
from langchain_huggingface import HuggingFaceEmbeddings
from langchain_community.vectorstores import PGVector
from langchain_core.prompts import ChatPromptTemplate
from langchain_core.runnables import RunnablePassthrough
from langchain_core.output_parsers import StrOutputParser

load_dotenv()

# 1. Re-initialize Embeddings and DB Connection
embeddings = HuggingFaceEmbeddings(model_name="sentence-transformers/all-MiniLM-L6-v2")
CONNECTION_STRING = "postgresql+psycopg2://postgres:postgres@localhost:5432/rag_db"
COLLECTION_NAME = "ml_papers"

# We connect to the existing database
db = PGVector(
    collection_name=COLLECTION_NAME,
    connection_string=CONNECTION_STRING,
    embedding_function=embeddings,
)

# 2. Create the Retriever
# We ask it to return the top 4 most similar chunks
retriever = db.as_retriever(search_kwargs={"k": 4})

# 3. Setup the LLM and Prompt
llm = ChatGoogleGenerativeAI(model="gemini-1.5-flash", temperature=0)

template = """Answer the question based ONLY on the following context.
If you cannot answer based on the context, say "I don't know based on the provided documents".

Context:
{context}

Question: {question}

Answer:"""
prompt = ChatPromptTemplate.from_template(template)

# Helper function to join the chunks into a single string
def format_docs(docs):
    return "\n\n".join(doc.page_content for doc in docs)

# 4. Build the RAG Chain using LCEL
# RunnablePassthrough() passes the original question through to the prompt
rag_chain = (
    {"context": retriever | format_docs, "question": RunnablePassthrough()}
    | prompt
    | llm
    | StrOutputParser()
)

# 5. Query time!
query = "What is the main finding or topic discussed in the documents?"
print(f"Question: {query}\n")

# Let's see what documents it actually retrieved first (for debugging)
retrieved_docs = retriever.invoke(query)
print(f"--- Retrieved {len(retrieved_docs)} chunks ---")
# print(retrieved_docs[0].page_content) # Uncomment to peek at the raw text

print("\n--- Final Answer ---")
result = rag_chain.invoke(query)
print(result)
```

Run `python 04_rag_query.py` and ask specific questions about the PDFs you provided!

### Hands-on Exercise
*   Connect to your Postgres database using a tool like `psql` or DBeaver (`psql -h localhost -U postgres -d rag_db`).
*   Run this SQL query to see your raw vector embeddings: `SELECT document, embedding FROM langchain_pg_embedding LIMIT 2;`
*   Modify `04_rag_query.py` to print the metadata (like the source filename and page number) alongside the generated answer, so users know where the answer came from.

---
**Next up:** Phase 3! We abandon linear pipelines and enter the world of Agentic Workflows with LangGraph.
