"""HTTP client for communicating with the Pear Bridge P2P sidecar."""

import httpx
import os
from typing import Any

BRIDGE_URL = os.getenv("BRIDGE_URL", "http://localhost:3000")


async def get(endpoint: str) -> dict[str, Any]:
    """Make a GET request to the bridge."""
    async with httpx.AsyncClient(timeout=30.0) as client:
        response = await client.get(f"{BRIDGE_URL}{endpoint}")
        response.raise_for_status()
        return response.json()


async def post(endpoint: str, data: dict[str, Any]) -> dict[str, Any]:
    """Make a POST request to the bridge."""
    async with httpx.AsyncClient(timeout=30.0) as client:
        response = await client.post(f"{BRIDGE_URL}{endpoint}", json=data)
        response.raise_for_status()
        return response.json()


async def health_check() -> bool:
    """Check if the bridge is healthy."""
    try:
        result = await get("/health")
        return result.get("status") in ("healthy", "degraded")
    except Exception:
        return False
