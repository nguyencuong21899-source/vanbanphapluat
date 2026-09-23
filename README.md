# Traphaco Legal AI

Hệ thống nội bộ quản lý văn bản pháp luật: kho tài liệu NAS, metadata/version, quy trình BM02, cảnh báo và nền tảng RAG có trích dẫn.

## Phạm vi phiên bản đầu

- PostgreSQL lưu danh mục văn bản, quan hệ sửa đổi/thay thế, đánh giá tác động, kế hoạch triển khai, cảnh báo và audit log.
- PDF/TXT/Markdown nguồn lưu tại `data/documents` trên NAS; GitHub không chứa tài liệu hay secrets.
- API cung cấp dashboard, danh mục, tạo văn bản, tải tệp nguồn và quyết định review.
- Worker tạo đợt rà soát theo lịch hằng tuần. Collector từng nguồn chỉ được bật sau khi Pháp chế duyệt nguồn và quy tắc xác minh.
- Qdrant đã sẵn sàng cho RAG. Chưa bật chatbot Gemini khi chưa có API key và chính sách dữ liệu được phê duyệt.

## Triển khai NAS

1. Cài Synology Container Manager và tạo thư mục chia sẻ, ví dụ `/volume1/legal-ai`.
2. Clone private repository vào thư mục đó, tạo `.env` từ `.env.example` và thay toàn bộ giá trị `CHANGEME` bằng secret ngẫu nhiên.
3. Chạy `docker compose up -d --build`.
4. Truy cập nội bộ qua reverse proxy DSM tới `http://127.0.0.1:8080`; không mở PostgreSQL, Qdrant hoặc Docker API ra Internet.
5. Đặt backup snapshot cho `data`, `postgres-data`, `qdrant-data` và `.env` sang NAS thứ hai.

## Quy tắc pháp lý

Trạng thái hiệu lực là dữ liệu có kiểm soát. AI/crawler chỉ tạo đề xuất; Pháp chế phải đối chiếu nguồn chính thức và phê duyệt trước khi kết luận văn bản hết hiệu lực hoặc áp dụng cho công ty.

## Git

Mọi thay đổi đi qua branch `codex/...`, được kiểm tra trước khi merge. Không commit `.env`, khóa, dữ liệu PostgreSQL/Qdrant, PDF, Markdown hoặc backup.

