# Traphaco CNC – AI Legal Monitoring System

Hệ thống nội bộ giám sát văn bản pháp luật và quản lý tuân thủ. Trang chính là danh mục văn bản. Tổng quan và thông báo nằm ở mục riêng.

## Sử dụng

1. Khi mở lần đầu, nhập mã `APP_ADMIN_TOKEN` từ cấu hình riêng của NAS và tạo tài khoản quản trị. Từ lần sau đăng nhập bằng tài khoản cá nhân.
2. Trong **Văn bản pháp luật**, chọn **Thêm văn bản** hoặc **Nhập nhiều link**. Có thể lưu URL trước rồi bổ sung metadata, PDF hoặc DOCX. Chọn dòng văn bản để xem tệp và lịch sử.
3. Quản trị viên tạo tài khoản và khai báo phòng ban. Quản trị và Pháp chế duyệt văn bản và giao việc. Quản lý phòng ban có thể biên tập danh mục và cập nhật công việc của phòng mình. Nhân viên đọc danh mục chung và cập nhật công việc được giao.
4. Muốn phân tích AI, mở **AI phân tích**, chọn văn bản có tệp và xác nhận nội dung được phép gửi tới Gemini. Kết quả là đề xuất cần kiểm tra. PDF scan cần OCR trước khi tải lên. DOCX xem dưới dạng văn bản, có thể tải bản gốc để xem định dạng.
5. Công việc có hạn nội bộ. Khi SMTP được cấu hình, worker kiểm tra mỗi 5 phút và gửi theo các mốc `REMINDER_DAYS`. Xem kết quả ở **Công việc và nhắc hạn**. Trạng thái đang gửi hoặc thất bại cần đối chiếu với máy chủ email. Worker giữ một lần gửi cho mỗi công việc, ngày hạn và mốc nhắc để hạn chế gửi trùng.

Danh mục chung dành cho người dùng đã đăng nhập. Kho SOP hạn chế theo phòng ban, theo dõi nguồn tự động, AI góp ý dự thảo và Microsoft 365 thuộc giai đoạn sau.

## Chạy bằng Docker Compose

Chuẩn bị Docker Compose, Node chỉ cần khi phát triển giao diện bên ngoài Docker. Chép `.env.example` thành `.env`, thay các giá trị mẫu bằng thông tin riêng. Dùng mã thiết lập ngẫu nhiên dài tối thiểu 12 ký tự. Mật khẩu PostgreSQL trong `POSTGRES_PASSWORD` và `DATABASE_URL` phải tương ứng. Nếu mật khẩu chứa ký tự đặc biệt, mã hóa nó trong phần mật khẩu của URL.

Chạy local:

```sh
docker compose up -d --build
```

Mở `http://127.0.0.1:8080`. Khi phát triển UI, chạy `npm ci` và `npm run dev` trong `frontend`, cùng API ở cổng 8080.

Trên NAS, xác nhận DSM, Container Manager, kiến trúc, RAM, dung lượng, quyền ghi `data/documents` và tải được image/dependency. Cấu hình hiện tại dùng hai file Compose:

```sh
cd /volume1/docker/vanbanphapluat
sudo /var/packages/ContainerManager/target/usr/bin/docker-compose \
  -f compose.yaml -f compose.nas.yaml --env-file .env up -d --build
```

Khi cập nhật stack đang chạy, sao lưu trước và dùng `build api worker frontend`, sau đó `up -d --no-deps api worker frontend` với cùng cặp file Compose. Migration mới chạy tự động khi API hoặc worker khởi động. Kiểm tra `/health` và đăng nhập qua trình duyệt. Dùng HTTPS nội bộ hoặc VPN cho truy cập có thông tin đăng nhập.

## Cấu hình tích hợp

- **Gemini**. Đặt `GEMINI_API_KEY` và tùy chọn `GEMINI_MODEL` trong `.env` trên NAS. Tạo lại API để nạp cấu hình. Chỉ gửi tài liệu đã được phép. Khi chưa có key, danh mục và công việc vẫn dùng được.
- **SMTP**. Đặt `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURITY` (`starttls` hoặc `ssl`), `SMTP_FROM`, thông tin xác thực nếu máy chủ yêu cầu, và `APP_BASE_URL` là URL người nhận có thể mở. Đặt email cho tài khoản nhận và tạo lại worker để nạp cấu hình.
- Mã nguồn và file cấu hình mẫu được quản lý trên GitHub. Giữ `.env`, cơ sở dữ liệu, tài liệu và bản sao lưu trên NAS hoặc kho sao lưu nội bộ.

## Sao lưu và phục hồi

Tạo thư mục sao lưu riêng giới hạn quyền đọc. Tạm ngưng API và worker trước khi sao lưu đồng bộ PostgreSQL và thư mục tài liệu. Từ thư mục dự án, sử dụng cùng tùy chọn Compose đã triển khai để chạy:

```sh
docker compose -f compose.yaml -f compose.nas.yaml stop api worker
docker compose -f compose.yaml -f compose.nas.yaml exec -T postgres \
  sh -c 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc' > /duong-dan-sao-luu/vbpl.dump
tar -czf /duong-dan-sao-luu/van-ban.tar.gz data/documents
docker compose -f compose.yaml -f compose.nas.yaml start api worker
```

Lưu `.env` trong kho bí mật riêng. Kiểm tra dump bằng `pg_restore -l`, rồi kiểm tra phục hồi trong môi trường tách biệt. Phục hồi dump bằng `pg_restore --exit-on-error --no-owner -d TEN_DB_RONG vbpl.dump` vào cơ sở dữ liệu rỗng. Khôi phục thư mục tệp theo mount `/data/documents`, sau đó chạy ứng dụng với DB vừa phục hồi và xác nhận mở được tệp cũ. Tránh chép thư mục dữ liệu PostgreSQL khi database đang chạy.

## Kiểm thử

- Giao diện: `npm ci`, `npm run build` trong `frontend`.
- Backend: cài `backend/requirements.txt` và `httpx`, đặt `PYTHONPATH=backend` và `VBPL_TEST_DATABASE_URL` trỏ đến PostgreSQL rỗng dùng riêng cho kiểm thử, chạy `python -m unittest discover -s backend/tests -v`. Bộ kiểm thử dùng phản hồi Gemini và gửi thư giả lập, không cần khóa hoặc người nhận thật.
