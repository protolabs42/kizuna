# Agent Zero: Multiplayer Mode - Dev Swarm

## The Vision

> **"A private, encrypted multiplayer mode for Agent Zero."**

- You run your agent locally (like always)
- You join a topic/swarm with people you trust
- Your agents share research, split tasks, pool knowledge
- Everything stays off corporate servers

## What This Directory Is

This is a **developer verification harness** — NOT production deployment.

It simulates multiple Agent Zero nodes on a single machine so developers can test:
- Hyperswarm DHT peer discovery
- Cross-agent messaging (broadcast/inbox)
- Shared memory and storage

**In production**, each user runs ONE agent on their own PC, connecting to real peers over the internet:

```
User A (their PC)          User B (their PC)
┌─────────────┐            ┌─────────────┐
│ bridge      │◄──DHT/WAN─►│ bridge      │
│ agent (UI)  │            │ agent (UI)  │
└─────────────┘            └─────────────┘
     ▲                          ▲
     │                          │
   Human A                   Human B
```

## Quick Start

```bash
# From repo root
cd /path/to/agent-zero

# Build and start (first time: ~5-10 min)
docker-compose -f docker/swarm/docker-compose.swarm.yml up -d --build

# Check status
docker-compose -f docker/swarm/docker-compose.swarm.yml ps
```

## Verify It Works

```bash
# Check bridges are up
curl http://localhost:3000/info   # Bridge A
curl http://localhost:3001/info   # Bridge B

# Wait ~30s for DHT discovery, then check peers
curl http://localhost:3000/peers  # Should show count > 0

# Run integration tests
python tests/test_multinode_integration.py
```

## Access Web UIs

- Agent A: http://localhost:50080
- Agent B: http://localhost:50081

## Teardown

```bash
# Stop containers (keep data)
docker-compose -f docker/swarm/docker-compose.swarm.yml down

# Stop and DELETE all data
docker-compose -f docker/swarm/docker-compose.swarm.yml down -v
```

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    Docker Network                        │
│  ┌─────────────┐              ┌─────────────┐           │
│  │  bridge-a   │◄────DHT─────►│  bridge-b   │           │
│  │  (Node.js)  │   discovery  │  (Node.js)  │           │
│  │  :3000      │              │  :3001      │           │
│  └──────┬──────┘              └──────┬──────┘           │
│         │ HTTP                       │ HTTP             │
│  ┌──────▼──────┐              ┌──────▼──────┐           │
│  │  agent-a    │              │  agent-b    │           │
│  │  (Python)   │              │  (Python)   │           │
│  │  :50080 UI  │              │  :50081 UI  │           │
│  └─────────────┘              └─────────────┘           │
└─────────────────────────────────────────────────────────┘
```

## Related

- Epic: `agent-zero-1-2nd` (Multiplayer Mode)
- Main docs: [CLAUDE.md](../../CLAUDE.md)
