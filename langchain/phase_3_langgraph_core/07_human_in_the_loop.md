# Module 07: Human in the Loop (HITL)

When building autonomous agents (especially ones that send emails, modify databases, or make financial decisions), you cannot trust them blindly. You need a **Human-in-the-Loop**.

LangGraph makes this incredibly easy via "Checkpointers" and the `interrupt_before` argument.

**Scenario:** A content generation pipeline where the LLM writes a draft, but the system PAUSES and waits for a human to type "approve" or "reject" before finalizing it.

## 1. Setting up Checkpointing

To pause a graph, the graph's state must be saved somewhere. We use `MemorySaver` for local development.

Create `07_hitl.py`:

```python
from typing import TypedDict
from langgraph.graph import StateGraph, START, END
from langgraph.checkpoint.memory import MemorySaver
from dotenv import load_dotenv
from langchain_google_genai import ChatGoogleGenerativeAI
from langchain_core.messages import HumanMessage

load_dotenv()
llm = ChatGoogleGenerativeAI(model="gemini-1.5-flash", temperature=0.7)

class ApprovalState(TypedDict):
    topic: str
    draft: str
    approved: bool

# Node 1: Writer
def write_node(state: ApprovalState):
    print("\n[AI] Writing draft...")
    response = llm.invoke([HumanMessage(content=f"Write a 1-sentence hot take about: {state['topic']}")])
    return {"draft": response.content, "approved": False}

# Node 2: The Action Node (We only want this to run IF approved)
def publish_node(state: ApprovalState):
    print("\n[SYSTEM] PUBLISHING TO PRODUCTION:", state["draft"])
    return state

# Node 3: The Human Node (This is a dummy node just to attach the interrupt to)
# Note: The logic happens OUTSIDE the graph, when we resume it.
def human_review_node(state: ApprovalState):
    pass # Does nothing, just a placeholder for the graph visual

# Conditional Edge: Proceed only if approved
def check_approval(state: ApprovalState) -> str:
    if state.get("approved"):
        return "publish_node"
    else:
        return "write_node" # Rewrite if rejected!

# Build Graph
workflow = StateGraph(ApprovalState)
workflow.add_node("writer", write_node)
workflow.add_node("human_review", human_review_node)
workflow.add_node("publish_node", publish_node)

workflow.add_edge(START, "writer")
workflow.add_edge("writer", "human_review")
workflow.add_conditional_edges("human_review", check_approval)
workflow.add_edge("publish_node", END)

# === THE MAGIC HAPPENS HERE ===
memory = MemorySaver()

# We compile the graph, telling it to pause BEFORE executing 'human_review'
# We MUST pass a checkpointer so it can save state while paused.
app = workflow.compile(
    checkpointer=memory,
    interrupt_before=["human_review"]
)

# ---------------------------------------------------------
# INTERACTIVE EXECUTION SIMULATION
# ---------------------------------------------------------

# 1. We must define a thread_id so the checkpointer knows which session to pause/resume
thread_config = {"configurable": {"thread_id": "session_001"}}

print("=== STARTING WORKFLOW ===")
# 2. Run the graph. It will run 'writer', then pause BEFORE 'human_review'.
initial_state = {"topic": "Tabs vs Spaces in coding"}
for event in app.stream(initial_state, thread_config, stream_mode="values"):
    pass # Just consume the stream

# 3. Check the state while paused
current_state = app.get_state(thread_config)
print("\n=== GRAPH PAUSED ===")
print("Next node to execute:", current_state.next) # Should say ('human_review',)
print("Current Draft:", current_state.values.get("draft"))

# 4. Prompt the human
user_input = input("\nDo you approve this draft? (yes/no): ").strip().lower()

# 5. Update the state based on human input
if user_input == "yes":
    # We use update_state to artificially inject data into the graph mid-flight!
    app.update_state(thread_config, {"approved": True})
else:
    app.update_state(thread_config, {"approved": False})

print("\n=== RESUMING WORKFLOW ===")
# 6. Resume the graph by calling invoke/stream with NO input (None)
# It picks up exactly where it left off, using the new state.
for event in app.stream(None, thread_config, stream_mode="values"):
    pass
```

Run the script.
When the AI generates a hot take, type `no`. You will see it loop back, rewrite the draft, and pause again! 
When you finally type `yes`, it will move to the publish node and end.

### Hands-on Exercise
*   Modify `app.update_state` so that if the human types "no", they can also provide a *reason* (e.g., "Make it funnier").
*   Add a `feedback` key to your `ApprovalState`.
*   Update the `write_node` prompt to incorporate the `state.get('feedback')` if it exists, so the AI knows *why* it was rejected.

---
**Next up:** Phase 4. We combine everything into Multi-Agent architectures!
