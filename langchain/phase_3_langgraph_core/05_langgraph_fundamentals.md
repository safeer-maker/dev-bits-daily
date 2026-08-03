# Module 05: LangGraph Fundamentals

Welcome to Phase 3. Up until now, we've used LangChain Expression Language (LCEL) which creates Directed Acyclic Graphs (DAGs). This means data flows in a straight line from start to finish.

**The Problem:** Real-world reasoning isn't a straight line. If an agent tries a tool and fails, it needs to loop back and try again. It needs cycles.

**The Solution:** LangGraph. LangGraph treats your workflow as a state machine. It is built on three pillars:
1.  **State:** A shared data structure (usually a `TypedDict`) passed between all steps.
2.  **Nodes:** Python functions that read the State, do some work (like call an LLM), and return updates to the State.
3.  **Edges:** The logic that dictates which Node runs next.

We need to install LangGraph:
```bash
pip install langgraph
```

## 1. Defining the Graph

**Scenario:** We are going to build a simple workflow that writes a paragraph, and then automatically proofreads it.

Create `05_basics.py`:

```python
from typing import TypedDict, Annotated
from langgraph.graph import StateGraph, START, END
from dotenv import load_dotenv
from langchain_google_genai import ChatGoogleGenerativeAI
from langchain_core.messages import HumanMessage

load_dotenv()
llm = ChatGoogleGenerativeAI(model="gemini-1.5-flash", temperature=0.7)

# 1. Define the State
# This is the 'memory' of the graph. Every node receives this dictionary.
class GraphState(TypedDict):
    topic: str
    draft: str
    feedback: str
    final_version: str

# 2. Define the Nodes (The workers)
# Each node takes the state, does something, and returns a dict with updates.

def write_draft_node(state: GraphState):
    print("--- Writing Draft ---")
    topic = state["topic"]
    prompt = f"Write a 2-sentence draft about: {topic}"
    response = llm.invoke([HumanMessage(content=prompt)])
    
    # We return ONLY the keys we want to update in the state
    return {"draft": response.content}

def proofread_node(state: GraphState):
    print("--- Proofreading ---")
    draft = state["draft"]
    prompt = f"Proofread this text and fix any grammatical errors or improve flow. Return ONLY the final text.\n\nText: {draft}"
    response = llm.invoke([HumanMessage(content=prompt)])
    
    return {"final_version": response.content}

# 3. Build the Graph
# Initialize the graph with our State schema
workflow = StateGraph(GraphState)

# Add our nodes to the graph
workflow.add_node("writer", write_draft_node)
workflow.add_node("proofreader", proofread_node)

# Define the edges (the flow)
# START -> writer -> proofreader -> END
workflow.add_edge(START, "writer")
workflow.add_edge("writer", "proofreader")
workflow.add_edge("proofreader", END)

# 4. Compile the Graph
# This turns the definition into an executable application
app = workflow.compile()

# 5. Run it!
initial_state = {"topic": "The importance of data cleaning in Machine Learning"}

# .invoke() runs the graph until it hits END
final_state = app.invoke(initial_state)

print("\n=== FINAL STATE ===")
print("Draft:\n", final_state["draft"])
print("\nFinal Version:\n", final_state["final_version"])
```

Run this file. Notice how the data flows perfectly from one function to the next, orchestrated entirely by LangGraph.

## 2. The `add_messages` Reducer

In our example above, when a node returns `{"draft": "new text"}`, it *overwrites* the existing draft in the state. 

But what about conversation history? We don't want to overwrite messages; we want to *append* them. LangGraph provides reducers for this, the most common being `add_messages` from `langgraph.graph.message`.

```python
from langgraph.graph.message import add_messages
from langchain_core.messages import BaseMessage
from typing import TypedDict, Annotated

class ChatState(TypedDict):
    # Annotated tells LangGraph: "Don't overwrite this key. Apply the add_messages function instead."
    messages: Annotated[list[BaseMessage], add_messages]
```
If a node returns `{"messages": [AIMessage("Hello!")]}`, LangGraph will automatically append "Hello!" to the existing list of messages rather than replacing it.

### Hands-on Exercise
*   Add a third node to the `05_basics.py` graph called `translate_node`.
*   Have it take the `final_version` and translate it into a language of your choice.
*   Update the `GraphState` and the edges so the flow is: START -> writer -> proofreader -> translator -> END.

---
**Next up:** Linear graphs are boring. In Module 06, we will make our graph dynamic with Conditional Edges!
