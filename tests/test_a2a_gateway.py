#!/usr/bin/env python3
"""
Test A2A Gateway - Google A2A Protocol Compliance

Run with: python tests/test_a2a_gateway.py

Requires pear_bridge running on localhost:3000
"""

import requests
import json
import sys
import os

BRIDGE_URL = os.environ.get("BRIDGE_URL", "http://localhost:3000")


def test_agent_card():
    """Test Agent Card endpoint returns valid A2A Agent Card"""
    print("\n=== Test: GET /.well-known/agent-card.json ===")

    response = requests.get(f"{BRIDGE_URL}/.well-known/agent-card.json")

    print(f"Status: {response.status_code}")
    data = response.json()
    print(f"Response: {json.dumps(data, indent=2)}")

    assert response.status_code == 200

    # Required A2A Agent Card fields
    assert "protocolVersion" in data
    assert "name" in data
    assert "description" in data
    assert "url" in data
    assert "capabilities" in data
    assert "skills" in data

    # Capabilities structure
    assert "streaming" in data["capabilities"]
    assert "pushNotifications" in data["capabilities"]

    # URL should point to A2A endpoint
    assert "/a2a/v1" in data["url"]

    print("Agent Card validation passed!")
    return data


def test_json_rpc_invalid_method():
    """Test JSON-RPC error response for invalid method"""
    print("\n=== Test: Invalid Method Error ===")

    response = requests.post(f"{BRIDGE_URL}/a2a/v1", json={
        "jsonrpc": "2.0",
        "id": 1,
        "method": "invalid/method",
        "params": {}
    })

    print(f"Status: {response.status_code}")
    data = response.json()
    print(f"Response: {json.dumps(data, indent=2)}")

    assert response.status_code == 200  # JSON-RPC errors are 200 with error payload
    assert "error" in data
    assert data["error"]["code"] == -32601  # Method not found
    assert data["id"] == 1

    print("Invalid method test passed!")


def test_json_rpc_invalid_params():
    """Test JSON-RPC error response for invalid params"""
    print("\n=== Test: Invalid Params Error ===")

    response = requests.post(f"{BRIDGE_URL}/a2a/v1", json={
        "jsonrpc": "2.0",
        "id": 2,
        "method": "message/send",
        "params": {}  # Missing required 'message' field
    })

    print(f"Status: {response.status_code}")
    data = response.json()
    print(f"Response: {json.dumps(data, indent=2)}")

    assert response.status_code == 200
    assert "error" in data
    assert data["error"]["code"] == -32602  # Invalid params

    print("Invalid params test passed!")


def test_json_rpc_invalid_request():
    """Test JSON-RPC error response for invalid request structure"""
    print("\n=== Test: Invalid Request Error ===")

    # Missing jsonrpc version
    response = requests.post(f"{BRIDGE_URL}/a2a/v1", json={
        "id": 3,
        "method": "message/send",
        "params": {}
    })

    print(f"Status: {response.status_code}")
    data = response.json()
    print(f"Response: {json.dumps(data, indent=2)}")

    assert response.status_code == 200
    assert "error" in data
    assert data["error"]["code"] == -32600  # Invalid request

    print("Invalid request test passed!")


def test_message_send():
    """Test message/send creates KTP task and returns A2A task"""
    print("\n=== Test: message/send ===")

    response = requests.post(f"{BRIDGE_URL}/a2a/v1", json={
        "jsonrpc": "2.0",
        "id": 4,
        "method": "message/send",
        "params": {
            "message": {
                "role": "user",
                "parts": [
                    {"kind": "text", "text": "Hello from A2A gateway test"}
                ]
            }
        }
    })

    print(f"Status: {response.status_code}")
    data = response.json()
    print(f"Response: {json.dumps(data, indent=2)}")

    assert response.status_code == 200
    assert "result" in data
    assert "task" in data["result"]

    task = data["result"]["task"]
    assert "id" in task
    assert "status" in task
    assert "state" in task["status"]

    # State should be one of A2A valid states
    assert task["status"]["state"] in ["submitted", "working", "completed", "failed"]

    print(f"message/send created task: {task['id']}")
    return task["id"]


def test_message_send_with_context():
    """Test message/send with contextId for conversation grouping"""
    print("\n=== Test: message/send with contextId ===")

    context_id = "test-conversation-123"

    response = requests.post(f"{BRIDGE_URL}/a2a/v1", json={
        "jsonrpc": "2.0",
        "id": 5,
        "method": "message/send",
        "params": {
            "message": {
                "role": "user",
                "parts": [
                    {"kind": "text", "text": "First message in conversation"}
                ]
            },
            "contextId": context_id
        }
    })

    data = response.json()
    print(f"Response: {json.dumps(data, indent=2)}")

    assert "result" in data
    task = data["result"]["task"]
    assert task.get("contextId") == context_id

    print(f"Conversation context test passed!")
    return task["id"]


