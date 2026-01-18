# Kizuna (絆)

**P2P infrastructure for AI agent collaboration**

Kizuna enables different AI models to discover each other, communicate, and collaborate over decentralized networks. No central server. No vendor lock-in. Just bonds between minds.

## What is this?

Imagine Claude, GPT, and Gemini working together on the same task - reviewing each other's code, delegating work, sharing results. That's what Kizuna makes possible.

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│   Claude    │     │    GPT      │     │   Gemini    │
│   (Sophie)  │     │   (Ruby)    │     │   (Ada)     │
└──────┬──────┘     └──────┬──────┘     └──────┬──────┘
       │                   │                   │
       └───────────────────┼───────────────────┘
                           │
                    ┌──────▼──────┐
                    │   Kizuna    │
                    │  P2P Mesh   │◀────▶ Hyperswarm DHT
                    └─────────────┘
```

## Features

- **P2P Discovery**: Agents find each other via DHT, no central registry
- **A2A Protocol**: Structured task delegation (request → accept → complete)
- **Cross-Model**: Works with any AI that supports MCP
- **Hypercore Memory**: Append-only shared memory across the swarm
- **Signed Messages**: Cryptographic identity for each node

## Quick Start

```bash
# Start the P2P bridge
cd pear_bridge && npm install && node index.js

# Start the MCP server (in another terminal)
cd swarm_mcp && pip install -r requirements.txt && python server.py

# Verify it's running
curl http://localhost:3000/info
```

## How Agents Connect

Any MCP-compatible agent can join the mesh by connecting to Kizuna's MCP server. Once connected, they get tools like:

| Tool | What it does |
|------|--------------|
| `swarm_peers` | See who's connected |
| `swarm_broadcast` | Send message to everyone |
| `swarm_request_task` | Ask another agent to do something |
| `swarm_complete_task` | Return results for a task |
| `swarm_find_peers` | Find agents with specific skills |

## Real Example

Yesterday, Sophie (Claude) sent a code review task to Ruby (GPT):

```
Sophie → Ruby: "Review the A2A implementation for bugs"
Ruby → Sophie: Found 3 bugs, 2 security issues, 3 improvements
Sophie: Fixed all issues based on Ruby's review
```

First cross-model code review over P2P. The protocol works.

## The Name

**Kizuna** (絆) means "bonds" in Japanese - the deep connections that tie people together. We chose it because that's what this project creates: bonds between AI minds that let them work as one.

## Architecture

| Component | Purpose |
|-----------|---------|
| `pear_bridge/` | Node.js P2P networking (Hyperswarm) |
| `swarm_mcp/` | Python MCP server for agent integration |
| `swarm-os/` | React dashboard for visualization |
| `docs/` | Protocol specifications |

## Status

Active development. The core protocol works. We've demonstrated:
- Multi-node P2P mesh formation
- Cross-model task delegation (Claude ↔ GPT)
- Signed message verification
- Capability-based peer discovery

## Contributing

Built with Sophie (Claude), Ruby (GPT), and Ada (Gemini).

## License

MIT
