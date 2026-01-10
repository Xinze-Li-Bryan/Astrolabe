"""
API Stability Tests

Test backend API stability under various load and concurrency conditions:
1. Concurrent request handling
2. WebSocket connection stability
3. Long-running stability
4. Error recovery capability
"""
import pytest
import asyncio
import time
import httpx
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor, as_completed
from unittest.mock import patch, MagicMock


# ============================================
# Concurrent Request Tests
# ============================================

class TestConcurrentRequests:
    """Test API stability under concurrent requests"""

    def test_concurrent_health_checks(self):
        """Concurrent health check requests"""
        from astrolabe.server import app
        from fastapi.testclient import TestClient

        client = TestClient(app)
        num_requests = 50
        results = []

        def make_request():
            try:
                response = client.get("/api/health")
                return response.status_code == 200
            except Exception as e:
                return False

        with ThreadPoolExecutor(max_workers=10) as executor:
            futures = [executor.submit(make_request) for _ in range(num_requests)]
            for future in as_completed(futures):
                results.append(future.result())

        success_rate = sum(results) / len(results)
        assert success_rate >= 0.95, f"Success rate too low: {success_rate:.2%}"

    def test_concurrent_file_reads(self, tmp_path):
        """Concurrent file read requests"""
        from astrolabe.server import app
        from fastapi.testclient import TestClient

        # Create test file
        test_file = tmp_path / "test.lean"
        test_file.write_text("\n".join([f"line {i}" for i in range(1, 101)]))

        client = TestClient(app)
        num_requests = 30
        results = []

        def make_request():
            try:
                response = client.get(
                    "/api/file",
                    params={"path": str(test_file), "line": 50, "context": 10}
                )
                return response.status_code == 200
            except Exception as e:
                return False

        with ThreadPoolExecutor(max_workers=10) as executor:
            futures = [executor.submit(make_request) for _ in range(num_requests)]
            for future in as_completed(futures):
                results.append(future.result())

        success_rate = sum(results) / len(results)
        assert success_rate >= 0.95, f"Success rate too low: {success_rate:.2%}"

    def test_mixed_concurrent_operations(self, tmp_path):
        """Mixed concurrent operations (file read, health check, project status)"""
        from astrolabe.server import app
        from fastapi.testclient import TestClient

        # Create test project structure
        project_path = tmp_path / "test_project"
        project_path.mkdir()
        (project_path / "lakefile.lean").write_text("-- lakefile")
        (project_path / "Test.lean").write_text("theorem test : True := trivial")

        client = TestClient(app)
        num_requests = 60
        results = []

        def make_health_request():
            try:
                response = client.get("/api/health")
                return ("health", response.status_code == 200)
            except Exception:
                return ("health", False)

        def make_file_request():
            try:
                response = client.get(
                    "/api/file",
                    params={"path": str(project_path / "Test.lean"), "line": 1, "context": 5}
                )
                return ("file", response.status_code == 200)
            except Exception:
                return ("file", False)

        def make_status_request():
            try:
                response = client.get(
                    "/api/project/status",
                    params={"path": str(project_path)}
                )
                return ("status", response.status_code == 200)
            except Exception:
                return ("status", False)

        operations = [make_health_request, make_file_request, make_status_request]

        with ThreadPoolExecutor(max_workers=15) as executor:
            futures = []
            for i in range(num_requests):
                op = operations[i % len(operations)]
                futures.append(executor.submit(op))

            for future in as_completed(futures):
                results.append(future.result())

        # Calculate success rate by type
        by_type = {}
        for op_type, success in results:
            if op_type not in by_type:
                by_type[op_type] = {"success": 0, "total": 0}
            by_type[op_type]["total"] += 1
            if success:
                by_type[op_type]["success"] += 1

        for op_type, stats in by_type.items():
            rate = stats["success"] / stats["total"]
            assert rate >= 0.90, f"{op_type} success rate too low: {rate:.2%}"


# ============================================
# WebSocket Stability Tests
# ============================================

