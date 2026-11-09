"""Chạy với PostgreSQL rỗng, dùng riêng cho kiểm thử."""
import os
import tempfile
import unittest
from datetime import datetime
from pathlib import Path
from unittest.mock import Mock, patch
from zoneinfo import ZoneInfo

from fastapi.testclient import TestClient
from docx import Document
import pymupdf


class WorkspaceTest(unittest.TestCase):
    def test_workflow(self):
        url = os.environ.get("VBPL_TEST_DATABASE_URL")
        self.assertTrue(url, "Cần cấu hình VBPL_TEST_DATABASE_URL trỏ đến PostgreSQL rỗng")
        with tempfile.TemporaryDirectory() as folder, patch.dict(os.environ, {
            "DATABASE_URL": url, "DOCUMENT_ROOT": folder,
            "APP_ADMIN_TOKEN": "setup-test-only-2026", "GEMINI_API_KEY": "",
        }):
            from app.db import connection
            from app.main import app
            from app.worker import send_reminders

            with connection() as conn:
                self.assertIsNone(conn.execute("SELECT to_regclass('public.documents') AS name").fetchone()["name"])
                for path in sorted(Path(__file__).resolve().parents[1].joinpath("migrations").glob("*.sql")):
                    conn.execute(path.read_text(encoding="utf-8"), prepare=False)
                conn.execute("INSERT INTO documents (internal_code,title,document_type) VALUES ('CU-001','Văn bản cũ','Luật')")

            with TestClient(app) as client:
                self.assertEqual(client.get("/health").status_code, 200)
                self.assertEqual(client.get("/api/documents").status_code, 401)
                credentials = {"username": "admin-test", "password": "password-test-only"}
                self.assertEqual(client.get("/api/auth/setup").json(), {"required": True})
                self.assertEqual(client.post("/api/auth/setup", json={**credentials, "display_name": "Quản trị thử"},
                    headers={"Authorization": "Bearer setup-test-only-2026"}).status_code, 201)
                token = client.post("/api/auth/login", json=credentials).json()["token"]
                client.headers["Authorization"] = f"Bearer {token}"
                self.assertEqual(client.get("/api/documents").json()[0]["internal_code"], "CU-001")
                payload = {"internal_code": "VB-TEST", "title": "Văn bản kiểm thử", "document_type": "Thông tư",
                           "source_url": "https://example.com/vb-kiem-thu", "issued_on": "2026-11-01"}
                created = client.post("/api/documents", json=payload)
                self.assertEqual(created.status_code, 201, created.text)
                row = created.json()
                path = "/api/documents/" + row["id"]
                self.assertEqual(client.post("/api/documents", json={**payload, "internal_code": "VB-DUP"}).status_code, 409)
                change = {**payload, "title": "Tên đã sửa", "revision": row["updated_at"]}
                self.assertEqual(client.put(path, json=change).status_code, 200)
                self.assertEqual(client.put(path, json=change).status_code, 409)
                self.assertEqual(client.get("/api/documents", params={"query": "Tên đã sửa"}).json()[0]["id"], row["id"])
                self.assertEqual(client.post(path + "/file", files={"file": ("x.pdf", b"bad")}).status_code, 415)
                with pymupdf.open() as pdf:
                    pdf.new_page().insert_text((60, 60), "Dieu 1. Noi dung thu nghiem.")
                    data = pdf.tobytes()
                self.assertEqual(client.post(path + "/file", files={"file": ("x.pdf", data)}).status_code, 201)
                self.assertEqual(client.get(path + "/file").content, data)
                consent = {"approved_for_external_ai": True}
                self.assertEqual(client.post(path + "/analyses", json=consent).status_code, 503)
                upstream = Mock()
                upstream.json.return_value = {"candidates": [{"content": {"parts": [{"text": "Kết quả thử"}]}}]}
                with patch.dict(os.environ, {"GEMINI_API_KEY": "fake-test-key"}), patch("app.analysis.requests.post", return_value=upstream) as request:
                    self.assertEqual(client.post(path + "/analyses", json={"approved_for_external_ai": False}).status_code, 422)
                    self.assertEqual(client.post(path + "/analyses", json=consent).status_code, 201)
                    self.assertEqual(request.call_count, 1)
                self.assertEqual(client.get(path + "/analyses").json()[0]["result"], "Kết quả thử")
                docx = Document()
                docx.add_paragraph("Đoạn thử DOCX")
                docx_path = Path(folder) / "test.docx"
                docx.save(docx_path)
                self.assertEqual(client.post(path + "/file", files={"file": ("x.docx", docx_path.read_bytes())}).status_code, 201)
                self.assertIn("Đoạn thử DOCX", client.get(path + "/preview").json()["text"])
                self.assertEqual(client.post(path + "/archive").status_code, 204)
                self.assertEqual(client.get(path + "/file").status_code, 404)
                self.assertEqual(client.post(path + "/restore").status_code, 204)
                self.assertTrue(client.get(path + "/history").json())

                employee = {"username": "staff-test", "password": "staff-test-password"}
                account = client.post("/api/accounts", json={**employee, "display_name": "Nhân viên thử",
                    "email": "staff@example.com", "role": "employee"}).json()
                today = datetime.now(ZoneInfo("Asia/Ho_Chi_Minh")).date().isoformat()
                task = client.post("/api/tasks", json={"document_id": row["id"], "requirement": "Kiểm tra văn bản",
                    "assignee_id": account["id"], "internal_deadline": today})
                self.assertEqual(task.status_code, 201, task.text)
                with patch.dict(os.environ, {"SMTP_HOST": "smtp.example.com", "SMTP_FROM": "admin@example.com",
                    "APP_BASE_URL": "https://vbpl.example.com"}), patch("app.worker.send_mail") as send:
                    send_reminders()
                    send_reminders()
                    self.assertEqual(send.call_count, 1)
                self.assertEqual(client.get("/api/reminders").json()[0]["state"], "SENT")
                employee_token = client.post("/api/auth/login", json=employee).json()["token"]
                client.headers["Authorization"] = f"Bearer {employee_token}"
                self.assertEqual(client.post("/api/documents", json=payload).status_code, 403)
                self.assertEqual(client.get("/api/reminders").status_code, 403)
                self.assertEqual(len(client.get("/api/tasks").json()), 1)
                self.assertEqual(client.patch("/api/tasks/" + task.json()["id"], json={"status": "DONE"}).status_code, 200)
                self.assertEqual(client.post("/api/auth/logout").status_code, 204)
                self.assertEqual(client.get("/api/auth/me").status_code, 401)

            with TestClient(app) as restarted:
                restarted.headers["Authorization"] = f"Bearer {token}"
                self.assertEqual(restarted.get(path + "/file").status_code, 200)
                self.assertEqual(restarted.get("/api/tasks").json()[0]["status"], "DONE")