def test_tasks_get(task_id):
    """Test tasks/get returns A2A-formatted task"""
    print(f"\n=== Test: tasks/get (taskId={task_id}) ===")

    response = requests.post(f"{BRIDGE_URL}/a2a/v1", json={
        "jsonrpc": "2.0",
        "id": 6,
        "method": "tasks/get",
        "params": {
            "taskId": task_id
        }
    })

    print(f"Status: {response.status_code}")
    data = response.json()
    print(f"Response: {json.dumps(data, indent=2)}")

    assert response.status_code == 200
    assert "result" in data
    assert "task" in data["result"]

    task = data["result"]["task"]
    assert task["id"] == task_id
    assert "status" in task
    assert "state" in task["status"]

    print("tasks/get test passed!")
    return task


def test_tasks_get_not_found():
    """Test tasks/get returns error for non-existent task"""
    print("\n=== Test: tasks/get (not found) ===")

    response = requests.post(f"{BRIDGE_URL}/a2a/v1", json={
        "jsonrpc": "2.0",
        "id": 7,
        "method": "tasks/get",
        "params": {
            "taskId": "non-existent-task-id"
        }
    })

    print(f"Status: {response.status_code}")
    data = response.json()
    print(f"Response: {json.dumps(data, indent=2)}")

    assert response.status_code == 200
    assert "error" in data
    assert data["error"]["code"] == -32001  # Task not found

    print("tasks/get not found test passed!")


def test_tasks_list():
    """Test tasks/list returns all tasks in A2A format"""
    print("\n=== Test: tasks/list ===")

    response = requests.post(f"{BRIDGE_URL}/a2a/v1", json={
        "jsonrpc": "2.0",
        "id": 8,
        "method": "tasks/list",
        "params": {}
    })

    print(f"Status: {response.status_code}")
    data = response.json()
    print(f"Response (truncated): tasks count = {len(data.get('result', {}).get('tasks', []))}")

    assert response.status_code == 200
    assert "result" in data
    assert "tasks" in data["result"]
    assert isinstance(data["result"]["tasks"], list)

    # Each task should have A2A structure
    for task in data["result"]["tasks"][:3]:  # Check first 3
        assert "id" in task
        assert "status" in task
        assert "state" in task["status"]

    print(f"tasks/list returned {len(data['result']['tasks'])} tasks")
    return data["result"]["tasks"]


def test_tasks_list_with_filter():
    """Test tasks/list with state filter"""
    print("\n=== Test: tasks/list with filter ===")

    response = requests.post(f"{BRIDGE_URL}/a2a/v1", json={
        "jsonrpc": "2.0",
        "id": 9,
        "method": "tasks/list",
        "params": {
            "state": "submitted"
        }
    })

    data = response.json()
    print(f"Filtered by state=submitted: {len(data.get('result', {}).get('tasks', []))} tasks")

    assert response.status_code == 200
    assert "result" in data

    # All returned tasks should have the filtered state
    for task in data["result"]["tasks"]:
        assert task["status"]["state"] == "submitted"

    print("tasks/list filter test passed!")


def test_state_mapping():
    """Test that KTP states map correctly to A2A states"""
    print("\n=== Test: State Mapping Verification ===")

    # Create a task via message/send
    response = requests.post(f"{BRIDGE_URL}/a2a/v1", json={
        "jsonrpc": "2.0",
        "id": 10,
        "method": "message/send",
        "params": {
            "message": {
                "role": "user",
                "parts": [{"kind": "text", "text": "State mapping test"}]
            }
        }
    })

    data = response.json()
    task = data["result"]["task"]

    # New tasks should be in 'submitted' or 'working' state
    valid_initial_states = ["submitted", "working"]
    assert task["status"]["state"] in valid_initial_states, \
        f"Expected state in {valid_initial_states}, got {task['status']['state']}"

    print(f"State mapping test passed! Initial state: {task['status']['state']}")


def main():
    print("=" * 60)
    print("A2A Gateway - Google A2A Protocol Compliance Tests")
    print("=" * 60)

    try:
        # Check bridge is running
        response = requests.get(f"{BRIDGE_URL}/health", timeout=2)
        print(f"Bridge health: {response.json()}")
    except requests.exceptions.ConnectionError:
        print(f"ERROR: Bridge not running at {BRIDGE_URL}")
        print("Start with: cd pear_bridge && node index.js")
        sys.exit(1)

    try:
        # Run tests
        test_agent_card()
        test_json_rpc_invalid_method()
        test_json_rpc_invalid_params()
        test_json_rpc_invalid_request()

        task_id = test_message_send()
        test_message_send_with_context()
        test_tasks_get(task_id)
        test_tasks_get_not_found()
        test_tasks_list()
        test_tasks_list_with_filter()
        test_state_mapping()

        print("\n" + "=" * 60)
        print("ALL A2A GATEWAY TESTS PASSED!")
        print("=" * 60)

    except AssertionError as e:
        print(f"\nTEST FAILED: {e}")
        sys.exit(1)
    except Exception as e:
        print(f"\nERROR: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)


if __name__ == "__main__":
    main()
