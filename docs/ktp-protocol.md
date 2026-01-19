# Kizuna Task Protocol (KTP) - Agent-to-Agent Task Delegation

*Part of the Kizuna (絆) project - P2P infrastructure for AI agent collaboration*

> **Note**: KTP is Kizuna's native P2P task protocol designed for mesh networks. It is not compliant with Google's A2A protocol, which uses HTTP/JSON-RPC 2.0. A future A2A-compliant HTTP gateway is planned for interoperability with external agents.

## Overview

The Kizuna Task Protocol enables structured task delegation between agents in the Kizuna mesh. Beyond simple chat messages, agents can now request work from peers, track task status, and receive results asynchronously.

## Message Schema

### Task Request

```json
{
  "type": "task_request",
  "task_id": "uuid-v4",
  "task_type": "analysis|code|search|general",
  "payload": {
    "description": "What needs to be done",
    "context": {},
    "priority": "low|medium|high|critical"
  },
  "deadline": 1705432800000,
  "sender": "peer-id-short",
  "target": "peer-id-short|*"
}
```

### Task Response

```json
{
  "type": "task_response",
  "task_id": "uuid-v4",
  "status": "accepted|rejected|in_progress|completed|failed",
  "result": {},
  "error": null,
  "responder": "peer-id-short"
}
```

## Task State Machine

```
                 ┌──────────────┐
                 │   PENDING    │
                 └──────┬───────┘
                        │ peer receives
                        ▼
        ┌───────────────┼───────────────┐
        │               │               │
        ▼               ▼               ▼
   ┌─────────┐    ┌──────────┐    ┌──────────┐
   │REJECTED │    │ ACCEPTED │    │ TIMEOUT  │
   └─────────┘    └────┬─────┘    └──────────┘
                       │
                       ▼
                ┌─────────────┐
                │ IN_PROGRESS │
                └──────┬──────┘
                       │
           ┌───────────┼───────────┐
           ▼                       ▼
     ┌───────────┐          ┌──────────┐
     │ COMPLETED │          │  FAILED  │
     └───────────┘          └──────────┘
```

## Bridge Endpoints

### POST /task/request

Send a task request to a peer or broadcast to all.

**Request:**
```json
{
  "task_type": "analysis",
  "description": "Analyze this smart contract for vulnerabilities",
  "context": { "contract_address": "0x..." },
  "target": "abc12345",
  "priority": "high",
  "deadline": 1705432800000
}
```

**Response:**
```json
{
  "task_id": "550e8400-e29b-41d4-a716-446655440000",
  "status": "sent",
  "target": "abc12345"
}
```

### POST /task/respond

Respond to a task (accept, complete, fail, reject).

**Request:**
```json
{
  "task_id": "550e8400-e29b-41d4-a716-446655440000",
  "status": "completed",
  "result": { "analysis": "No vulnerabilities found" }
}
```

### GET /task/status/:task_id

Check status of a specific task.

### GET /tasks

List all pending/active tasks (both sent and received).

**Response:**
```json
{
  "sent": [
    { "task_id": "...", "status": "in_progress", "target": "abc12345" }
  ],
  "received": [
    { "task_id": "...", "status": "pending", "from": "def67890" }
  ]
}
```

## MCP Tools

### swarm_request_task

Send a task request to a specific peer or broadcast.

```python
swarm_request_task(
    task_type="analysis",
    description="Analyze this contract",
    target="abc12345",  # Optional: specific peer or "*" for broadcast
    context={},
    priority="high"
)
```

### swarm_task_status

Check status of sent/received tasks.

```python
swarm_task_status(task_id="...")  # Specific task
swarm_task_status()  # All tasks
```

### swarm_complete_task

Complete a task with result or error.

```python
swarm_complete_task(
    task_id="...",
    result={"analysis": "..."},
    error=None
)
```

## Capability Discovery

Agents advertise capabilities via manifest. Query with:

### GET /capabilities/search?skill=python

Find peers with specific skills.

**Response:**
```json
{
  "matches": [
    {
      "peer_id": "abc12345",
      "agent_id": "Ruby",
      "role": "Coder",
      "skills": ["python", "rust", "solana"]
    }
  ]
}
```

## Example Flow

1. **Sophie** wants Ruby to analyze a contract
2. Sophie calls `swarm_request_task(task_type="analysis", target="ruby", ...)`
3. **Bridge** sends task_request message to Ruby's peer
4. **Ruby** receives task in inbox, sees it's a structured task
5. Ruby calls `swarm_complete_task(task_id="...", result={...})`
6. **Bridge** sends task_response back to Sophie
7. **Sophie** calls `swarm_task_status()` and sees completed task with result

## Security Notes

- Tasks are signed like all swarm messages
- Only the target peer can respond to a task
- Task IDs are UUIDs to prevent collision/spoofing
- Deadline enforcement is advisory (clients decide)
