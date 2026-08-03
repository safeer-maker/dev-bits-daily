# LangChain & LangGraph: Zero to Production Agentic Workflows

Welcome to the comprehensive, hands-on guide to building advanced AI systems using LangChain and LangGraph.

This course is designed for **active learning**. Instead of running pre-written notebooks, you will follow these markdown guides, write the code yourself, and build the systems piece by piece. Getting your hands dirty is the best way to master agentic workflows!

## Core Tech Stack
*   **LLM:** Google Gemini API (`langchain-google-genai`)
*   **Embeddings:** Local GPU via HuggingFace `sentence-transformers`
*   **Vector Store:** PostgreSQL with `pgvector` (for production-grade RAG)
*   **Orchestration:** LangChain & LangGraph
*   **Domain:** AI/ML Research Papers

## Course Structure

The course is divided into four phases. You should create your own python files (e.g., `app.py`) or Jupyter notebooks to follow along with the code snippets provided in each module.

### Phase 1: Foundations
*   **01. Chains & Prompts:** Building your first dynamic LLM pipelines, using LCEL, and generating structured output.
*   **02. Tools & Agents:** Giving your LLM arms and legs by creating tools (like web search) and building a basic ReAct agent.

### Phase 2: Memory & Advanced RAG (with pgvector)
*   **03. Memory & Persistence:** Giving your agents the ability to remember past conversations using SQLite.
*   **04. Production RAG with pgvector:** A deep dive into setting up PostgreSQL with the `pgvector` extension, generating local embeddings, and building a robust document retrieval system over AI/ML research papers.

### Phase 3: LangGraph Core
*   **05. LangGraph Fundamentals:** Moving from linear chains to stateful, cyclic graphs.
*   **06. Conditional Routing:** Building decision engines that route queries dynamically.
*   **07. Human-in-the-Loop (HITL):** Adding safety and approval steps to your AI workflows.

### Phase 4: Advanced Agents & Capstone
*   **08. Multi-Agent Supervisor:** Building a team of specialized AI agents coordinated by a supervisor.
*   **09. Agentic RAG Capstone:** Combining Adaptive RAG, Corrective RAG (CRAG), Self-RAG, and HITL into a massive, production-grade AI Research Assistant.

## Setup Instructions

Before starting Phase 1, ensure your environment is ready.

1.  **Virtual Environment:**
    ```bash
    python -m venv .venv
    source .venv/bin/activate
    ```

2.  **Install Core Dependencies:**
    ```bash
    pip install langchain langchain-core langchain-google-genai python-dotenv
    ```

3.  **Environment Variables:**
    Create a `.env` file in the root of this `langchain` directory:
    ```env
    GOOGLE_API_KEY=your_gemini_api_key_here
    ```

Ready? Head over to `phase_1_foundations/01_chains_and_prompts.md` to begin!
