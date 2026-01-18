# Multi-Agent Swarm Setup

Three AI agents connected via P2P swarm:

```
Sophie (Claude) ◄──► Ruby (Codex) ◄──► Agent Zero
    :8000              :8001              :8002
```

## Quick Start

```bash
# Start all nodes
docker-compose -f docker/swarm/docker-compose.multinode.yml up -d

# Verify all healthy
docker ps | grep swarm
```

## MCP Endpoints

| Agent | MCP URL | Bridge Port |
|-------|---------|-------------|
| Sophie (Claude Code) | `http://localhost:8000/mcp` | 3000 |
| Ruby (OpenAI Codex) | `http://localhost:8001/mcp` | 3001 |
| Agent Zero | `http://localhost:8002/mcp` | 3002 |

## Configure Ruby (Codex CLI)

Add to Ruby's MCP config:

```bash
# If using claude-style mcp command:
codex mcp add --transport http swarm http://localhost:8001/mcp

# Or add to config file manually
```

## Configure Agent Zero

Agent Zero auto-loads MCP from `/app/tmp/settings.json`.
The compose file mounts `mcp-settings-agent0.json` automatically.

Access Agent Zero UI: http://localhost:5000

## Available Tools

All agents get these swarm tools:

| Tool | Description |
|------|-------------|
| `swarm_info` | Node identity and status |
| `swarm_peers` | List connected peers |
| `swarm_broadcast` | Send message to all peers |
| `swarm_inbox` | Check incoming messages |
| `swarm_memory_write` | Append to shared Hypercore log |
| `swarm_memory_read` | Read from shared memory |
| `swarm_topics` | List joined topics |
| `swarm_join_topic` | Join a topic |
| `swarm_leave_topic` | Leave a topic |
| `swarm_set_manifest` | Update agent capabilities |

## Test Communication

```bash
# Sophie broadcasts
curl -X POST http://localhost:8000/mcp -H "Content-Type: application/json" \
  -d '{"method":"tools/call","params":{"name":"swarm_broadcast","arguments":{"content":"Hello from Sophie!"}}}'

# Ruby checks inbox
curl -X POST http://localhost:8001/mcp -H "Content-Type: application/json" \
  -d '{"method":"tools/call","params":{"name":"swarm_inbox"}}'
```

## Troubleshooting

**Nodes not discovering each other?**
- DHT discovery takes 30-60 seconds
- All nodes must join the same topic (auto-joined: `agent-zero-swarm-poc`)
- Check: `curl http://localhost:3000/peers`

**MCP tools not loading?**
- Restart the AI client session after adding MCP config
- Avoid hyphens in MCP server names (use `swarm` not `swarm-mcp`)
