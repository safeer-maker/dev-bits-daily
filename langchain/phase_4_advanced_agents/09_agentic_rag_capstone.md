# Module 09: Capstone - Agentic RAG Research Assistant

This is it. The culmination of the course. We are going to build a system that incorporates:
1.  **pgvector Local RAG** (from Mod 04)
2.  **Adaptive Routing** (from Mod 06)
3.  **Self-Correction / CRAG** (Evaluating document relevance)
4.  **Web Search Fallback** (from Mod 02)
5.  **Human-in-the-Loop** (from Mod 07)

**Architecture Flow:**
`START` -> `Router`
- IF ChitChat -> `ChitChat Handler` -> `END`
- IF Research -> `Vector Retriever (pgvector)` -> `Grader`

From `Grader`:
- IF Docs Relevant -> `Generator`
- IF Docs Irrelevant -> `Web Search` -> `Generator`

From `Generator`:
- -> `Human Review (HITL)` -> `END`

## The Code Structure

Because this is a large system, I am providing the skeleton and the complex node logic. Your task is to wire it together.

Create `09_capstone.py`:

```python
from typing import Annotated, Literal, TypedDict
from pydantic import BaseModel, Field
from langgraph.graph import StateGraph, START, END
from langgraph.checkpoint.memory import MemorySaver
from langchain_google_genai import ChatGoogleGenerativeAI
from langchain_core.messages import HumanMessage
from langchain_community.tools import DuckDuckGoSearchRun
# (Assume you import your pgvector setup from Mod 04 here)
from dotenv import load_dotenv

load_dotenv()
llm = ChatGoogleGenerativeAI(model="gemini-1.5-pro", temperature=0) # Use pro for complex reasoning
web_search = DuckDuckGoSearchRun()

# --- 1. STATE ---
class GraphState(TypedDict):
    question: str
    documents: list[str] # Retrieved text chunks
    final_answer: str
    needs_human_approval: bool

# --- 2. NODES ---

# 2a. Router
class RouteQuery(BaseModel):
    destination: Literal["chitchat", "vector_search"]

def router_node(state: GraphState):
    print("-> ROUTER")
    router_llm = llm.with_structured_output(RouteQuery)
    result = router_llm.invoke(f"Classify: {state['question']}")
    # We don't update state here, the conditional edge function will just read the LLM response
    return {"destination": result.destination} # Temporary pass-through

# 2b. Retrieval Node (pgvector simulation)
def retrieve_node(state: GraphState):
    print("-> RETRIEVING FROM PGVECTOR")
    # In reality: docs = pg_retriever.invoke(state['question'])
    # For now, simulate:
    simulated_docs = ["AI scaling laws suggest performance increases with compute.", "Transformers use self-attention."]
    return {"documents": simulated_docs}

# 2c. The CRAG Grader (Corrective RAG)
class Grade(BaseModel):
    binary_score: Literal["yes", "no"] = Field(description="Are the documents relevant to the question?")

def grade_documents_node(state: GraphState):
    print("-> GRADING DOCUMENTS")
    question = state["question"]
    docs = state["documents"]
    
    grading_prompt = f"Does this document answer the question?\nQuestion: {question}\nDoc: {docs}\nRespond yes or no."
    grader_llm = llm.with_structured_output(Grade)
    result = grader_llm.invoke(grading_prompt)
    
    if result.binary_score == "yes":
        print("   Docs are GOOD.")
        return {"relevance": "relevant"} # Temp pass-through
    else:
        print("   Docs are BAD. Falling back to web.")
        return {"relevance": "irrelevant"}

# 2d. Web Search Fallback
def web_search_node(state: GraphState):
    print("-> WEB SEARCHING")
    search_result = web_search.invoke(state["question"])
    # OVERWRITE the bad local documents with the web results
    return {"documents": [search_result]}

# 2e. Generation Node
def generate_node(state: GraphState):
    print("-> GENERATING ANSWER")
    prompt = f"Answer '{state['question']}' using this context: {state['documents']}"
    response = llm.invoke([HumanMessage(content=prompt)])
    # Flag it for human review
    return {"final_answer": response.content, "needs_human_approval": True}

# 2f. Human Review Node
def human_review_node(state: GraphState):
    pass # Empty, just for the checkpoint interrupt

# --- 3. EDGES & ROUTING LOGIC ---

def route_initial(state: GraphState) -> str:
    # Requires calling LLM inside the edge or reading from a pass-through node
    # Let's assume we read from the router pass-through
    pass # YOUR TURN TO IMPLEMENT

def decide_to_generate(state: GraphState) -> str:
    # Based on the grader's output, go to 'generate' OR 'web_search'
    pass # YOUR TURN TO IMPLEMENT

# --- 4. BUILD THE GRAPH (YOUR TURN) ---
# workflow = StateGraph(GraphState)
# ... add nodes
# ... add edges
# ... add conditional edges
# app = workflow.compile(checkpointer=MemorySaver(), interrupt_before=["human_review"])
```

### The Ultimate Challenge
1.  Complete the `09_capstone.py` file by filling in the "YOUR TURN" sections.
2.  Integrate your actual pgvector connection from Module 04 into `retrieve_node`.
3.  Write the execution loop (like in Mod 07) that runs the graph, catches the human interrupt, prints the `final_answer`, asks you to approve it, and then finishes.

**Congratulations!** If you can build this, you have mastered the current state-of-the-art in Agentic workflows for 2026. You now know how to combine structured generation, local vector databases, routing, self-reflection, and safety boundaries.