class TestWebSocketStability:
    """Test WebSocket connection stability"""

    def test_websocket_connect_disconnect_cycle(self, tmp_path):
        """WebSocket connect/disconnect cycle test"""
        from astrolabe.server import app
        from fastapi.testclient import TestClient

        # Create test project
        project_path = tmp_path / "test_project"
        project_path.mkdir()

        client = TestClient(app)
        cycles = 10
        successful_cycles = 0

        for i in range(cycles):
            try:
                with client.websocket_connect(
                    f"/ws/watch?path={project_path}"
                ) as websocket:
                    # Receive connection confirmation
                    data = websocket.receive_json()
                    if data.get("type") == "connected":
                        successful_cycles += 1
            except Exception as e:
                print(f"Cycle {i} failed: {e}")

        success_rate = successful_cycles / cycles
        assert success_rate >= 0.90, f"WebSocket cycle success rate too low: {success_rate:.2%}"

    def test_websocket_multiple_clients(self, tmp_path):
        """Multiple clients connecting to WebSocket simultaneously"""
        from astrolabe.server import app
        from fastapi.testclient import TestClient

        project_path = tmp_path / "test_project"
        project_path.mkdir()

        num_clients = 5
        results = []

        def connect_client(client_id):
            try:
                client = TestClient(app)
                with client.websocket_connect(
                    f"/ws/watch?path={project_path}"
                ) as websocket:
                    data = websocket.receive_json()
                    return data.get("type") == "connected"
            except Exception as e:
                print(f"Client {client_id} failed: {e}")
                return False

        with ThreadPoolExecutor(max_workers=num_clients) as executor:
            futures = [executor.submit(connect_client, i) for i in range(num_clients)]
            for future in as_completed(futures):
                results.append(future.result())

        success_rate = sum(results) / len(results)
        assert success_rate >= 0.80, f"Multi-client success rate too low: {success_rate:.2%}"

    def test_status_websocket_stability(self, tmp_path):
        """Status WebSocket connection stability"""
        from astrolabe.server import app
        from fastapi.testclient import TestClient

        project_path = tmp_path / "test_project"
        project_path.mkdir()

        client = TestClient(app)
        cycles = 5
        successful_cycles = 0

        for i in range(cycles):
            try:
                with client.websocket_connect(
                    f"/ws/status?path={project_path}"
                ) as websocket:
                    data = websocket.receive_json()
                    if data.get("type") == "connected":
                        successful_cycles += 1
            except Exception as e:
                print(f"Status WS cycle {i} failed: {e}")

        success_rate = successful_cycles / cycles
        assert success_rate >= 0.80, f"Status WebSocket success rate too low: {success_rate:.2%}"


# ============================================
# Response Time Tests
# ============================================

class TestResponseTimes:
    """Test API response times"""

    def test_health_check_response_time(self):
        """Health check should respond within 100ms"""
        from astrolabe.server import app
        from fastapi.testclient import TestClient

        client = TestClient(app)
        times = []

        for _ in range(20):
            start = time.time()
            response = client.get("/api/health")
            elapsed = time.time() - start
            times.append(elapsed)
            assert response.status_code == 200

        avg_time = sum(times) / len(times)
        max_time = max(times)

        assert avg_time < 0.1, f"Average response time too slow: {avg_time:.3f}s"
        assert max_time < 0.5, f"Max response time too slow: {max_time:.3f}s"

    def test_file_read_response_time(self, tmp_path):
        """File read should respond within 200ms"""
        from astrolabe.server import app
        from fastapi.testclient import TestClient

        # Create a larger test file
        test_file = tmp_path / "large.lean"
        test_file.write_text("\n".join([f"-- line {i}" for i in range(1, 10001)]))

        client = TestClient(app)
        times = []

        for _ in range(10):
            start = time.time()
            response = client.get(
                "/api/file",
                params={"path": str(test_file), "line": 5000, "context": 100}
            )
            elapsed = time.time() - start
            times.append(elapsed)
            assert response.status_code == 200

        avg_time = sum(times) / len(times)
        max_time = max(times)

        assert avg_time < 0.2, f"Average file read time too slow: {avg_time:.3f}s"
        assert max_time < 1.0, f"Max file read time too slow: {max_time:.3f}s"


# ============================================
# Error Recovery Tests
# ============================================

