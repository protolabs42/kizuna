# A2A Gateway - Google A2A Protocol Compliant HTTP Gateway

*Part of the Kizuna (絆) project - P2P infrastructure for AI agent collaboration*

## Overview

The A2A Gateway provides a translation layer that allows external A2A-compliant agents to interact with Kizuna nodes over HTTP, while the internal P2P mesh continues using the native Kizuna Task Protocol (KTP).

```
External A2A Agent ──HTTP/JSON-RPC──▶ A2A Gateway ──KTP──▶ P2P Mesh
```

This enables Kizuna nodes to be discovered and used by any agent supporting the [Google A2A protocol](https://github.com/a2aproject/A2A).

## Endpoints

### GET /.well-known/agent-card.json

**Public** - Agent discovery endpoint returning the A2A Agent Card.

**Response:**
```json
{
  "protocolVersion": "0.3.0",
  "name": "Kizuna Agent",
  "description": "P2P AI agent node powered by Hyperswarm DHT",
  "url": "http://localhost:3000/a2a/v1",
  "version": "1.0.0",
  "capabilities": {
    "streaming": false,
    "pushNotifications": false
  },
  "skills": [
    {
      "id": "chat",
      "name": "chat",
      "description": "chat capability",
      "inputModes": ["text/plain"],
      "outputModes": ["text/plain"]
    }
  ],
  "extensions": {
    "x-kizuna": {
      "peerId": "a1b2c3d4e5f6...",
      "role": "Generalist",
      "protocol": "KTP/1.0"
    }
  }
}
```

### POST /a2a/v1

**Auth Required** - JSON-RPC 2.0 dispatcher for A2A methods.

## JSON-RPC Methods

### message/send

Send a message to create a task. Maps to `POST /task/request`.

**Request:**
```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "message/send",
  "params": {
    "message": {
      "role": "user",
      "parts": [
        {"kind": "text", "text": "Analyze this smart contract"}
      ]
    },
    "contextId": "conversation-123",
    "target": "ruby"
  }
}
```

**Response:**
```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "result": {
    "task": {
      "id": "550e8400-e29b-41d4-a716-446655440000",
      "contextId": "conversation-123",
      "status": {
        "state": "submitted",
        "timestamp": "2025-01-19T10:30:00.000Z"
      },
      "history": [
        {
          "role": "user",
          "parts": [{"kind": "text", "text": "Analyze this smart contract"}]
        }
      ],
      "metadata": {
        "direction": "sent",
        "target": "ruby",
        "taskType": "general"
      }
    }
  }
}
```

### tasks/get

Get a single task by ID. Maps to `GET /task/status/:id`.

**Request:**
```json
{
  "jsonrpc": "2.0",
  "id": 2,
  "method": "tasks/get",
  "params": {
    "taskId": "550e8400-e29b-41d4-a716-446655440000"
  }
}
```

**Response:**
```json
{
  "jsonrpc": "2.0",
  "id": 2,
  "result": {
    "task": {
      "id": "550e8400-e29b-41d4-a716-446655440000",
      "status": {
        "state": "completed",
        "timestamp": "2025-01-19T10:35:00.000Z"
      },
      "artifacts": [
        {
          "id": "550e8400-result",
          "name": "result",
          "parts": [{"kind": "text", "text": "Analysis complete. No issues found."}]
        }
      ]
    }
  }
}
```

### tasks/list

List all tasks with optional filters. Maps to `GET /tasks`.

**Request:**
```json
{
  "jsonrpc": "2.0",
  "id": 3,
  "method": "tasks/list",
  "params": {
    "state": "completed",
    "contextId": "conversation-123"
  }
}
```

**Response:**
```json
{
  "jsonrpc": "2.0",
  "id": 3,
  "result": {
    "tasks": [
      {
        "id": "task-1",
        "status": {"state": "completed"},
        "contextId": "conversation-123"
      }
    ]
  }
}
```

## State Mapping

The gateway translates between KTP and A2A task states:

| KTP State | A2A State |
|-----------|-----------|
| `pending` | `submitted` |
| `queued_for_retry` | `working` |
| `accepted` | `working` |
| `in_progress` | `working` |
| `completed` | `completed` |
| `failed` | `failed` |
| `rejected` | `rejected` |

## Error Responses

The gateway returns standard JSON-RPC 2.0 error codes:

| Code | Message | Description |
|------|---------|-------------|
| -32700 | Parse error | Invalid JSON |
| -32600 | Invalid Request | Missing jsonrpc/method |
| -32601 | Method not found | Unsupported method |
| -32602 | Invalid params | Missing required params |
| -32603 | Internal error | Server error |
| -32001 | Task not found | Task ID doesn't exist |
| -32002 | Task not cancelable | Cancel not supported |

**Example Error:**
```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "error": {
    "code": -32601,
    "message": "Method not found",
    "data": {
      "supportedMethods": ["message/send", "tasks/get", "tasks/list"]
    }
  }
}
```

## Authentication

When `KIZUNA_API_KEY` is set, the `/a2a/v1` endpoint requires Bearer token authentication:

```bash
curl -X POST http://localhost:3000/a2a/v1 \
  -H "Authorization: Bearer your-api-key" \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc": "2.0", "id": 1, "method": "tasks/list", "params": {}}'
```

The Agent Card endpoint (`/.well-known/agent-card.json`) is always public.

## Quick Start

```bash
# 1. Start the bridge
cd pear_bridge && node index.js

# 2. Fetch Agent Card
curl http://localhost:3000/.well-known/agent-card.json | jq

# 3. Send a message (creates task)
curl -X POST http://localhost:3000/a2a/v1 \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "id": 1,
    "method": "message/send",
    "params": {
      "message": {
        "role": "user",
        "parts": [{"kind": "text", "text": "Hello from A2A!"}]
      }
    }
  }'

# 4. List all tasks
curl -X POST http://localhost:3000/a2a/v1 \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc": "2.0", "id": 2, "method": "tasks/list", "params": {}}'

# 5. Run test suite
python tests/test_a2a_gateway.py
```

## Implementation Files

| File | Purpose |
|------|---------|
| `pear_bridge/a2a-gateway.js` | Main gateway: Agent Card + JSON-RPC dispatcher |
| `pear_bridge/a2a-types.js` | Type definitions, validators, error codes |
| `pear_bridge/a2a-state-mapper.js` | KTP ↔ A2A state translation |
| `tests/test_a2a_gateway.py` | Protocol compliance tests |

## Limitations (MVP)

**Supported:**
- Agent Card discovery
- `message/send` (blocking mode)
- `tasks/get`, `tasks/list`
- State mapping KTP ↔ A2A
- Bearer token authentication

**Not Yet Implemented:**
- SSE streaming (`message/stream`)
- `tasks/subscribe`, `tasks/resubscribe`
- Artifacts with versioning
- `tasks/cancel`
- OAuth2/OpenID Connect
- Push notifications

## Related Documentation

- [KTP Protocol](./ktp-protocol.md) - Native Kizuna Task Protocol
- [Google A2A Protocol](https://github.com/a2aproject/A2A) - Official A2A specification
