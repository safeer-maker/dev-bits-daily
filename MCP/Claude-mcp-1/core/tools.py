import json
from typing import Optional, List, Any
from mcp.types import CallToolResult, TextContent
from mcp_client import MCPClient
from google.genai import types


class ToolManager:
    @classmethod
    async def get_all_tools(cls, clients: dict[str, MCPClient]) -> list[dict]:
        """Gets all tools from the provided clients."""
        tools = []
        for client in clients.values():
            tool_models = await client.list_tools()
            tools += [
                {
                    "name": t.name,
                    "description": t.description,
                    "input_schema": t.inputSchema,
                }
                for t in tool_models
            ]
        return tools

    @classmethod
    async def _find_client_with_tool(
        cls, clients: list[MCPClient], tool_name: str
    ) -> Optional[MCPClient]:
        """Finds the first client that has the specified tool."""
        for client in clients:
            tools = await client.list_tools()
            tool = next((t for t in tools if t.name == tool_name), None)
            if tool:
                return client
        return None

    @classmethod
    async def execute_tool_requests(
        cls, clients: dict[str, MCPClient], response: Any
    ) -> List[types.Part]:
        """Executes a list of tool requests from a Gemini response against the provided clients."""
        function_calls = getattr(response, "function_calls", None)
        if not function_calls and hasattr(response, "candidates") and response.candidates:
            parts = response.candidates[0].content.parts
            function_calls = [
                p.function_call for p in parts if hasattr(p, "function_call") and p.function_call
            ]

        if not function_calls:
            return []

        tool_result_parts: list[types.Part] = []
        for call in function_calls:
            tool_name = call.name
            tool_input = call.args or {}
            if not isinstance(tool_input, dict):
                tool_input = dict(tool_input)

            client = await cls._find_client_with_tool(
                list(clients.values()), tool_name
            )

            if not client:
                error_message = f"Could not find tool '{tool_name}'"
                part = types.Part.from_function_response(
                    name=tool_name,
                    response={"error": error_message},
                )
                tool_result_parts.append(part)
                continue

            try:
                tool_output: CallToolResult | None = await client.call_tool(
                    tool_name, tool_input
                )
                items = []
                if tool_output:
                    items = tool_output.content
                content_list = [
                    item.text for item in items if isinstance(item, TextContent)
                ]
                content_text = "\n".join(content_list) if content_list else "Success"
                part = types.Part.from_function_response(
                    name=tool_name,
                    response={"result": content_text},
                )
            except Exception as e:
                error_message = f"Error executing tool '{tool_name}': {e}"
                print(error_message)
                part = types.Part.from_function_response(
                    name=tool_name,
                    response={"error": error_message},
                )

            tool_result_parts.append(part)
        return tool_result_parts
