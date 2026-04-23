"""MCP servers — list, add, remove, toggle, gallery.

Reads `hermes mcp list` for the live set; in-store entries are added on top.
The ``/mcp/gallery`` endpoint returns a curated list of popular / well-known
MCP servers that the user can install in one click.
"""

from __future__ import annotations

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel

from .. import hermes_cli
from ..store import Store, get_store

router = APIRouter(prefix="/mcp", tags=["mcp"])


class CreateMcp(BaseModel):
    name: str
    url: str


# A hand-picked starter gallery. These are popular, reasonably stable MCP
# servers — enough to help a fresh user get something useful wired up without
# having to hunt for URLs. Each entry is (name, url, description, category,
# popularity tag). The ``url`` uses the ``stdio://`` scheme for npm-launched
# servers and plain https for hosted ones.
_GALLERY: list[dict[str, str]] = [
    {
        "id": "fs",
        "name": "Filesystem",
        "url": "stdio://@modelcontextprotocol/server-filesystem",
        "description": "Read and write files on this Mac. Ideal for local editing tasks.",
        "category": "local",
        "tag": "official",
        "install_hint": "npx @modelcontextprotocol/server-filesystem ~/Projects",
    },
    {
        "id": "fetch",
        "name": "Fetch",
        "url": "stdio://@modelcontextprotocol/server-fetch",
        "description": "Retrieve a URL as text or HTML.",
        "category": "web",
        "tag": "official",
        "install_hint": "npx @modelcontextprotocol/server-fetch",
    },
    {
        "id": "github",
        "name": "GitHub",
        "url": "stdio://@modelcontextprotocol/server-github",
        "description": "Search repos, read issues, manage PRs. Needs GITHUB_TOKEN.",
        "category": "dev",
        "tag": "official",
        "install_hint": "npx @modelcontextprotocol/server-github",
    },
    {
        "id": "git",
        "name": "Git",
        "url": "stdio://@modelcontextprotocol/server-git",
        "description": "Query local git repos: log, blame, diff.",
        "category": "dev",
        "tag": "official",
        "install_hint": "npx @modelcontextprotocol/server-git",
    },
    {
        "id": "postgres",
        "name": "Postgres",
        "url": "stdio://@modelcontextprotocol/server-postgres",
        "description": "Read-only queries against a Postgres database.",
        "category": "data",
        "tag": "official",
        "install_hint": "npx @modelcontextprotocol/server-postgres postgres://…",
    },
    {
        "id": "sqlite",
        "name": "SQLite",
        "url": "stdio://@modelcontextprotocol/server-sqlite",
        "description": "Query local SQLite databases.",
        "category": "data",
        "tag": "official",
        "install_hint": "npx @modelcontextprotocol/server-sqlite ./app.db",
    },
    {
        "id": "puppeteer",
        "name": "Puppeteer",
        "url": "stdio://@modelcontextprotocol/server-puppeteer",
        "description": "Headless-browser automation: screenshots, scraping, DOM actions.",
        "category": "web",
        "tag": "official",
        "install_hint": "npx @modelcontextprotocol/server-puppeteer",
    },
    {
        "id": "memory",
        "name": "Memory",
        "url": "stdio://@modelcontextprotocol/server-memory",
        "description": "Knowledge-graph style long-term memory.",
        "category": "local",
        "tag": "official",
        "install_hint": "npx @modelcontextprotocol/server-memory",
    },
    {
        "id": "slack",
        "name": "Slack",
        "url": "stdio://@modelcontextprotocol/server-slack",
        "description": "Read Slack channels and send messages. Needs SLACK_BOT_TOKEN.",
        "category": "messaging",
        "tag": "official",
        "install_hint": "npx @modelcontextprotocol/server-slack",
    },
    {
        "id": "gdrive",
        "name": "Google Drive",
        "url": "stdio://@modelcontextprotocol/server-gdrive",
        "description": "Search and read Google Drive files. Needs OAuth.",
        "category": "files",
        "tag": "official",
        "install_hint": "npx @modelcontextprotocol/server-gdrive",
    },
    {
        "id": "everything",
        "name": "Everything (demo)",
        "url": "stdio://@modelcontextprotocol/server-everything",
        "description": "Demo server exercising every MCP feature — good for testing.",
        "category": "dev",
        "tag": "official",
        "install_hint": "npx @modelcontextprotocol/server-everything",
    },
    {
        "id": "brave-search",
        "name": "Brave Search",
        "url": "stdio://@modelcontextprotocol/server-brave-search",
        "description": "Web + news + local search via Brave. Needs BRAVE_API_KEY.",
        "category": "web",
        "tag": "official",
        "install_hint": "npx @modelcontextprotocol/server-brave-search",
    },
]


