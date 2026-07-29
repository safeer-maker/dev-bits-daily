from typing import Any
from core.gemini import Gemini
from mcp_client import MCPClient
from core.tools import ToolManager


class Chat:
    def __init__(self, gemini_service: Gemini, clients: dict[str, MCPClient]):
        self.gemini_service: Gemini = gemini_service
        self.clients: dict[str, MCPClient] = clients
        self.messages: list[Any] = []

    async def _process_query(self, query: str):
        self.gemini_service.add_user_message(self.messages, query)

    async def run(
        self,
        query: str,
    ) -> str:
        final_text_response = ""

        await self._process_query(query)

        while True:
            all_tools = await ToolManager.get_all_tools(self.clients)
            response = self.gemini_service.chat(
                messages=self.messages,
                tools=all_tools if all_tools else None,
            )

            self.gemini_service.add_assistant_message(self.messages, response)

            function_calls = getattr(response, "function_calls", None)
            if not function_calls and hasattr(response, "candidates") and response.candidates:
                parts = response.candidates[0].content.parts
                function_calls = [
                    p.function_call
                    for p in parts
                    if hasattr(p, "function_call") and p.function_call
                ]

            if function_calls:
                text_response = self.gemini_service.text_from_message(response)
                if text_response:
                    print(text_response)

                tool_result_parts = await ToolManager.execute_tool_requests(
                    self.clients, response
                )

                self.gemini_service.add_user_message(
                    self.messages, tool_result_parts
                )
            else:
                final_text_response = self.gemini_service.text_from_message(
                    response
                )
                break

        return final_text_response
