#!/usr/bin/env python3
"""
Test Kizuna Task Protocol (KTP) - Task Delegation Endpoints

Run with: python tests/test_ktp_protocol.py

Requires pear_bridge running on localhost:3000
"""

import requests
import json
import sys

BRIDGE_URL = "http://localhost:3000"


def test_task_request():
    """Test sending a task request"""
    print("\n=== Test: POST /task/request ===")

    response = requests.post(f"{BRIDGE_URL}/task/request", json={
        "description": "Analyze this smart contract for vulnerabilities",
        "task_type": "analysis",
        "priority": "high",
        "context": {"contract": "0x1234..."}
    })

    print(f"Status: {response.status_code}")
    data = response.json()
    print(f"Response: {json.dumps(data, indent=2)}")

    assert response.status_code == 200
    assert "task_id" in data
    assert data["status"] == "sent"

    return data["task_id"]


def test_tasks_list():
    """Test listing all tasks"""
    print("\n=== Test: GET /tasks ===")

    response = requests.get(f"{BRIDGE_URL}/tasks")

    print(f"Status: {response.status_code}")
    data = response.json()
    print(f"Response: {json.dumps(data, indent=2)}")

    assert response.status_code == 200
    assert "sent" in data
    assert "received" in data

    return data


def test_task_status(task_id):
    """Test getting status of a specific task"""
    print(f"\n=== Test: GET /task/status/{task_id} ===")

    response = requests.get(f"{BRIDGE_URL}/task/status/{task_id}")

    print(f"Status: {response.status_code}")
    data = response.json()
    print(f"Response: {json.dumps(data, indent=2)}")

    assert response.status_code == 200
    assert data["task_id"] == task_id

    return data


def test_capability_search():
    """Test capability discovery"""
    print("\n=== Test: GET /capabilities/search ===")

    # Search without filters (should return all peers)
    response = requests.get(f"{BRIDGE_URL}/capabilities/search")

    print(f"Status: {response.status_code}")
    data = response.json()
    print(f"Response: {json.dumps(data, indent=2)}")

    assert response.status_code == 200
    assert "matches" in data

    # Search with skill filter
    response = requests.get(f"{BRIDGE_URL}/capabilities/search?skill=python")
    print(f"Skill filter response: {response.json()}")

    return data


def test_task_validation():
    """Test task request validation"""
    print("\n=== Test: Task Validation ===")

    # Missing description should fail
    response = requests.post(f"{BRIDGE_URL}/task/request", json={
        "task_type": "analysis"
    })

    print(f"Missing description - Status: {response.status_code}")
    assert response.status_code == 400

    print("Validation test passed!")


def main():
    print("=" * 50)
    print("Kizuna Task Protocol (KTP) - Task Delegation Tests")
    print("=" * 50)

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
        task_id = test_task_request()
        test_tasks_list()
        test_task_status(task_id)
        test_capability_search()
        test_task_validation()

        print("\n" + "=" * 50)
        print("ALL TESTS PASSED!")
        print("=" * 50)

    except AssertionError as e:
        print(f"\nTEST FAILED: {e}")
        sys.exit(1)
    except Exception as e:
        print(f"\nERROR: {e}")
        sys.exit(1)


if __name__ == "__main__":
    main()