@router.get("")
async def list_servers() -> dict:
    if hermes_cli.available():
        live = hermes_cli.list_mcp()
        local = get_store().read("mcp_servers") or []
        return {"servers": [*local, *live], "real": True}
    return {"servers": get_store().read("mcp_servers") or [], "real": False}


# Literal ``/gallery`` path is registered BEFORE the ``{sid}`` catch-all on
# ``/{sid}/toggle`` and DELETE ``/{sid}`` so FastAPI doesn't route a GET for
# "gallery" into the dynamic routes.
@router.get("/gallery")
async def gallery(
    category: str | None = Query(default=None),
    q: str | None = Query(default=None),
) -> dict:
    """Return the curated starter gallery, optionally filtered by category or
    a substring match against name/description."""
    items = list(_GALLERY)
    if category and category != "all":
        items = [i for i in items if i.get("category") == category]
    if q:
        needle = q.lower().strip()
        items = [
            i
            for i in items
            if needle in i.get("name", "").lower()
            or needle in i.get("description", "").lower()
            or needle in i.get("id", "").lower()
        ]
    # Mark which gallery entries are already installed locally so the UI can
    # swap the ``Add`` button for a muted ``Installed`` chip.
    installed = {s.get("url") for s in (get_store().read("mcp_servers") or [])}
    for it in items:
        it["installed"] = it["url"] in installed
    categories = sorted({i.get("category") for i in _GALLERY if i.get("category")})
    return {"items": items, "categories": ["all", *categories], "total": len(_GALLERY)}


class InstallFromGallery(BaseModel):
    id: str


@router.post("/gallery/install")
async def install_from_gallery(body: InstallFromGallery) -> dict:
    """One-click install from the curated gallery. Adds the server to the
    local store so it appears in the Installed tab; the actual ``hermes mcp``
    subprocess is not spawned — the user still needs to wire env vars if the
    server needs them, but the entry is there to toggle on/off."""
    match = next((i for i in _GALLERY if i["id"] == body.id), None)
    if not match:
        raise HTTPException(404, f"Unknown gallery id: {body.id}")

    store = get_store()

    def mutate(d):
        # De-dupe by url — if the user already installed it, just re-enable.
        for s in d["mcp_servers"]:
            if s.get("url") == match["url"]:
                s["enabled"] = True
                return s
        srv = {
            "id": Store.new_id("mcp"),
            "name": match["name"],
            "url": match["url"],
            "description": match.get("description"),
            "category": match.get("category"),
            "install_hint": match.get("install_hint"),
            "enabled": True,
            "tools": 0,
            "source": "gallery",
        }
        d["mcp_servers"].insert(0, srv)
        return srv

    return {"server": store.mutate(mutate)}


@router.post("")
async def add(body: CreateMcp) -> dict:
    store = get_store()

    def mutate(d):
        srv = {
            "id": Store.new_id("mcp"),
            "name": body.name,
            "url": body.url,
            "enabled": True,
            "tools": 0,
        }
        d["mcp_servers"].insert(0, srv)
        return srv

    return {"server": store.mutate(mutate)}


@router.post("/{sid}/toggle")
async def toggle(sid: str) -> dict:
    store = get_store()

    def mutate(d):
        for s in d["mcp_servers"]:
            if s["id"] == sid:
                s["enabled"] = not s["enabled"]
                return s
        raise HTTPException(404, "not found")

    return {"server": store.mutate(mutate)}


@router.delete("/{sid}")
async def remove(sid: str) -> dict:
    store = get_store()

    def mutate(d):
        before = len(d["mcp_servers"])
        d["mcp_servers"] = [s for s in d["mcp_servers"] if s["id"] != sid]
        if len(d["mcp_servers"]) == before:
            raise HTTPException(404, "not found")
        return {"removed": sid}

    return store.mutate(mutate)
