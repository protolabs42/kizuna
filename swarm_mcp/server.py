"""
Kizuna (絆) - MCP Server

Exposes P2P swarm capabilities to any AI agent via Model Context Protocol.
Part of the Kizuna project: enabling cross-model AI collaboration.

Works with Claude, GPT, Gemini, or any MCP-compatible agent.

Run: python server.py
"""

import json
import os
from mcp.server.fastmcp import FastMCP
from starlette.requests import Request
from starlette.responses import JSONResponse

import bridge_client

# Get config from environment
HOST = os.getenv("MCP_HOST", "0.0.0.0")
PORT = int(os.getenv("MCP_PORT", "8000"))

# Initialize MCP server with host/port config
mcp = FastMCP(
    "Swarm MCP",
    json_response=True,
    host=HOST,
    port=PORT,
)


# Health check endpoint for Docker/k8s
@mcp.custom_route("/health", methods=["GET"])
async def health_check(request: Request) -> JSONResponse:
    return JSONResponse({"status": "healthy", "service": "swarm-mcp"})


@mcp.tool()
async def swarm_info() -> str:
    """Get information about this node's identity and swarm status."""
    try:
        info = await bridge_client.get("/info")
        stats = await bridge_client.get("/stats")
        return json.dumps({
            "peer_id": info.get("peerId", "")[:16] + "...",
            "manifest": info.get("manifest", {}),
            "active_peers": stats.get("active", 0),
            "uptime_seconds": stats.get("uptime", 0),
        }, indent=2)
    except Exception as e:
        return f"Error getting swarm info: {e}"


@mcp.tool()
async def swarm_peers() -> str:
    """List all connected peers in the swarm with their manifests."""
    try:
        data = await bridge_client.get("/peers")
        peers = []
        for p in data.get("details", []):
            manifest = p.get("manifest", {})
            peers.append({
                "id": p.get("publicKey", "")[-16:],
                "role": manifest.get("role", "Unknown"),
                "agent_id": manifest.get("agent_id", "Anonymous"),
                "skills": manifest.get("skills", []),
            })
        if not peers:
            return "No peers connected to the swarm."
        return json.dumps({"count": len(peers), "peers": peers}, indent=2)
    except Exception as e:
        return f"Error listing peers: {e}"


@mcp.tool()
async def swarm_broadcast(content: str, message_type: str = "chat") -> str:
    """
    Broadcast a message to all connected peers in the swarm.

    Args:
        content: The message content to broadcast
        message_type: Type of message (default: "chat"). Other types: "task", "query", "response"
    """
    try:
        response = await bridge_client.post("/broadcast", {
            "content": {
                "type": message_type,
                "message": content
            }
        })
        sent_to = response.get("sent_to", 0)
        return f"Message broadcast to {sent_to} peer(s) in the swarm."
    except Exception as e:
        return f"Error broadcasting: {e}"


@mcp.tool()
async def swarm_inbox() -> str:
    """
    Check for incoming messages from peer agents.

    Note: This pops messages from the inbox - they won't appear again on subsequent calls.
    """
    try:
        response = await bridge_client.get("/inbox")
        messages = response.get("messages", [])
        if not messages:
            return "No new messages in the inbox."

        formatted = []
        for msg in messages:
            formatted.append({
                "from": msg.get("senderShortId", "unknown"),
                "timestamp": msg.get("timestamp"),
                "content": msg.get("content", {}),
            })
        return json.dumps({"count": len(formatted), "messages": formatted}, indent=2)
    except Exception as e:
        return f"Error checking inbox: {e}"


@mcp.tool()
async def swarm_memory_write(content: str) -> str:
    """
    Write content to the shared Hypercore memory log.

    Args:
        content: The content to append to the shared memory
    """
    try:
        response = await bridge_client.post("/memory", {"content": content})
        length = response.get("length", 0)
        return f"Content written to shared memory. Total entries: {length}"
    except Exception as e:
        return f"Error writing to memory: {e}"


@mcp.tool()
async def swarm_memory_read() -> str:
    """Read the last 100 entries from the shared Hypercore memory log."""
    try:
        response = await bridge_client.get("/memory")
        memory = response.get("memory", [])
        if not memory:
            return "No entries in shared memory."
        return json.dumps({"count": len(memory), "entries": memory[-10:]}, indent=2)
    except Exception as e:
        return f"Error reading memory: {e}"


@mcp.tool()
async def swarm_topics() -> str:
    """List all topics this node has joined."""
    try:
        response = await bridge_client.get("/topics")
        topics = response.get("topics", [])
        if not topics:
            return "Not joined to any topics."
        return json.dumps({"count": len(topics), "topics": topics}, indent=2)
    except Exception as e:
        return f"Error listing topics: {e}"


@mcp.tool()
async def swarm_join_topic(topic: str, secret: str = "") -> str:
    """
    Join a swarm topic to discover and communicate with peers.

    Args:
        topic: The topic name to join
        secret: Optional secret for private topics (peers need same secret to connect)
    """
    try:
        response = await bridge_client.post("/join", {
            "topic": topic,
            "secret": secret
        })
        is_private = response.get("private", False)
        topic_hash = response.get("topicHash", "")[:8]
        privacy = "private" if is_private else "public"
        return f"Joined {privacy} topic '{topic}' (hash: {topic_hash}...)"
    except Exception as e:
        return f"Error joining topic: {e}"


@mcp.tool()
async def swarm_leave_topic(topic: str) -> str:
    """
    Leave a swarm topic.

    Args:
        topic: The topic name to leave
    """
    try:
        response = await bridge_client.post("/leave", {"topic": topic})
        return f"Left topic '{topic}'"
    except Exception as e:
        return f"Error leaving topic: {e}"


