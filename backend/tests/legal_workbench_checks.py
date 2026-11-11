"""Integration checks, called within the existing isolated PostgreSQL workflow."""
import json
import os
from unittest.mock import Mock, patch

def check_legal_workbench(test, client, admin_token, staff_token, staff):
    from app.db import connection
    client.headers["Authorization"] = "Bearer " + admin_token
    admin = client.get("/api/auth/me").json()
    dep = client.get("/api/departments").json()[0]["id"]
    credentials = {"username": "other-legal-test", "password": "test-password-for-legal"}
    outsider = client.post("/api/accounts", json={**credentials, "display_name": "Khác phòng", "role": "employee", "department_id": dep}).json()
    other_token = client.post("/api/auth/login", json=credentials).json()["token"]

    def auth(token):
        client.headers["Authorization"] = "Bearer " + token

    def create(kind="CASE", **kwargs):
        body = {"title": "Hồ sơ thử " + kind, "kind": kind, "objective": "Rà soát điều khoản sản xuất", **kwargs}
        response = client.post("/api/legal/matters", json=body)
        test.assertEqual(response.status_code, 201, response.text)
        return response.json()

    private = create()
    base = "/api/legal/matters/" + private["id"]
    test.assertEqual(client.post(base + "/files?kind=INTERNAL", files={"file": ("scan.pdf", b"bad")}).status_code, 415)
    file = client.post(base + "/files?kind=INTERNAL", files={"file": ("quy-trinh.txt", "Điều 1: Kiểm tra hồ sơ chất lượng trước khi xuất xưởng.".encode())})
    test.assertEqual(file.status_code, 201, file.text)
    file_id = file.json()["id"]
    test.assertEqual(client.get("/api/legal/sources/" + file_id + "/file").status_code, 200)

    auth(other_token)
    test.assertFalse(any(m["id"] == private["id"] for m in client.get("/api/legal/matters").json()))
    test.assertFalse(any(s["id"] == file_id for s in client.get("/api/legal/library").json()))
    test.assertEqual(client.get(base).status_code, 404)
    test.assertEqual(client.get("/api/legal/sources/" + file_id + "/file").status_code, 404)
    test.assertEqual(client.post(base + "/sources", json={"title": "Nguồn không có quyền", "kind": "LEGAL", "content": "Nội dung thử"}).status_code, 404)
    mine = create("KNOWLEDGE")
    mine_path = "/api/legal/matters/" + mine["id"]
    test.assertEqual(client.post(mine_path + "/sources", json={"title": "Sao chép trái quyền", "kind": "INTERNAL", "reuse_source_id": file_id}).status_code, 404)
    test.assertEqual(client.post("/api/legal/matters", json={"title": "Toàn công ty", "kind": "CASE", "objective": "Nội dung thử", "visibility": "COMPANY"}).status_code, 403)
    department = create("KNOWLEDGE", visibility="DEPARTMENT", department_id=dep)
    test.assertEqual(client.post("/api/legal/matters/" + department["id"] + "/sources", json={
        "title": "Nguồn dùng thử", "kind": "EVIDENCE", "content": "Nội dung nguồn phòng ban"
    }).status_code, 201)
    auth(staff_token)
    test.assertEqual(client.get("/api/legal/matters/" + department["id"]).status_code, 404)

    auth(admin_token)
    current = client.get(base).json()
    source = current["sources"][0]
    result = {"summary": "Cần đối chiếu quy trình với căn cứ pháp luật hiện hành.",
              "questions": ["Phiên bản SOP hiện áp dụng là gì?"], "draft": "BẢN NHÁP: đề nghị rà soát hồ sơ.",
              "limitations": "Chưa xác minh hiệu lực tại nguồn chính thức.",
              "findings": [{"category": "MATCH", "clause": "Điều 1", "finding": "Quy trình nêu bước kiểm tra hồ sơ.",
                            "recommendation": "Xác nhận phiên bản áp dụng", "department": "QA",
                            "citations": [{"source_id": file_id, "quote": "Kiểm tra hồ sơ chất lượng", "locator": "Điều 1"}]}]}
    invalid = json.loads(json.dumps(result))
    invalid["findings"][0]["citations"][0]["quote"] = "Trích dẫn bịa không có trong nguồn"
    test.assertEqual(client.post(base + "/reports", json={"revision": current["revision"], "result": invalid}).status_code, 422)
    test.assertEqual(client.post(base + "/reports", json={"revision": 1, "result": result}).status_code, 409)
    consent = {"revision": current["revision"], "approved_for_external_ai": True}
    test.assertEqual(client.post(base + "/generate", json=consent).status_code, 503)
    test.assertEqual(client.post(base + "/generate", json={**consent, "approved_for_external_ai": False}).status_code, 422)
    upstream = Mock()
    upstream.json.return_value = {"candidates": [{"content": {"parts": [{"text": json.dumps(result)}]}}]}
    with patch.dict(os.environ, {"GEMINI_API_KEY": "test-key-only"}), patch("app.legal.requests.post", return_value=upstream) as request:
        generated = client.post(base + "/generate", json=consent)
        test.assertEqual(generated.status_code, 201, generated.text)
        test.assertIn("responseMimeType", request.call_args.kwargs["json"]["generationConfig"])
        test.assertEqual(client.post(base + "/generate", json=consent).status_code, 429)
    rid = generated.json()["id"]
    review_url = base + "/reports/" + rid + "/review"
    test.assertEqual(client.post(review_url, json={"decision": "APPROVED", "note": "Đã kiểm tra căn cứ thử"}).status_code, 200)
    test.assertEqual(client.post(review_url, json={"decision": "APPROVED", "note": "Lặp lại"}).status_code, 409)
    test.assertTrue(any(k["matter_id"] == private["id"] for k in client.get("/api/legal/knowledge").json()))
    auth(other_token)
    test.assertFalse(any(k["matter_id"] == private["id"] for k in client.get("/api/legal/knowledge").json()))
    test.assertEqual(client.post(review_url, json={"decision": "APPROVED", "note": "Không có quyền"}).status_code, 403)
    auth(admin_token)
    test.assertEqual(client.post(base + "/actions", json={"title": "Việc thử", "assignee_id": outsider["id"], "due_on": "2026-11-20"}).status_code, 422)
    task = client.post(base + "/actions", json={"title": "Kiểm tra chứng từ", "assignee_id": admin["id"],
        "due_on": "2026-11-20", "report_id": rid})
    test.assertEqual(task.status_code, 201, task.text)
    action = task.json()
    action_url = "/api/legal/actions/" + action["id"]
    test.assertEqual(client.patch(action_url, json={"revision": 1, "status": "DONE", "evidence": "Tệp kiểm tra", "review_note": "Đã duyệt"}).status_code, 422)
    test.assertEqual(client.patch(action_url, json={"revision": 1, "status": "SUBMITTED"}).status_code, 422)
    submitted = client.patch(action_url, json={"revision": 1, "status": "SUBMITTED", "evidence": "Mã hồ sơ thử QA-01"})
    test.assertEqual(submitted.status_code, 200)
    test.assertEqual(client.patch(action_url, json={"revision": 1, "status": "IN_PROGRESS"}).status_code, 409)
    done = client.patch(action_url, json={"revision": 2, "status": "DONE", "evidence": "Mã hồ sơ thử QA-01", "review_note": "Đã đối chiếu"})
    test.assertEqual(done.status_code, 200, done.text)
    test.assertEqual(client.patch(action_url, json={"revision": 3, "status": "OPEN"}).status_code, 409)

    # Changing sources invalidates approvals but preserves immutable reports and files.
    test.assertEqual(client.post(base + "/sources", json={"title": "Bổ sung nguồn", "kind": "LEGAL", "content": "Cần kiểm tra thay đổi"}).status_code, 201)
    test.assertFalse(any(k["matter_id"] == private["id"] for k in client.get("/api/legal/knowledge").json()))
    test.assertEqual(client.post(base + "/actions", json={"title": "Việc từ bản cũ", "assignee_id": admin["id"],
        "due_on": "2026-11-20", "report_id": rid}).status_code, 422)
    test.assertEqual(client.get(base).json()["reports"][0]["state"], "APPROVED")
    test.assertEqual(client.get("/api/legal/sources/" + file_id + "/file").status_code, 200)

    # All agent modes persist; a shared dossier can be read, but not edited, by staff.
    for mode in ["CHANGE", "RESEARCH", "REVIEW", "DRAFT", "KNOWLEDGE"]:
        create(mode)
    shared = create("REVIEW", visibility="COMPANY")
    shared_path = "/api/legal/matters/" + shared["id"]
    current = client.get(shared_path).json()
    update = {k: shared[k] for k in ["title", "kind", "objective", "context", "visibility", "department_id"]}
    test.assertEqual(client.put(shared_path, json={**update, "revision": 1, "title": "Đã sửa"}).status_code, 200)
    test.assertEqual(client.put(shared_path, json={**update, "revision": 1}).status_code, 409)
    task = client.post(shared_path + "/actions", json={"title": "Nhân viên kiểm tra hồ sơ", "assignee_id": staff["id"], "due_on": "2026-11-20"}).json()
    auth(staff_token)
    test.assertEqual(client.get(shared_path).status_code, 200)
    test.assertEqual(client.put(shared_path, json={**update, "revision": 2}).status_code, 403)
    test.assertEqual(client.post(shared_path + "/reports", json={"revision": 2, "result": result}).status_code, 403)
    test.assertTrue(any(t["id"] == task["id"] for t in client.get("/api/legal/actions").json()))
    task_path = "/api/legal/actions/" + task["id"]
    test.assertEqual(client.patch(task_path, json={"revision": 1, "status": "SUBMITTED", "evidence": "Biên bản QA-02"}).status_code, 200)
    test.assertEqual(client.patch(task_path, json={"revision": 2, "status": "DONE", "evidence": "Biên bản QA-02", "review_note": "Tự duyệt"}).status_code, 422)
    auth(admin_token)
    # Restricting scope cannot strand an existing assignee.
    test.assertEqual(client.put(shared_path, json={**update, "revision": 2, "visibility": "PRIVATE"}).status_code, 422)
    test.assertTrue(client.get(base).json()["history"])
