# MCP Chat (Google Gemini Powered)

MCP Chat is a command-line interface application that enables interactive chat capabilities with AI models through the Google Gemini API (Google AI Studio). The application supports document retrieval, command-based prompts, and extensible tool integrations via the MCP (Model Context Protocol) architecture.

## Prerequisites

- Python 3.10+
- Google AI Studio API Key (Free API key from [aistudio.google.com](https://aistudio.google.com/))

## Setup

### Step 1: Configure the environment variables

1. Create or edit the `.env` file in the project root and set your API key:

```env
GEMINI_MODEL="gemini-3.5-flash-lite"
GEMINI_API_KEY="your-google-ai-studio-api-key-here"

USE_UV=1
```

### Step 2: Install dependencies

#### Option 1: Setup with uv (Recommended)

[uv](https://github.com/astral-sh/uv) is a fast Python package installer and resolver.

1. Install uv, if not already installed:

```bash
pip install uv
```

2. Create and activate a virtual environment:

```bash
uv venv
source .venv/bin/activate  # On Windows: .venv\Scripts\activate
```

3. Install dependencies:

```bash
uv pip install -e .
```

4. Run the project:

```bash
uv run main.py
```

#### Option 2: Setup without uv

1. Create and activate a virtual environment:

```bash
python -m venv .venv
source .venv/bin/activate  # On Windows: .venv\Scripts\activate
```

2. Install dependencies:

```bash
pip install google-genai python-dotenv prompt-toolkit "mcp[cli]>=1.8.0"
```

3. Run the project:

```bash
python main.py
```

## Usage

### Basic Interaction

Simply type your message and press Enter to chat with the model.

### Document Retrieval

Use the `@` symbol followed by a document ID to include document content in your query:

```
> Tell me about @deposition.md
```

### Commands

Use the `/` prefix to execute commands defined in the MCP server:

```
> /summarize deposition.md
```

Commands will auto-complete when you press Tab.

## Development

### Adding New Documents

Edit the `mcp_server.py` file to add new documents to the `docs` dictionary.
