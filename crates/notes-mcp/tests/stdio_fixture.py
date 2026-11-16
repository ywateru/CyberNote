"""Real SDK stdio <-> temporary Unix fixture only; never a Store/host acceptance test."""
import copy
import hashlib
import json
import os
from pathlib import Path
import select
import socket
import subprocess
import sys
import tempfile
import threading
import time
import unittest
import uuid

BINARY = sys.argv.pop(1)
KEY = "00000000-0000-4000-8000-000000000001"
QUERY_SUCCESS = json.loads((Path(__file__).parent / "fixtures" / "query-success.json").read_text())
SERVICE_FIXTURE_PATH = Path(__file__).parent / "fixtures" / "service-success.json"
SERVICE_SUCCESS = json.loads(SERVICE_FIXTURE_PATH.read_text())
SCOPE_ERROR = {"code": "FORBIDDEN", "message": "Synthetic grant scope denied", "retryable": False}
ERROR = QUERY_SUCCESS["ToolError"]
SUMMARY = dict(id="note", folderId="folder", title="Fixture", preview="中文", createdAt=1,
               updatedAt=2, pinned=False, revision=1, version="opaque-version", attachmentCount=0)
MUTATION = dict(operationId="operation", noteId="note", committedRevision=2,
                committedVersion="opaque-committed", committed=True, warnings=[])
INPUTS = {
    "notes_get_capabilities": {}, "notes_list_folders": {}, "notes_list": {},
    "notes_search": {"query": "中文"}, "notes_read": {"noteId": "note"},
    "notes_create": dict(folderId="folder", format="text", content="中文", idempotencyKey=KEY),
    "notes_append": dict(noteId="note", expectedVersion="opaque-version", text="中文", idempotencyKey=KEY),
    "notes_update": dict(noteId="note", expectedVersion="opaque-version", format="document", content={"type": "doc", "content": []}, idempotencyKey=KEY),
    "notes_get_operation": {"operationId": "operation"},
}

def success(tool):
    return {
        "notes_get_capabilities": dict(QUERY_SUCCESS["notes_get_capabilities"], workspaceId="fixture-workspace"),
        "notes_list_folders": {"items": [{"id": "folder", "name": "Fixture", "ancestorLabels": ["Visible label"]}], "nextCursor": None},
        "notes_list": {"items": [SUMMARY], "nextCursor": None},
        "notes_search": copy.deepcopy(QUERY_SUCCESS["notes_search"]),
        "notes_read": dict(SUMMARY, format="text", content="中文 fixture content", truncated=False, nextContentCursor=None),
        "notes_create": MUTATION, "notes_append": MUTATION, "notes_update": MUTATION,
        "notes_get_operation": {"status": "pending", "operationId": "operation"},
    }[tool]

