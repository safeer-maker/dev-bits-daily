from mcp.server.fastmcp import FastMCP
from pydantic import Field
from mcp.server.fastmcp.prompts import base

mcp = FastMCP("DocumentMCP", log_level="ERROR")


docs = {
    "deposition.md": "This deposition covers the testimony of Angela Smith, P.E.",
    "report.pdf": "The report details the state of a 20m condenser tower.",
    "financials.docx": "These financials outline the project's budget and expenditures.",
    "outlook.pdf": "This document presents the projected future performance of the system.",
    "plan.md": "The plan outlines the steps for the project's implementation.",
    "spec.txt": "These specifications define the technical requirements for the equipment.",
}

# TODO: Write a tool to read a doc
@mcp.tool(
    name = "read_document_content",
    description="Read the content of a document based on the id passed.",
    
)
def read_doc (
    doc_id : str = Field( description="ID of the document to be read"),
):
    if doc_id not in docs:
        return ValueError(f"Id field : {doc_id} not found")
    
    return docs[doc_id]


# TODO: Write a tool to edit a doc
@mcp.tool(
    name = "write_document_content",
    description = "Writes content to a document based on the id passed.",
)
def write_doc(
    doc_id: str = Field(description="ID of the document to be written"),
    old_content: str = Field(description="The old content must be match even the white space"),
    new_content: str = Field(description="The new content")
):
    if doc_id not in docs:
        return ValueError(f"Id field: {doc_id} not found")
    
    docs[doc_id] = docs [doc_id].replace (old_content, new_content)
    return docs[doc_id]
    # if old_content != docs[doc_id]:
    #     return ValueError("Id field and old content does not match")

    # docs[doc_id] = new_content
    # return True


# TODO: Write a resource to return all doc id's
@mcp.resource(
    "docs://documents",
    mime_type="application/json"
)
def list_docs() -> list[str]:
    return list(docs.keys())

# TODO: Write a resource to return the contents of a particular doc
@mcp.resource(
    "docs://documents/{doc_id}",
    mime_type="text/plain"
)
def fetch_doc(doc_id: str) -> str:
    if doc_id not in docs:
        raise ValueError(f"Doc with id {doc_id} not found")
    return docs[doc_id]

# TODO: Write a prompt to rewrite a doc in markdown format
@mcp.prompt(
    name="format",
    description="Rewrites the contents of the document in Markdown format."
)
def format_document(
    doc_id: str = Field(description="Id of the document to format")
) -> list[base.Message]:
    prompt = f"""
Your goal is to reformat a document to be written with markdown syntax.

The id of the document you need to reformat is:
<document_id>
{doc_id}
</document_id>

Add in headers, bullet points, tables, etc as necessary. Feel free to add in structure.
Use the 'edit_document' tool to edit the document. After the document has been reformatted...
"""
    
    return [
        base.UserMessage(prompt)
    ]
    
# TODO: Write a prompt to summarize a doc


if __name__ == "__main__":
    mcp.run(transport="stdio")
