#!/usr/bin/env python3
"""
Multi-Node Integration Test for Agent Zero SwarmOS

This test verifies end-to-end P2P communication between multiple bridge nodes.

Prerequisites:
    1. Node A running: node pear_bridge/index.js
    2. Node B running: PORT=3001 DATA_DIR=./node_b node pear_bridge/index.js

Usage:
    python tests/test_multinode_integration.py

    # Or with custom ports
    python tests/test_multinode_integration.py --node-a http://localhost:3000 --node-b http://localhost:3001
"""

import asyncio
import aiohttp
import argparse
import sys
import time
import uuid


class MultiNodeTester:
    def __init__(self, node_a_url: str, node_b_url: str):
        self.node_a = node_a_url.rstrip('/')
        self.node_b = node_b_url.rstrip('/')
        self.session = None
        self.results = []

    async def __aenter__(self):
        self.session = aiohttp.ClientSession()
        return self

    async def __aexit__(self, *args):
        if self.session:
            await self.session.close()

    def log(self, test_name: str, passed: bool, detail: str = ""):
        status = "✅ PASS" if passed else "❌ FAIL"
        self.results.append((test_name, passed))
        print(f"{status}: {test_name}")
        if detail:
            print(f"       {detail}")

    async def check_node_health(self, url: str, name: str) -> bool:
        """Verify a node is running and responsive."""
        try:
            async with self.session.get(f"{url}/info", timeout=aiohttp.ClientTimeout(total=5)) as resp:
                if resp.status == 200:
                    data = await resp.json()
                    return 'peerId' in data
        except Exception as e:
            print(f"  {name} health check failed: {e}")
        return False

    async def test_1_nodes_online(self):
        """Test: Both nodes are online and responding."""
        a_ok = await self.check_node_health(self.node_a, "Node A")
        b_ok = await self.check_node_health(self.node_b, "Node B")
        self.log("1. Nodes Online", a_ok and b_ok,
                 f"Node A: {'up' if a_ok else 'down'}, Node B: {'up' if b_ok else 'down'}")
        return a_ok and b_ok

    async def test_2_unique_identities(self):
        """Test: Each node has a unique identity."""
        try:
            async with self.session.get(f"{self.node_a}/info") as resp:
                info_a = await resp.json()
            async with self.session.get(f"{self.node_b}/info") as resp:
                info_b = await resp.json()

            id_a = info_a.get('peerId', '')
            id_b = info_b.get('peerId', '')

            different = id_a != id_b and len(id_a) > 0 and len(id_b) > 0
            self.log("2. Unique Identities", different,
                     f"A: {id_a[:16]}..., B: {id_b[:16]}...")
            return different
        except Exception as e:
            self.log("2. Unique Identities", False, str(e))
            return False

    async def test_3_peer_discovery(self, timeout_sec: int = 10):
        """Test: Nodes discover each other via DHT."""
        # Join a test topic on both nodes
        topic = f"test-topic-{uuid.uuid4().hex[:8]}"

        try:
            await self.session.post(f"{self.node_a}/join", json={"topic": topic})
            await self.session.post(f"{self.node_b}/join", json={"topic": topic})
        except Exception as e:
            self.log("3. Peer Discovery", False, f"Failed to join topic: {e}")
            return False

        # Wait for DHT discovery
        print(f"  Waiting for DHT discovery (up to {timeout_sec}s)...")

        start = time.time()
        while time.time() - start < timeout_sec:
            try:
                async with self.session.get(f"{self.node_a}/peers") as resp:
                    peers_a = await resp.json()
                async with self.session.get(f"{self.node_b}/peers") as resp:
                    peers_b = await resp.json()

                count_a = peers_a.get('count', 0)
                count_b = peers_b.get('count', 0)

                if count_a > 0 and count_b > 0:
                    self.log("3. Peer Discovery", True,
                             f"A sees {count_a} peer(s), B sees {count_b} peer(s)")
                    return True
            except:
                pass
            await asyncio.sleep(1)

        self.log("3. Peer Discovery", False,
                 f"Timeout after {timeout_sec}s - nodes did not find each other")
        return False

    async def test_4_broadcast_delivery(self):
        """Test: Messages broadcast from A arrive in B's inbox."""
        # Clear any existing inbox messages first
        try:
            await self.session.get(f"{self.node_b}/inbox")  # Pop clears inbox
        except:
            pass

        # Generate unique message
        test_msg = f"test-message-{uuid.uuid4().hex}"

        try:
            # Broadcast from A
            await self.session.post(f"{self.node_a}/broadcast",
                                   json={"content": {"type": "test", "payload": test_msg}})

            # Wait a bit for delivery
            await asyncio.sleep(2)

            # Check B's inbox
            async with self.session.get(f"{self.node_b}/inbox") as resp:
                inbox = await resp.json()

            messages = inbox.get('messages', [])

            # Look for our test message
            found = any(test_msg in str(m.get('content', '')) for m in messages)

            self.log("4. Broadcast Delivery", found,
                     f"Sent from A, B received {len(messages)} message(s), test msg found: {found}")
            return found
        except Exception as e:
            self.log("4. Broadcast Delivery", False, str(e))
            return False

    async def test_5_memory_append(self):
        """Test: Hypercore memory append and read."""
        try:
            test_content = f"memory-test-{uuid.uuid4().hex}"

            # Append to Node A's memory
            async with self.session.post(f"{self.node_a}/memory",
                                        json={"content": test_content}) as resp:
                result = await resp.json()

            if not result.get('success'):
                self.log("5. Memory (Hypercore)", False, "Append failed")
                return False

            # Read back
            async with self.session.get(f"{self.node_a}/memory") as resp:
                memory = await resp.json()

            entries = memory.get('memory', [])
            found = any(test_content in str(e.get('content', '')) for e in entries)

            self.log("5. Memory (Hypercore)", found,
                     f"Appended and retrieved {len(entries)} entries")
            return found
        except Exception as e:
            self.log("5. Memory (Hypercore)", False, str(e))
            return False

    async def test_6_storage_roundtrip(self):
        """Test: Hyperdrive storage upload and download."""
        import base64

        try:
            test_filename = f"test-{uuid.uuid4().hex[:8]}.txt"
            test_content = f"Hello from integration test at {time.time()}"
            encoded = base64.b64encode(test_content.encode()).decode()

            # Upload
            async with self.session.post(f"{self.node_a}/storage",
                                        json={"filename": test_filename, "content": encoded}) as resp:
                result = await resp.json()

            if not result.get('success'):
                self.log("6. Storage (Hyperdrive)", False, "Upload failed")
                return False

            # Download
            async with self.session.get(f"{self.node_a}/storage/{test_filename}") as resp:
                data = await resp.json()

            retrieved = base64.b64decode(data.get('content', '')).decode()
            matched = retrieved == test_content

            self.log("6. Storage (Hyperdrive)", matched,
                     f"Uploaded and retrieved file: {test_filename}")
            return matched
        except Exception as e:
            self.log("6. Storage (Hyperdrive)", False, str(e))
            return False

    async def test_7_manifest_update(self):
        """Test: Manifest updates are broadcast to peers."""
        try:
            # Update Node A's manifest
            new_role = f"TestRole-{uuid.uuid4().hex[:4]}"
            await self.session.post(f"{self.node_a}/manifest",
                                   json={"role": new_role, "skills": ["test", "integration"]})

            # Wait for handshake re-broadcast
            await asyncio.sleep(2)

            # Check if B sees A's new manifest
            async with self.session.get(f"{self.node_b}/peers") as resp:
                peers = await resp.json()

            details = peers.get('details', [])
            found = any(d.get('manifest', {}).get('role') == new_role for d in details)

            self.log("7. Manifest Propagation", found,
                     f"Updated A's role to '{new_role}', B sees update: {found}")
            return found
        except Exception as e:
            self.log("7. Manifest Propagation", False, str(e))
            return False

    async def run_all(self):
        """Run all tests in sequence."""
        print("\n" + "="*60)
        print("AGENT ZERO SWARMOS - MULTI-NODE INTEGRATION TEST")
        print("="*60)
        print(f"Node A: {self.node_a}")
        print(f"Node B: {self.node_b}")
        print("="*60 + "\n")

        # Test 1: Basic health
        if not await self.test_1_nodes_online():
            print("\n⚠️  Nodes not running. Start them first:")
            print("   Terminal 1: node pear_bridge/index.js")
            print("   Terminal 2: PORT=3001 DATA_DIR=./node_b node pear_bridge/index.js")
            return False

        # Run remaining tests
        await self.test_2_unique_identities()
        await self.test_3_peer_discovery()
        await self.test_4_broadcast_delivery()
        await self.test_5_memory_append()
        await self.test_6_storage_roundtrip()
        await self.test_7_manifest_update()

        # Summary
        passed = sum(1 for _, p in self.results if p)
        total = len(self.results)

        print("\n" + "="*60)
        print(f"RESULTS: {passed}/{total} tests passed")
        print("="*60)

        return passed == total


async def main():
    parser = argparse.ArgumentParser(description='Multi-node integration test')
    parser.add_argument('--node-a', default='http://localhost:3000', help='Node A URL')
    parser.add_argument('--node-b', default='http://localhost:3001', help='Node B URL')
    args = parser.parse_args()

    async with MultiNodeTester(args.node_a, args.node_b) as tester:
        success = await tester.run_all()
        sys.exit(0 if success else 1)


if __name__ == "__main__":
    if sys.platform == 'win32':
        asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())
    asyncio.run(main())