class TestErrorRecovery:
    """Test API error recovery capability"""

    def test_invalid_path_handling(self):
        """Should not crash when handling invalid paths"""
        from astrolabe.server import app
        from fastapi.testclient import TestClient

        client = TestClient(app)

        # Test various invalid paths
        invalid_paths = [
            "/nonexistent/file.lean",
            "",
            "../../../etc/passwd",
            "file://test.lean",
            "\x00null\x00",
        ]

        for path in invalid_paths:
            try:
                response = client.get("/api/file", params={"path": path, "line": 1, "context": 5})
                # Should return error status code, not crash
                assert response.status_code in [400, 404, 422, 500]
            except Exception as e:
                pytest.fail(f"Server crashed on invalid path '{path}': {e}")

        # Confirm service is still working normally
        response = client.get("/api/health")
        assert response.status_code == 200

    def test_malformed_json_handling(self):
        """Should not crash when handling malformed JSON"""
        from astrolabe.server import app
        from fastapi.testclient import TestClient

        client = TestClient(app)

        # Send malformed JSON
        malformed_jsons = [
            "{invalid}",
            '{"path": }',
            "",
            "null",
            '{"path": "\x00"}',
        ]

        for json_str in malformed_jsons:
            try:
                response = client.post(
                    "/api/project/load",
                    content=json_str,
                    headers={"Content-Type": "application/json"}
                )
                assert response.status_code in [400, 422, 500]
            except Exception as e:
                pytest.fail(f"Server crashed on malformed JSON: {e}")

        # Confirm service is still working normally
        response = client.get("/api/health")
        assert response.status_code == 200

    def test_service_recovery_after_errors(self, tmp_path):
        """Service should recover normally after errors"""
        from astrolabe.server import app
        from fastapi.testclient import TestClient

        client = TestClient(app)

        # 1. Normal request
        response = client.get("/api/health")
        assert response.status_code == 200

        # 2. Trigger error
        response = client.get("/api/file", params={"path": "/nonexistent", "line": 1})
        assert response.status_code in [404, 500]

        # 3. Normal request again
        response = client.get("/api/health")
        assert response.status_code == 200

        # 4. Create valid file and read
        test_file = tmp_path / "test.lean"
        test_file.write_text("theorem test : True := trivial")

        response = client.get("/api/file", params={"path": str(test_file), "line": 1})
        assert response.status_code == 200


# ============================================
# Memory Leak Detection
# ============================================

class TestMemoryStability:
    """Test memory usage stability"""

    def test_repeated_project_loads_no_memory_leak(self, tmp_path):
        """Repeated project loads should not cause memory leaks"""
        from astrolabe.server import app, _projects
        from fastapi.testclient import TestClient

        # Create test project
        project_path = tmp_path / "test_project"
        project_path.mkdir()
        (project_path / "lakefile.lean").write_text("-- lakefile")
        lean_file = project_path / "Test.lean"
        lean_file.write_text("theorem test : True := trivial")

        client = TestClient(app)

        # Record initial project count
        initial_count = len(_projects)

        # Load same project multiple times
        for i in range(10):
            response = client.post(
                "/api/project/load",
                json={"path": str(project_path)}
            )
            # May succeed or fail (depending on project validity), but should not crash

        # Project count should not grow infinitely (same project should be reused or replaced)
        final_count = len(_projects)
        assert final_count <= initial_count + 1, \
            f"Project count grew unexpectedly: {initial_count} -> {final_count}"


# ============================================
# Timeout Tests
# ============================================

class TestTimeouts:
    """Test request timeout handling"""

    def test_large_file_read_timeout(self, tmp_path):
        """Large file reads should have reasonable timeout"""
        from astrolabe.server import app
        from fastapi.testclient import TestClient

        # Create a very large file
        large_file = tmp_path / "huge.lean"
        # 100,000 lines, about 50 characters each
        large_file.write_text("\n".join([f"-- This is line number {i:06d}" for i in range(100000)]))

        client = TestClient(app)

        start = time.time()
        response = client.get(
            "/api/file",
            params={"path": str(large_file), "line": 50000, "context": 100000}
        )
        elapsed = time.time() - start

        # Even reading entire content should complete in reasonable time
        assert elapsed < 10.0, f"Large file read took too long: {elapsed:.2f}s"
        assert response.status_code == 200


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
