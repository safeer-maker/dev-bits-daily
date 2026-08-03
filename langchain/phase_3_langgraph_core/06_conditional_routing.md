# Module 06: Conditional Routing

This is where LangGraph shines. We are going to build logic that decides *which* node to go to next based on the data inside the state.

**Scenario:** A Smart Router. A user asks a question. If the question is about "greeting" or "chit-chat", we route it to a fast, cheap generic LLM node. If it requires search, we route it to a Web Search node.

## 1. The Conditional Edge Concept

A Conditional Edge is a function that looks at the `state` and returns a string. That string dictates which node runs next.

Create `06_routing.py`:

```python
from typing import TypedDict, Literal
from langgraph.graph import StateGraph, START, END
from dotenv import load_dotenv
from langchain_google_genai import ChatGoogleGenerativeAI
from langchain_core.messages import HumanMessage
from pydantic import BaseModel, Field

load_dotenv()
llm = ChatGoogleGenerativeAI(model="gemini-1.5-flash", temperature=0)

# 1. State
class RouterState(TypedDict):
    question: str
    category: str
    answer: str

# 2. Nodes

# Node A: The Router (Analyzes the question)
# We use Pydantic to force the LLM to output a specific category
class RouteClassification(BaseModel):
    category: Literal["chitchat", "search"] = Field(
        description="Classify the question. If it requires external knowledge, choose 'search'. Otherwise 'chitchat'."
    )

def categorize_node(state: RouterState):
    print("--- Categorizing Question ---")
    question = state["question"]
    structured_llm = llm.with_structured_output(RouteClassification)
    result = structured_llm.invoke(question)
    return {"category": result.category}

# Node B: The ChitChat Handler
def chitchat_node(state: RouterState):
    print("--- Handling ChitChat ---")
    response = llm.invoke([HumanMessage(content=state["question"])])
    return {"answer": response.content}

# Node C: The Search Handler (Simulated for this module)
def search_node(state: RouterState):
    print("--- Simulating Web Search ---")
    # In reality, you'd call DuckDuckGo or Tavily here
    return {"answer": f"I searched the web. The answer to '{state['question']}' is 42."}


# 3. The Conditional Edge Function
# This function decides the next step based on the state
def route_question(state: RouterState) -> str:
    category = state["category"]
    if category == "chitchat":
        return "chitchat_node" # Return the exact name of the target node
    elif category == "search":
        return "search_node"
    return END # Safety catch

# 4. Build the Graph
workflow = StateGraph(RouterState)

workflow.add_node("categorizer", categorize_node)
workflow.add_node("chitchat_node", chitchat_node)
workflow.add_node("search_node", search_node)

# Flow: START -> categorizer
workflow.add_edge(START, "categorizer")

# Flow: categorizer -> [CONDITION] -> (chitchat_node OR search_node)
# add_conditional_edges takes: (source_node, conditional_function)
workflow.add_conditional_edges(
    "categorizer",
    route_question
)

# Flow: Regardless of which handler runs, go to END afterward
workflow.add_edge("chitchat_node", END)
workflow.add_edge("search_node", END)

app = workflow.compile()

# --- Test the Router ---
print("\nTest 1: Normal greeting")
res1 = app.invoke({"question": "Hi, how are you today?"})
print("Final Answer:", res1["answer"])

print("\nTest 2: Requires search")
res2 = app.invoke({"question": "Who is the current CEO of OpenAI?"})
print("Final Answer:", res2["answer"])
```

Run the script. Watch the print statements carefully. You will see that the system dynamically routes execution based on the LLM's classification!

## 2. Cycles (Loops)

Conditional edges are also how you create **loops**. 

Imagine you add a `grade_answer_node` right before `END`. 
The conditional edge `check_quality` looks at the state. 
- If `state["quality"] == "good"`, return `END`.
- If `state["quality"] == "bad"`, return `"search_node"` (looping back to try again).

This is the exact mechanism behind Self-RAG and reflection agents, which we will build in Phase 4.

### Hands-on Exercise
*   Replace the simulated `search_node` with the DuckDuckGo search tool we used in Module 02. Let it actually search the web to answer the question!

---
**Next up:** Module 07 covers Human-in-the-Loop, allowing us to pause graphs for manual approval.
