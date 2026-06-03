# Module 02: Tools and Agents

Now that we can predictably chain prompts and enforce structured outputs, we need to solve a fundamental limitation of LLMs: they are frozen in time and cannot access external systems.

**Scenario:** We are going to build a "Research Assistant Bot" (v1). It will be able to search the web for current events and perform mathematical calculations.

To do this, we need to install a search tool:
```bash
pip install duckduckgo-search langchain-community
```

## 1. Creating Tools

In LangChain, a Tool is basically a Python function accompanied by a description that tells the LLM *when* and *how* to use it.

```python
import math
from langchain_core.tools import tool
from langchain_community.tools import DuckDuckGoSearchRun

# 1. Using a pre-built tool
web_search = DuckDuckGoSearchRun()

# 2. Creating a custom tool using the @tool decorator
# The docstring is EXTREMELY important. The LLM reads it to understand the tool.
@tool
def calculate_compound_interest(principal: float, rate: float, years: int) -> float:
    """
    Calculates the final amount after compound interest.
    Use this when you need to calculate investment returns.
    Args:
        principal: The initial amount of money
        rate: The annual interest rate as a decimal (e.g., 0.05 for 5%)
        years: The number of years the money is invested
    """
    return principal * math.pow((1 + rate), years)

# Put our tools in a list
tools = [web_search, calculate_compound_interest]
```

## 2. Binding Tools to the LLM

We need to tell Gemini that these tools exist.

```python
from dotenv import load_dotenv
from langchain_google_genai import ChatGoogleGenerativeAI

load_dotenv()
llm = ChatGoogleGenerativeAI(model="gemini-1.5-flash", temperature=0)

# Bind the tools to the LLM
llm_with_tools = llm.bind_tools(tools)
```

Let's test if the LLM *wants* to use a tool.

```python
from langchain_core.messages import HumanMessage

msg = llm_with_tools.invoke([HumanMessage(content="If I invest $1000 at 5% for 10 years, what do I get?")])

# Check if the LLM decided to call a tool
print("Tool calls:", msg.tool_calls)
# You should see that it wants to call 'calculate_compound_interest' with the correct arguments!
```

## 3. Building an Agent (The ReAct Pattern)

Just binding tools isn't enough. We need an execution loop:
1. LLM thinks and decides to use a tool.
2. Our code executes the tool.
3. Our code passes the tool's result back to the LLM.
4. LLM analyzes the result and provides the final answer.

This is exactly what an `AgentExecutor` does. We will use the `create_tool_calling_agent` function.

```python
from langchain.agents import AgentExecutor, create_tool_calling_agent
from langchain_core.prompts import ChatPromptTemplate

# 1. Create the Agent Prompt
# Agents require a specific prompt structure containing a placeholder for the scratchpad (where it keeps track of its steps)
prompt = ChatPromptTemplate.from_messages([
    ("system", "You are a helpful AI research assistant. Use tools if necessary to answer the user's questions."),
    ("human", "{input}"),
    ("placeholder", "{agent_scratchpad}"),
])

# 2. Create the Agent
agent = create_tool_calling_agent(llm, tools, prompt)

# 3. Create the Executor (the loop)
agent_executor = AgentExecutor(
    agent=agent, 
    tools=tools, 
    verbose=True, # Set to True to see the "thought process" in the console
    max_iterations=5 # Prevent infinite loops if the agent gets confused
)

# 4. Test it!
print("\n--- Test 1: Calculation ---")
result = agent_executor.invoke({"input": "I have $5000. If I invest it at 7% annual interest, what will it be worth in 20 years?"})
print("Final Answer:", result["output"])

print("\n--- Test 2: Web Search ---")
result = agent_executor.invoke({"input": "Who won the most recent super bowl and what was the final score?"})
print("Final Answer:", result["output"])

print("\n--- Test 3: Multi-step Reasoning ---")
result = agent_executor.invoke({"input": "Find the current age of Elon Musk. If he invests 1 million dollars today at 4% for the next 10 years, how much will he have?"})
print("Final Answer:", result["output"])
```

### Hands-on Exercise
*   Create a custom tool called `@tool def get_arxiv_paper_abstract(query: str) -> str:`
*   Have it use the `urllib` or `requests` library to hit the Arxiv API (`http://export.arxiv.org/api/query?search_query=all:{query}&start=0&max_results=1`) to return the summary of a paper.
*   Add this tool to your agent and ask it to summarize a recent paper on "Retrieval Augmented Generation".

---
**Next up:** In Phase 2, we will tackle Memory and then dive deep into building a robust RAG system backed by PostgreSQL and pgvector!
