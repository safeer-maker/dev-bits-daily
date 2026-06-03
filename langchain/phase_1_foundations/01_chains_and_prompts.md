# Module 01: Chains, Prompts, and Structured Output

Welcome to Phase 1! We are going to start by building a strong foundation with LangChain Expression Language (LCEL) and structured outputs.

**Scenario:** You need a "News Brief Bot" that takes a topic, generates a summary, translates it, and outputs the final result as a structured JSON object.

## 1. Setup and Basic Inference

First, let's make sure you can talk to Gemini. Create a file called `01_basics.py` (or use a notebook cell) and write the following:

```python
import os
from dotenv import load_dotenv
from langchain_google_genai import ChatGoogleGenerativeAI
from langchain_core.messages import HumanMessage

# Load your GOOGLE_API_KEY from .env
load_dotenv()

# Initialize the LLM
llm = ChatGoogleGenerativeAI(model="gemini-1.5-flash", temperature=0.3)

# Test it
response = llm.invoke([HumanMessage(content="Explain agentic workflows in 2 sentences.")])
print(response.content)
```

Run this to confirm your API key and setup are working.

## 2. Prompts and LCEL (LangChain Expression Language)

Writing raw messages is tedious. We use `PromptTemplate` to create reusable instruction sets. LCEL uses the pipe `|` operator to chain components together.

Let's build a chain that writes a summary about a topic.

```python
from langchain_core.prompts import ChatPromptTemplate
from langchain_core.output_parsers import StrOutputParser

# 1. Define the Prompt Template
prompt = ChatPromptTemplate.from_messages([
    ("system", "You are an expert tech analyst. Provide a concise, 3-bullet summary of the topic provided."),
    ("human", "Topic: {topic}")
])

# 2. Define the Output Parser (extracts just the string from the AI message)
parser = StrOutputParser()

# 3. Create the Chain using LCEL
# The output of the prompt goes into the LLM, and the LLM's output goes into the parser.
chain = prompt | llm | parser

# 4. Invoke the chain
result = chain.invoke({"topic": "Large Language Model quantization"})
print(result)
```

## 3. Structured Output (Crucial for Agents)

When building complex systems, you rarely want raw text back from the LLM. You usually want JSON so your code can process it predictably.

LangChain and Gemini make this easy using Pydantic.

```python
from pydantic import BaseModel, Field

# 1. Define your desired data structure
class TechBrief(BaseModel):
    topic: str = Field(description="The original topic requested")
    key_takeaways: list[str] = Field(description="List of 3 main points")
    sentiment: str = Field(description="Overall sentiment: POSITIVE, NEUTRAL, or NEGATIVE")
    urdu_translation: str = Field(description="A brief summary translated into Urdu")

# 2. Bind the schema to the LLM
structured_llm = llm.with_structured_output(TechBrief)

# 3. Create a new prompt
structured_prompt = ChatPromptTemplate.from_messages([
    ("system", "You are a multilingual analyst. Analyze the topic and provide the structured output requested."),
    ("human", "{topic}")
])

# 4. Build the new chain
# Notice we don't need StrOutputParser here because with_structured_output handles the parsing!
structured_chain = structured_prompt | structured_llm

# 5. Run it
result = structured_chain.invoke({"topic": "The rise of open-source AI models"})

# Look at how clean this is! It's a Python object now.
print(f"Topic: {result.topic}")
print(f"Sentiment: {result.sentiment}")
print(f"Takeaways: {result.key_takeaways}")
print(f"Urdu: {result.urdu_translation}")
```

### Hands-on Exercise
*   Modify the `TechBrief` model to include a `confidence_score` (float between 0.0 and 1.0) indicating how confident the AI is in its analysis.
*   Try invoking the chain with an obscure topic to see if the confidence score drops.

---
**Next up:** In Module 02, we will give our LLM the ability to use external tools!
