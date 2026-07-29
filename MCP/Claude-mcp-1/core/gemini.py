import os
from typing import Any, List, Optional
from google import genai
from google.genai import types


def _clean_schema_for_gemini(schema: Any) -> Any:
    """Cleans up a JSON schema dictionary for compatibility with Gemini API."""
    if not isinstance(schema, dict):
        return schema
    cleaned = {}
    for k, v in schema.items():
        if k in ("$schema", "title", "additionalProperties"):
            continue
        if k == "type" and isinstance(v, str):
            cleaned[k] = v.upper()
        elif isinstance(v, dict):
            cleaned[k] = _clean_schema_for_gemini(v)
        elif isinstance(v, list):
            cleaned[k] = [
                _clean_schema_for_gemini(item) if isinstance(item, dict) else item
                for item in v
            ]
        else:
            cleaned[k] = v
    return cleaned


def format_mcp_tools_for_gemini(mcp_tools: list) -> list[types.Tool]:
    """Converts a list of MCP tool dicts into Gemini types.Tool objects."""
    function_declarations = []
    for t in mcp_tools:
        name = t["name"] if isinstance(t, dict) else getattr(t, "name")
        desc = (
            (t.get("description") if isinstance(t, dict) else getattr(t, "description", ""))
            or ""
        )
        schema = (
            t.get("input_schema") if isinstance(t, dict) else getattr(t, "inputSchema", {})
        )

        cleaned_schema = _clean_schema_for_gemini(schema)

        fd = types.FunctionDeclaration(
            name=name,
            description=desc,
            parameters=cleaned_schema if cleaned_schema else None,
        )
        function_declarations.append(fd)

    return [types.Tool(function_declarations=function_declarations)] if function_declarations else []


class Gemini:
    def __init__(self, model: str = "gemini-2.5-flash-lite", api_key: Optional[str] = None):
        self.model = model
        key = api_key or os.getenv("GEMINI_API_KEY")
        if key:
            self.client = genai.Client(api_key=key)
        else:
            self.client = genai.Client()

    def add_user_message(self, messages: list, message: Any):
        if isinstance(message, types.Content):
            messages.append(message)
        elif isinstance(message, list):
            # Check if elements are Part objects or dicts
            if message and isinstance(message[0], types.Part):
                messages.append(types.Content(role="user", parts=message))
            elif message and isinstance(message[0], dict):
                # If list of dicts/strings
                text_content = "\n".join(str(m) for m in message)
                messages.append(types.Content(role="user", parts=[types.Part.from_text(text=text_content)]))
            else:
                messages.append(types.Content(role="user", parts=[types.Part.from_text(text=str(message))]))
        elif isinstance(message, str):
            messages.append(types.Content(role="user", parts=[types.Part.from_text(text=message)]))
        elif isinstance(message, dict) and "role" in message:
            role = "user" if message["role"] == "user" else "model"
            content = message.get("content", "")
            if isinstance(content, str):
                messages.append(types.Content(role=role, parts=[types.Part.from_text(text=content)]))
            elif isinstance(content, list):
                parts = []
                for item in content:
                    if isinstance(item, dict) and item.get("type") == "text":
                        parts.append(types.Part.from_text(text=item.get("text", "")))
                    elif isinstance(item, str):
                        parts.append(types.Part.from_text(text=item))
                messages.append(types.Content(role=role, parts=parts if parts else [types.Part.from_text(text="")]))
        else:
            messages.append(types.Content(role="user", parts=[types.Part.from_text(text=str(message))]))

    def add_assistant_message(self, messages: list, response: Any):
        if hasattr(response, "candidates") and response.candidates:
            candidate_content = response.candidates[0].content
            messages.append(candidate_content)
        elif isinstance(response, types.Content):
            messages.append(response)

    def text_from_message(self, response: Any) -> str:
        if hasattr(response, "text") and response.text is not None:
            return response.text
        if hasattr(response, "candidates") and response.candidates:
            parts = response.candidates[0].content.parts
            texts = [p.text for p in parts if hasattr(p, "text") and p.text]
            return "\n".join(texts)
        return str(response)

    def chat(
        self,
        messages: list,
        system: Optional[str] = None,
        temperature: float = 1.0,
        stop_sequences: list = [],
        tools: Optional[list] = None,
    ) -> Any:
        config_kwargs = {}
        if system:
            config_kwargs["system_instruction"] = system
        if temperature is not None:
            config_kwargs["temperature"] = temperature
        if stop_sequences:
            config_kwargs["stop_sequences"] = stop_sequences
        if tools:
            config_kwargs["tools"] = format_mcp_tools_for_gemini(tools)

        config = types.GenerateContentConfig(**config_kwargs) if config_kwargs else None

        response = self.client.models.generate_content(
            model=self.model,
            contents=messages,
            config=config,
        )
        return response