@mcp.tool()
async def swarm_set_manifest(role: str, skills: list[str] | None = None, agent_id: str | None = None) -> str:
    """
    Update this agent's manifest (advertised capabilities).

    Args:
        role: The agent's role (e.g., "Researcher", "Coder", "Analyst")
        skills: List of skills (e.g., ["python", "search", "analysis"])
        agent_id: Human-readable identifier for this agent
    """
    try:
        payload = {"role": role}
        if skills:
            payload["skills"] = skills
        if agent_id:
            payload["agent_id"] = agent_id

        response = await bridge_client.post("/manifest", payload)
        manifest = response.get("manifest", {})
        return f"Manifest updated: {json.dumps(manifest)}"
    except Exception as e:
        return f"Error updating manifest: {e}"


# --- TASK DELEGATION (A2A Protocol) ---

@mcp.tool()
async def swarm_request_task(
    description: str,
    task_type: str = "general",
    target: str | None = None,
    context: dict | None = None,
    priority: str = "medium",
    deadline: int | None = None
) -> str:
    """
    Send a task request to a specific peer or broadcast to all peers.

    Args:
        description: What needs to be done
        task_type: Type of task (general, analysis, code_review, research, test, other)
        target: Peer ID or agent name to send to (optional, "*" or omit for broadcast)
        context: Additional context as key-value pairs
        priority: Task priority (low, medium, high, critical)
        deadline: Unix timestamp deadline for task completion (optional)
    """
    try:
        payload = {
            "description": description,
            "task_type": task_type,
            "priority": priority,
        }
        if target:
            payload["target"] = target
        if context:
            payload["context"] = context
        if deadline is not None:
            payload["deadline"] = deadline

        response = await bridge_client.post("/task/request", payload)
        task_id = response.get("task_id", "unknown")
        sent_to = response.get("sent_to", 0)
        target_info = response.get("target", "*")
        return f"Task {task_id} sent to {target_info} ({sent_to} peer(s)). Use swarm_task_status('{task_id}') to check status."
    except Exception as e:
        return f"Error sending task request: {e}"


@mcp.tool()
async def swarm_task_status(task_id: str | None = None) -> str:
    """
    Check status of tasks (sent and received).

    Args:
        task_id: Specific task ID to check (optional, omit for all tasks)
    """
    try:
        if task_id:
            response = await bridge_client.get(f"/task/status/{task_id}")
            return json.dumps(response, indent=2)
        else:
            response = await bridge_client.get("/tasks")
            sent = response.get("sent", {})
            received = response.get("received", {})

            if sent.get("count", 0) == 0 and received.get("count", 0) == 0:
                return "No active tasks."

            result = []
            if sent.get("count", 0) > 0:
                result.append(f"Sent tasks ({sent['count']}):")
                for t in sent.get("tasks", []):
                    result.append(f"  - {t['task_id'][:8]}... [{t['status']}] -> {t['target']}")

            if received.get("count", 0) > 0:
                result.append(f"Received tasks ({received['count']}):")
                for t in received.get("tasks", []):
                    result.append(f"  - {t['task_id'][:8]}... [{t['status']}] from {t.get('fromShortId', 'unknown')}")

            return "\n".join(result)
    except Exception as e:
        return f"Error checking task status: {e}"


@mcp.tool()
async def swarm_complete_task(task_id: str, result: dict | None = None, error: str | None = None) -> str:
    """
    Complete a received task with result or error.

    Args:
        task_id: The task ID to complete
        result: Result data as key-value pairs (for success)
        error: Error message (for failure)
    """
    try:
        # Ruby review B3: use explicit None checks to preserve empty values
        status = "failed" if error is not None else "completed"
        payload = {
            "task_id": task_id,
            "status": status,
        }
        if result is not None:
            payload["result"] = result
        if error is not None:
            payload["error"] = error

        response = await bridge_client.post("/task/respond", payload)
        sent = response.get("sent_to_requester", False)
        return f"Task {task_id} marked as {status}. Response sent to requester: {sent}"
    except Exception as e:
        return f"Error completing task: {e}"


@mcp.tool()
async def swarm_accept_task(task_id: str) -> str:
    """
    Accept a received task (signals you're working on it).

    Args:
        task_id: The task ID to accept
    """
    try:
        response = await bridge_client.post("/task/respond", {
            "task_id": task_id,
            "status": "accepted"
        })
        return f"Task {task_id} accepted. Use swarm_complete_task('{task_id}', result={{...}}) when done."
    except Exception as e:
        return f"Error accepting task: {e}"


@mcp.tool()
async def swarm_find_peers(skill: str | None = None, role: str | None = None) -> str:
    """
    Find peers by skill or role.

    Args:
        skill: Skill to search for (e.g., "python", "analysis")
        role: Role to search for (e.g., "Coder", "Researcher")
    """
    try:
        params = []
        if skill:
            params.append(f"skill={skill}")
        if role:
            params.append(f"role={role}")

        query = "?" + "&".join(params) if params else ""
        response = await bridge_client.get(f"/capabilities/search{query}")

        matches = response.get("matches", [])
        if not matches:
            return f"No peers found matching: skill={skill}, role={role}"

        result = [f"Found {len(matches)} peer(s):"]
        for m in matches:
            result.append(f"  - {m['agent_id']} ({m['peer_id']}): {m['role']} - skills: {', '.join(m['skills'])}")

        return "\n".join(result)
    except Exception as e:
        return f"Error finding peers: {e}"


# Run the server with HTTP transport for remote access
if __name__ == "__main__":
    # Host/port already configured in FastMCP constructor
    mcp.run(transport="streamable-http")