class StdioFixture(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory(prefix="mcp-")
        self.runtime = Path(self.tmp.name).resolve()
        self.runtime.chmod(0o700)
        (self.runtime / "credentials").mkdir(mode=0o700)
        self.ref = str(uuid.uuid4())
        self.record = dict(version=1, workspaceId="fixture-workspace", clientId="synthetic-client", credential="synthetic-fixture-token-no-user-secret", socketPath=str(self.runtime / "host.sock"))
        if self._testMethodName == "test_application_service_fixture_cross_module":
            self.record["workspaceId"] = SERVICE_SUCCESS["cases"][0]["result"]["workspaceId"]
        self.cred = self.runtime / "credentials" / (self.ref + ".json")
        self.write_record()
        self.listener = socket.socket(socket.AF_UNIX)
        self.listener.bind(self.record["socketPath"])
        os.chmod(self.record["socketPath"], 0o600)
        self.listener.listen(16)
        self.listener.settimeout(0.1)
        self.stop = threading.Event()
        self.requests = []
        self.failures = []
        self.mode = "success"
        self.output_override = None
        self.delay = 0
        self.accepted = threading.Event()
        self.host_lock = threading.Lock()
        self.active_writes = 0
        self.max_active_writes = 0
        self.workers = []
        self.thread = threading.Thread(target=self.host, daemon=True)
        self.thread.start()
        self.process = subprocess.Popen([BINARY, "--workspace-id", self.record["workspaceId"], "--credential-ref", self.ref, "--runtime-dir", str(self.runtime)], stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE, bufsize=0)
        self.buffer = b""
        self.seq = 0
        init = self.rpc("initialize", dict(protocolVersion="2025-11-25", capabilities={}, clientInfo={"name": "fixture-test-client", "version": "1"}))
        self.assertEqual(init["result"]["protocolVersion"], "2025-11-25")
        self.assertEqual(init["result"]["capabilities"], {"tools": {}})
        self.send({"jsonrpc": "2.0", "method": "notifications/initialized"})

    def write_record(self):
        self.cred.write_text(json.dumps(self.record))
        self.cred.chmod(0o600)

    def host(self):
        while not self.stop.is_set():
            try:
                connection, _ = self.listener.accept()
            except (TimeoutError, OSError):
                continue
            worker = threading.Thread(target=self.handle, args=(connection,), daemon=True)
            self.workers.append(worker)
            worker.start()

    def handle(self, connection):
        try:
            with connection:
                connection.settimeout(3)
                frame = connection.makefile("rb").readline(2097153)
                request = json.loads(frame)
                assert set(request) == {"version", "requestId", "workspaceId", "clientId", "credential", "tool", "arguments"}
                assert request["version"] == 1 and request["workspaceId"] == self.record["workspaceId"]
                uuid.UUID(request["requestId"])
                self.requests.append(request)
                writing = request["tool"] in ("notes_create", "notes_append", "notes_update")
                if writing:
                    with self.host_lock:
                        self.active_writes += 1
                        self.max_active_writes = max(self.max_active_writes, self.active_writes)
                mode, delay = self.mode, self.delay
                self.accepted.set()
                # Event wait can be stopped by tearDown, including timeout fixtures.
                if self.stop.wait(delay):
                    return
                result = success(request["tool"]) if self.output_override is None else copy.deepcopy(self.output_override)
                response = dict(version=1, requestId=request["requestId"], result=result, isError=False)
                if mode == "business": response.update(result=ERROR, isError=True)
                if mode == "scope-error": response.update(result=SCOPE_ERROR, isError=True)
                if mode == "error-as-success": response.update(result=ERROR, isError=False)
                if mode == "success-as-error": response["isError"] = True
                if mode == "unknown-output": response["result"] = dict(result, debugPath="must-not-leak")
                if mode == "wrong-workspace": response["result"] = dict(result, workspaceId="other")
                if mode == "wrong-note": response["result"] = dict(result, id="other-note")
                if mode == "large-text": response["result"] = dict(result, content="中" * 11000)
                if mode == "large-list": response["result"] = dict(result, items=[dict(SUMMARY, title="a" * 600000)])
                if mode == "document-truncated": response["result"] = dict(result, format="document", content={}, truncated=True, nextContentCursor="cursor")
                if mode == "committed-error": response.update(result=dict(ERROR, code="STORAGE_ERROR", operationId="operation", committed=True), isError=True)
                if writing:
                    with self.host_lock:
                        self.active_writes -= 1
                connection.sendall((json.dumps(response, ensure_ascii=False) + "\n").encode())
        except (BrokenPipeError, ConnectionResetError):
            pass  # Expected after cancellation or a deadline.
        except Exception as error:
            self.failures.append(repr(error))

    def tearDown(self):
        self.stop.set()
        self.listener.close()
        self.thread.join(timeout=2)
        for worker in self.workers: worker.join(timeout=2)
        if self.process.poll() is None:
            self.process.stdin.close()
            try: self.process.wait(timeout=3)
            except subprocess.TimeoutExpired:
                self.process.kill()
                self.process.wait(timeout=3)
                self.fail("SDK stdio failed to exit after EOF")
        stderr = self.process.stderr.read()
        self.process.stdout.close()
        self.process.stderr.close()
        self.tmp.cleanup()
        self.assertNotIn(self.record["credential"].encode(), stderr)
        self.assertEqual(self.failures, [])

    def send(self, value):
        self.process.stdin.write((json.dumps(value, ensure_ascii=False) + "\n").encode())
        self.process.stdin.flush()

    def receive(self, seconds=5):
        deadline = time.monotonic() + seconds
        while b"\n" not in self.buffer:
            if not select.select([self.process.stdout], [], [], max(0, deadline-time.monotonic()))[0]:
                self.fail("stdio response deadline exceeded")
            chunk = os.read(self.process.stdout.fileno(), 65536)
            self.assertTrue(chunk, "unexpected stdio EOF")
            self.buffer += chunk
        line, self.buffer = self.buffer.split(b"\n", 1)
        return json.loads(line)  # Any stdout log pollution fails here.

    def begin(self, method, params):
        self.seq += 1
        self.send(dict(jsonrpc="2.0", id=self.seq, method=method, params=params))
        return self.seq

    def rpc(self, method, params, seconds=5):
        request_id = self.begin(method, params)
        response = self.receive(seconds)
        self.assertEqual(response["id"], request_id)
        return response

    def call(self, tool, arguments=None, seconds=5):
        response = self.rpc("tools/call", dict(name=tool, arguments=INPUTS[tool] if arguments is None else arguments), seconds)
        result = response["result"]
        self.assertEqual(json.loads(result["content"][0]["text"]), result["structuredContent"])
        return result

    def test_nine_tools_schemas_annotations_and_real_unix_roundtrip(self):
        tools = self.rpc("tools/list", {})["result"]["tools"]
        self.assertEqual([t["name"] for t in tools], list(INPUTS))
        for tool in tools:
            self.assertFalse(tool["inputSchema"]["additionalProperties"])
            self.assertEqual(len(tool["outputSchema"]["oneOf"]), 2)
            writing = tool["name"] in ("notes_create", "notes_append", "notes_update")
            self.assertEqual(tool["annotations"]["readOnlyHint"], not writing)
            self.assertEqual(tool["annotations"]["idempotentHint"], not writing)
            self.assertFalse(tool["annotations"]["openWorldHint"])
            result = self.call(tool["name"])
            self.assertFalse(result["isError"])
            self.assertEqual(result["structuredContent"], success(tool["name"]))
        self.assertEqual(len(self.requests), 9)
        self.assertEqual(len({r["requestId"] for r in self.requests}), 9)
        for request in self.requests:
            self.assertEqual(request["arguments"], INPUTS[request["tool"]])

    def test_application_service_fixture_cross_module(self):
        source = json.loads(SERVICE_FIXTURE_PATH.with_name("service-success.source.json").read_text())
        self.assertEqual(source["sourceCommit"], "868c6dcf960cb3c92f3c9330ec22fbaf7431fe91")
        self.assertEqual(hashlib.sha256(SERVICE_FIXTURE_PATH.read_bytes()).hexdigest(), source["sha256"])
        cases = SERVICE_SUCCESS["cases"]
        self.assertEqual(len(cases), 12)
        self.assertEqual({case["tool"] for case in cases}, set(INPUTS))
        for index, case in enumerate(cases):
            with self.subTest(index=index, tool=case["tool"], branch="actual-service-success"):
                self.output_override = case["result"]
                result = self.call(case["tool"], case["arguments"])
                self.assertFalse(result["isError"])
                self.assertEqual(result["structuredContent"], case["result"])
                self.assertEqual(self.requests[-1]["arguments"], case["arguments"])
        # The host's ServerError/scope-denial route remains a ToolError, never coerced to success.
        self.output_override = None
        self.mode = "scope-error"
        for case in cases:
            with self.subTest(tool=case["tool"], branch="host-scope-error"):
                result = self.call(case["tool"], case["arguments"])
                self.assertTrue(result["isError"])
                self.assertEqual(result["structuredContent"], SCOPE_ERROR)
        self.assertEqual(len(self.requests), len(cases) * 2)

    def test_canonical_query_dtos_keep_strict_output_validation(self):
        capabilities = self.call("notes_get_capabilities")["structuredContent"]
        self.assertEqual(capabilities["apiVersion"], 1)
        self.assertEqual(capabilities["schemaVersion"], 1)
        self.assertEqual(capabilities["limits"], QUERY_SUCCESS["notes_get_capabilities"]["limits"])
        invalid_capabilities = []
        for key in ("apiVersion", "schemaVersion"):
            for value in ("1", 2):
                invalid_capabilities.append(dict(capabilities, **{key: value}))
        for key in capabilities["limits"]:
            missing = copy.deepcopy(capabilities)
            del missing["limits"][key]
            invalid_capabilities.append(missing)
        for key in ("maxInputBytes", "unknownLimit"):
            unknown = copy.deepcopy(capabilities)
            unknown["limits"][key] = 1
            invalid_capabilities.append(unknown)
        for invalid in invalid_capabilities:
            self.output_override = invalid
            result = self.call("notes_get_capabilities")
            self.assertTrue(result["isError"])
            self.assertEqual(result["structuredContent"]["code"], "HOST_UNAVAILABLE")

        self.output_override = None
        result = self.call("notes_search", {"query": "中文", "tags": ["filter-only"]})
        self.assertFalse(result["isError"])
        self.assertEqual(self.requests[-1]["arguments"]["tags"], ["filter-only"])
        search = result["structuredContent"]
        for field in ("title", "content"):
            valid = copy.deepcopy(search)
            valid["items"][0]["match"] = {"field": field, "snippet": "中" * 240}
            self.output_override = valid
            self.assertFalse(self.call("notes_search")["isError"])
        invalid_matches = [
            {"field": "tags", "snippet": "中文"},
            {"field": "content", "snippet": "中" * 241},
            {"field": "content", "snippet": "中文", "extra": True},
            {"field": "content"},
        ]
        invalid_searches = []
        for match in invalid_matches:
            invalid = copy.deepcopy(search)
            invalid["items"][0]["match"] = match
            invalid_searches.append(invalid)
        legacy = copy.deepcopy(search)
        del legacy["items"][0]["match"]
        legacy["items"][0].update(matchedFields=["content"], snippet="中文")
        invalid_searches.append(legacy)
        for invalid in invalid_searches:
            self.output_override = invalid
            result = self.call("notes_search")
            self.assertTrue(result["isError"])
            self.assertEqual(result["structuredContent"]["code"], "HOST_UNAVAILABLE")

    def test_official_tool_input_errors_and_unknown_tool_protocol_error(self):
        for tool, args in [("notes_get_capabilities", {"unknown": True}), ("notes_search", {"query": ""}), ("notes_list", {"limit": 0}), ("notes_list", {"limit": 101}), ("notes_list", {"limit": 1.5}), ("notes_read", {"noteId": "note", "format": "markdown"}), ("notes_create", dict(INPUTS["notes_create"], idempotencyKey="not-uuid")), ("notes_update", dict(INPUTS["notes_update"], content="wrong type"))]:
            result = self.call(tool, args)
            self.assertTrue(result["isError"])
            self.assertEqual(result["structuredContent"]["code"], "SCHEMA_INVALID")
        result = self.call("notes_append", dict(INPUTS["notes_append"], text="中" * 350000))
        self.assertTrue(result["isError"])
        self.assertEqual(result["structuredContent"]["code"], "CONTENT_TOO_LARGE")
        unknown = self.rpc("tools/call", dict(name="unknown", arguments={}))
        self.assertIn("error", unknown)
        self.assertEqual(unknown["error"]["code"], -32601)
        self.begin("tools/call", {"name": "notes_list", "arguments": []})
        malformed = self.receive()
        self.assertEqual(malformed["error"]["code"], -32602)
        self.assertEqual(self.requests, [])

    def test_business_errors_output_schema_and_iserror_consistency(self):
        for mode in ["business", "error-as-success", "success-as-error", "unknown-output", "committed-error"]:
            self.mode = mode
            result = self.call("notes_create")
            self.assertTrue(result["isError"])
            if mode == "business": self.assertEqual(result["structuredContent"], ERROR)
            elif mode == "committed-error": self.assertTrue(result["structuredContent"]["committed"])
            else: self.assertEqual(result["structuredContent"]["code"], "HOST_UNAVAILABLE")
        self.assertEqual(len(self.requests), 5)  # No write retries.

    def test_output_identity_byte_limits_and_document_integrity(self):
        for tool, mode, code in [("notes_get_capabilities", "wrong-workspace", "HOST_UNAVAILABLE"), ("notes_read", "wrong-note", "HOST_UNAVAILABLE"), ("notes_read", "large-text", "CONTENT_TOO_LARGE"), ("notes_list", "large-list", "CONTENT_TOO_LARGE"), ("notes_read", "document-truncated", "CONTENT_TOO_LARGE")]:
            self.mode = mode
            args = dict(INPUTS[tool], format="document") if mode == "document-truncated" else None
            result = self.call(tool, args)
            self.assertTrue(result["isError"])
            self.assertEqual(result["structuredContent"]["code"], code)

    def test_credential_reload_and_withdrawal_before_response_delivery(self):
        self.call("notes_list")
        self.record["credential"] = "changed-synthetic-fixture-token"
        self.record["clientId"] = "changed-client"
        self.write_record()
        self.call("notes_list")
        self.assertEqual(self.requests[-1]["credential"], self.record["credential"])
        self.assertEqual(self.requests[-1]["clientId"], "changed-client")
        self.delay = .15
        self.accepted.clear()
        self.begin("tools/call", dict(name="notes_read", arguments=INPUTS["notes_read"]))
        self.assertTrue(self.accepted.wait(2))
        self.cred.unlink()
        response = self.receive()["result"]
        self.assertTrue(response["isError"])
        self.assertEqual(response["structuredContent"]["code"], "UNAUTHORIZED")
        self.assertNotIn("fixture content", json.dumps(response))

    def test_host_unavailable_and_private_permissions(self):
        self.cred.chmod(0o644)
        self.assertEqual(self.call("notes_list")["structuredContent"]["code"], "UNAUTHORIZED")
        self.cred.chmod(0o600)
        self.listener.close()
        os.unlink(self.record["socketPath"])
        self.assertEqual(self.call("notes_create")["structuredContent"]["code"], "HOST_UNAVAILABLE")
        self.assertEqual(self.requests, [])

    def test_sdk_malformed_and_oversize_lines_remain_bounded_and_recover(self):
        self.process.stdin.write(b"{not-json}\n")
        self.process.stdin.write(b" " * (2097152 + 1) + b"\n")
        self.process.stdin.flush()
        self.assertEqual(len(self.rpc("tools/list", {})["result"]["tools"]), 9)
        self.assertEqual(self.requests, [])

    def test_read_limit_write_serialization_and_bounded_queue(self):
        self.delay = .2
        ids = [self.begin("tools/call", dict(name="notes_list", arguments={})) for _ in range(5)]
        responses = [self.receive() for _ in ids]
        self.assertEqual({r["id"] for r in responses}, set(ids))
        codes = [r["result"]["structuredContent"].get("code") for r in responses]
        self.assertEqual(codes.count("RATE_LIMITED"), 1)
        self.assertEqual(len(self.requests), 4)
        before = len(self.requests)
        ids = [self.begin("tools/call", dict(name="notes_append", arguments=INPUTS["notes_append"])) for _ in range(10)]
        responses = [self.receive() for _ in ids]
        self.assertEqual({r["id"] for r in responses}, set(ids))
        codes = [r["result"]["structuredContent"].get("code") for r in responses]
        self.assertEqual(codes.count("RATE_LIMITED"), 1)
        self.assertEqual(len(self.requests) - before, 9)
        self.assertEqual(self.max_active_writes, 1)

    def test_read_deadline_and_no_retry(self):
        self.delay = 8
        started = time.monotonic()
        result = self.call("notes_read", seconds=7)
        self.assertEqual(result["structuredContent"]["code"], "TIMEOUT")
        self.assertLess(time.monotonic() - started, 7)
        self.assertEqual(len(self.requests), 1)

    def test_write_deadline_and_no_retry(self):
        self.delay = 23
        started = time.monotonic()
        result = self.call("notes_create", seconds=22)
        self.assertEqual(result["structuredContent"]["code"], "TIMEOUT")
        self.assertLess(time.monotonic() - started, 22)
        self.assertEqual(len(self.requests), 1)

    def test_cancelled_call_closes_ipc_without_retry(self):
        self.delay = .3
        self.accepted.clear()
        request_id = self.begin("tools/call", dict(name="notes_create", arguments=INPUTS["notes_create"]))
        self.assertTrue(self.accepted.wait(2))
        self.send(dict(jsonrpc="2.0", method="notifications/cancelled", params=dict(requestId=request_id, reason="fixture cancellation")))
        # The SDK may suppress the cancelled request's response. Subsequent requests remain usable.
        next_id = self.begin("tools/list", {})
        response = self.receive()
        if response.get("id") == request_id:
            self.assertTrue(response["result"]["isError"])
            response = self.receive()
        self.assertEqual(response["id"], next_id)
        self.assertEqual(len(self.requests), 1)

if __name__ == "__main__":
    unittest.main(verbosity=2)
