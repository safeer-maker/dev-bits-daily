# Module 08: Multi-Agent Supervisor Pattern

We are now in Phase 4. Instead of one massive prompt trying to do everything, modern AI architecture uses multiple specialized agents that collaborate. 

**The Problem:** If you have 3 agents (Researcher, Writer, Reviewer), how do they know when to speak? If they all talk at once, it's chaos. If they just pass data in a circle, they might get stuck in an infinite loop.

**The Solution:** The Supervisor Pattern. We create a "Manager" LLM whose *only* job is to look at the conversation state, decide who should work next, and route the workflow accordingly.

## 1. The Architecture

1.  **State:** A shared message history (`add_messages`).
2.  **Supervisor:** Analyzes the messages, outputs structured JSON selecting the next agent (or "FINISH").
3.  **Workers:** Nodes that act as independent agents with specific system prompts. They append their output to the shared message history.

Create `08_supervisor.py`:

```python
from typing import Annotated, Literal, TypedDict
from langchain_core.messages import BaseMessage, HumanMessage
from langchain_google_genai import ChatGoogleGenerativeAI
from langchain_core.prompts import ChatPromptTemplate, MessagesPlaceholder
from langgraph.graph import StateGraph, START, END
from langgraph.graph.message import add_messages
from pydantic import BaseModel, Field
from dotenv import load_dotenv

load_dotenv()
llm = ChatGoogleGenerativeAI(model="gemini-1.5-flash", temperature=0.2)

# 1. State
class AgentState(TypedDict):
    # The reducer allows all agents to append to the same chat history
    messages: Annotated[list[BaseMessage], add_messages]
    next_agent: str # Who is supposed to run next?

# 2. Worker Agents (Helper function to create them easily)
def create_agent(system_prompt: str):
    prompt = ChatPromptTemplate.from_messages([
        ("system", system_prompt),
        MessagesPlaceholder(variable_name="messages"),
    ])
    # The agent is just a prompt chained to the LLM
    return prompt | llm

# Initialize our specialized workers
researcher_agent = create_agent("You are a Web Researcher. Provide detailed facts and data based on the user request. Prefix your response with [RESEARCHER].")
writer_agent = create_agent("You are a Creative Writer. Take the facts provided by the Researcher and write a compelling, 2-paragraph story or article. Prefix your response with [WRITER].")

# Node wrappers for our workers
# We must format their output as a dictionary to update the State
def researcher_node(state: AgentState):
    print("--- Researcher Working ---")
    response = researcher_agent.invoke({"messages": state["messages"]})
    return {"messages": [response]}

def writer_node(state: AgentState):
    print("--- Writer Working ---")
    response = writer_agent.invoke({"messages": state["messages"]})
    return {"messages": [response]}

# 3. The Supervisor Node
# We force the Supervisor to output a Pydantic object
class Route(BaseModel):
    next: Literal["Researcher", "Writer", "FINISH"] = Field(
        description="The next agent to act. If the task is fully complete, output FINISH."
    )

def supervisor_node(state: AgentState):
    print("--- Supervisor Evaluating ---")
    prompt = ChatPromptTemplate.from_messages([
        ("system", """You are a supervisor managing a conversation between these workers: Researcher, Writer.
        Given the user request and the conversation so far, decide who should act next.
        - If facts are needed, route to Researcher.
        - If facts are present but a story/article needs to be written, route to Writer.
        - If the story is written and the user request is completely fulfilled, route to FINISH."""),
        MessagesPlaceholder(variable_name="messages"),
        ("system", "Who should act next? Respond with exactly one of: Researcher, Writer, FINISH")
    ])
    
    supervisor_chain = prompt | llm.with_structured_output(Route)
    decision = supervisor_chain.invoke({"messages": state["messages"]})
    print(f"    -> Supervisor decided: {decision.next}")
    return {"next_agent": decision.next}


# 4. The Routing Logic (Conditional Edge)
def route_next(state: AgentState):
    # We just return the string that the supervisor put into the state!
    if state["next_agent"] == "FINISH":
        return END
    return state["next_agent"] # Returns "Researcher" or "Writer"

# 5. Build Graph
workflow = StateGraph(AgentState)

# Add Nodes
workflow.add_node("Supervisor", supervisor_node)
workflow.add_node("Researcher", researcher_node)
workflow.add_node("Writer", writer_node)

# Add Edges
workflow.add_edge(START, "Supervisor")

# Workers always report back to the supervisor when done
workflow.add_edge("Researcher", "Supervisor")
workflow.add_edge("Writer", "Supervisor")

# The Supervisor routes dynamically
workflow.add_conditional_edges(
    "Supervisor",
    route_next,
    # A mapping dictionary: {ReturnValueOfTheFunction: NameOfTheTargetNode}
    {"Researcher": "Researcher", "Writer": "Writer", END: END}
)

app = workflow.compile()

# --- Test ---
print("\n=== STARTING MULTI-AGENT RUN ===")
initial_state = {"messages": [HumanMessage(content="Write a short article about the history of the James Webb Space Telescope.")]}

for event in app.stream(initial_state, stream_mode="values"):
    # Print the last message added to the state
    last_message = event["messages"][-1]
    if hasattr(last_message, "content"):
        print(f"\n{last_message.content[:100]}...\n")
```

Run it. You will see the Supervisor orchestrate the entire process without any hardcoded logic!

### Hands-on Exercise
*   Add a third worker: "Editor". 
*   Update the Supervisor prompt to route to the Editor after the Writer is done.
*   The Editor should check for tone, spelling, and word count, and either fix it (and route to FINISH) or complain (causing the Supervisor to route back to the Writer).

---
**Next up:** The Capstone. We combine everything into an Agentic RAG system.
