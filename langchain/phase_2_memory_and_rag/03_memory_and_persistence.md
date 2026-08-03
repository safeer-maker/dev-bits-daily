# Module 03: Memory and Persistence

By default, Chains and Agents in LangChain are **stateless**. Every time you invoke them, they have no memory of the previous interactions. For an assistant to be useful, it needs memory.

**Scenario:** We are building a "Tutoring Chatbot". It needs to remember the student's name, previous questions, and areas they are struggling with across different sessions.

To persist memory, we will use an SQLite database (it's built-in, no setup required). We need an additional package:
```bash
pip install langchain-community
```

## 1. The Concept of Threading

To store memory, we need to associate a conversation with a specific user or session. LangChain uses a `session_id` to manage this. Think of it as a unique ID for a specific chat window.

## 2. Implementing Persistent Memory

We will use `RunnableWithMessageHistory` to wrap our chain. This automatically pulls old messages from the database before generating a response, and saves the new response to the database afterward.

Create a file `03_memory.py`:

```python
import os
import sqlite3
from dotenv import load_dotenv
from langchain_google_genai import ChatGoogleGenerativeAI
from langchain_core.prompts import ChatPromptTemplate, MessagesPlaceholder
from langchain_core.runnables.history import RunnableWithMessageHistory
from langchain_community.chat_message_histories import SQLChatMessageHistory

load_dotenv()

# 1. The LLM
llm = ChatGoogleGenerativeAI(model="gemini-1.5-flash", temperature=0.5)

# 2. The Prompt
# Note the MessagesPlaceholder. This is where the chat history will be injected.
prompt = ChatPromptTemplate.from_messages([
    ("system", "You are a helpful and patient AI tutor. Keep your answers brief."),
    MessagesPlaceholder(variable_name="history"),
    ("human", "{input}")
])

# 3. The Base Chain
chain = prompt | llm

# 4. Define the Database connection for history
# This function tells LangChain how to fetch/save history for a given session_id
def get_session_history(session_id: str):
    # This will create a 'chat_memory.db' file in your current directory
    return SQLChatMessageHistory(session_id, "sqlite:///chat_memory.db")

# 5. Wrap the chain with History
chain_with_history = RunnableWithMessageHistory(
    chain,
    get_session_history,
    input_messages_key="input",
    history_messages_key="history",
)

# --- Let's Test It ---

# Define our session configuration
config_session_1 = {"configurable": {"session_id": "student_alice"}}
config_session_2 = {"configurable": {"session_id": "student_bob"}}

print("--- Alice's Session ---")
res = chain_with_history.invoke({"input": "Hi, my name is Alice. I'm struggling with basic algebra."}, config=config_session_1)
print(res.content)

print("\n--- Bob's Session ---")
res = chain_with_history.invoke({"input": "Hello, I'm Bob. I want to learn about black holes."}, config=config_session_2)
print(res.content)

print("\n--- Alice's Session Again ---")
res = chain_with_history.invoke({"input": "Can you give me a simple problem to solve based on what I said I was struggling with?"}, config=config_session_1)
print(res.content)

print("\n--- Bob's Session Again ---")
res = chain_with_history.invoke({"input": "Do you remember my name?"}, config=config_session_2)
print(res.content)
```

Run this script. Notice how Alice's and Bob's conversations remain isolated, and the AI perfectly remembers the context for each user! Look in your directory; you will see a `chat_memory.db` file has been created.

## 3. Managing History Size (Trimming)

If a conversation goes on forever, the `history` array will exceed the LLM's context window, causing an error (and costing a lot of money).

LangChain provides utilities to trim messages.

```python
from langchain_core.messages import trim_messages

# We can define a trimmer that keeps only the last 10 messages
trimmer = trim_messages(
    max_tokens=10, 
    strategy="last",
    token_counter=len, # A very basic token counter, in reality use a proper tokenizer
    include_system=True, # Always keep the system prompt!
    allow_partial=False
)

# You can incorporate this into your chain:
# trimmed_chain = prompt | trimmer | llm 
```

### Hands-on Exercise
*   Look inside the `chat_memory.db` file using an SQLite viewer (like DB Browser for SQLite or an IDE extension). Observe how LangChain serializes the messages into the database.
*   Modify the code to ask the user for input in a `while True:` loop, creating a real terminal-based chat app that remembers you.

---
**Next up:** Module 04 is the big one. We are going to build a production-grade RAG pipeline using local embeddings and PostgreSQL with `pgvector`!
