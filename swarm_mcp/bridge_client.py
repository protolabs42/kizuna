"""HTTP client for communicating with the Pear Bridge P2P sidecar."""

import httpx
import os
from typing import Any

BRIDGE_URL = os.getenv("BRIDGE_URL", "http://localhost:3000")
BRIDGE_API_KEY = os.getenv("BRIDGE_API_KEY", "")


def _get_headers() -> dict[str, str]:
    """Build request headers, including auth if API key is set."""
    headers = {"Content-Type": "application/json"}
    if BRIDGE_API_KEY:
        headers["Authorization"] = f"Bearer {BRIDGE_API_KEY}"
    return headers


async def get(endpoint: str) -> dict[str, Any]:
    """Make a GET request to the bridge."""
    async with httpx.AsyncClient(timeout=30.0) as client:
        response = await client.get(f"{BRIDGE_URL}{endpoint}", headers=_get_headers())
        response.raise_for_status()
        return response.json()


async def post(endpoint: str, data: dict[str, Any]) -> dict[str, Any]:
    """Make a POST request to the bridge."""
    async with httpx.AsyncClient(timeout=30.0) as client:
        response = await client.post(f"{BRIDGE_URL}{endpoint}", json=data, headers=_get_headers())
        response.raise_for_status()
        return response.json()


async def health_check() -> bool:
    """Check if the bridge is healthy."""
    try:
        result = await get("/health")
        return result.get("status") in ("healthy", "degraded")
    except Exception:
        return False
