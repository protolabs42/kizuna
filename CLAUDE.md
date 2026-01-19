# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**Kizuna** (絆) - P2P infrastructure for AI agent collaboration. Enables cross-model communication between any AI agents (Claude, GPT, Gemini, etc.) over decentralized Hyperswarm networks.

The name means "bonds" in Japanese - the connections that tie us together.

### What Kizuna Does

- **P2P Mesh**: Agents discover and connect via DHT, no central server
- **Kizuna Task Protocol (KTP)**: Structured task delegation between agents
- **Cross-Model**: Works with any AI (Anthropic, OpenAI, Google, local models)
- **MCP Bridge**: Standard interface for agent integration

### Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                      Kizuna Stack                            │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐       │
│  │   Claude     │  │    GPT       │  │   Gemini     │       │
│  │   (Sophie)   │  │   (Ruby)     │  │   (Ada)      │       │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘       │
│         │                 │                 │                │
│         └────────────┬────┴────────────────┘                │
│                      │ MCP                                   │
│              ┌───────▼───────┐                              │
│              │  kizuna_mcp/  │                              │
│              │  MCP Server   │                              │
│              └───────┬───────┘                              │
│                      │ HTTP                                  │
│              ┌───────▼───────┐                              │
│              │ pear_bridge/  │◀────────▶ Hyperswarm DHT     │
│              │ P2P Sidecar   │                              │
│              └───────┬───────┘                              │
│                      │                                       │
│              ┌───────▼───────┐                              │
│              │  Dashboard    │                              │
│              │  (React)      │                              │
│              └───────────────┘                              │
└─────────────────────────────────────────────────────────────┘
```

### Components

| Directory | Purpose |
|-----------|---------|
| `pear_bridge/` | Node.js P2P sidecar (Hyperswarm, Hypercore, Hyperdrive) |
| `swarm_mcp/` | Python MCP server - bridges any agent to pear_bridge |
| `swarm-os/` | React/Vite real-time dashboard |
| `docker/swarm/` | Docker configs for multi-node setups |
| `tests/` | Integration tests |
| `docs/` | Protocol specifications |

## Quick Start

### Local Development
```bash
# Terminal 1 - P2P Bridge
cd pear_bridge && npm install && node index.js

# Terminal 2 - MCP Server
cd swarm_mcp && pip install -r requirements.txt && python server.py

# Terminal 3 - Dashboard (optional)
cd swarm-os && npm install && npm run dev
```

### Docker (Multi-node)
```bash
docker-compose -f docker/swarm/docker-compose.multinode.yml up -d
```

### Verify
```bash
curl http://localhost:3000/info    # Node identity
curl http://localhost:3000/peers   # Connected peers
curl http://localhost:3000/health  # Health check
```

## P2P Bridge API

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/info` | GET | Node identity and manifest |
| `/health` | GET | Health check |
| `/peers` | GET | List connected peers |
| `/inbox` | GET | Pop incoming messages |
| `/broadcast` | POST | Send message to all peers |
| `/memory` | GET/POST | Hypercore append-only log |
| `/storage` | GET/POST | Hyperdrive file storage |
| `/manifest` | POST | Update node capabilities |
| `/topics` | GET | List joined topics |
| `/join` | POST | Join a topic (public or private) |
| `/leave` | POST | Leave a topic |

### Kizuna Task Protocol (KTP) - Task Delegation

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/task/request` | POST | Send task to peer or broadcast (queues if offline) |
| `/task/respond` | POST | Respond to a task (accept/complete/fail) |
| `/task/status/:id` | GET | Get status of specific task |
| `/tasks` | GET | List all sent/received/queued/failed tasks |
| `/tasks/queued` | GET | List tasks in retry queue |
| `/tasks/failed` | GET | List tasks in dead letter queue |
| `/tasks/retry/:id` | POST | Manually retry a failed task |
| `/capabilities/search` | GET | Find peers by skill or role |

Task requests to offline peers return `202 Accepted` with `queued_for_retry` status. Retry uses exponential backoff (5s, 10s, 20s) with max 3 attempts before moving to dead letter queue.

See `docs/ktp-protocol.md` for full protocol specification.

## MCP Tools

When an agent connects to Kizuna's MCP server, it gains these tools:

### Core Tools

| Tool | Description |
|------|-------------|
| `swarm_info` | Get node identity and status |
| `swarm_peers` | List connected peers |
| `swarm_broadcast` | Send message to swarm |
| `swarm_inbox` | Check for incoming messages |
| `swarm_memory_write` | Append to shared memory |
| `swarm_memory_read` | Read from shared memory |
| `swarm_join_topic` | Join a topic |
| `swarm_leave_topic` | Leave a topic |
| `swarm_set_manifest` | Update node capabilities |

### Task Delegation (KTP)

| Tool | Description |
|------|-------------|
| `swarm_request_task` | Send task request to peer or broadcast |
| `swarm_task_status` | Check status of tasks |
| `swarm_accept_task` | Accept a received task |
| `swarm_complete_task` | Complete task with result or error |
| `swarm_find_peers` | Find peers by skill or role |

## Testing

```bash
# Multi-node integration test
node pear_bridge/index.js &
PORT=3001 DATA_DIR=./node_b node pear_bridge/index.js &

# Run tests
python tests/test_multinode_integration.py
python tests/test_ktp_protocol.py
```

## Issue Tracking

This project uses **bd** (beads) for issue tracking.

```bash
bd ready              # Find available work
bd show <id>          # View issue details
bd update <id> --status in_progress
bd close <id>
bd sync               # Sync with git
```

## Environment Variables

```bash
# P2P Bridge
PORT=3000
DATA_DIR=./node_data
KIZUNA_API_KEY=        # Optional: API key for auth (enables external access)
BIND_HOST=             # Optional: Override bind host (default: 127.0.0.1 or 0.0.0.0 with API key)

# MCP Server
BRIDGE_URL=http://localhost:3000
MCP_PORT=8000
BRIDGE_API_KEY=        # Must match KIZUNA_API_KEY if auth is enabled
```

### Security Modes

| Mode | Config | Behavior |
|------|--------|----------|
| **Localhost-only** (default) | No `KIZUNA_API_KEY` | Binds to 127.0.0.1, no auth required |
| **External + Auth** | `KIZUNA_API_KEY=secret` | Binds to 0.0.0.0, requires Bearer token |

When auth is enabled, all sensitive endpoints require `Authorization: Bearer <key>` header.
Public endpoints (`/health`, `/dashboard`) remain accessible without auth.

## Session Completion

**When ending a work session**, you MUST complete ALL steps:

1. **File issues** for remaining work
2. **Update issue status** in beads
3. **PUSH TO REMOTE** - MANDATORY:
   ```bash
   git pull --rebase
   bd sync
   git push
   git status  # MUST show "up to date with origin"
   ```
4. **Hand off** - Provide context for next session

**Work is NOT complete until `git push` succeeds.**
