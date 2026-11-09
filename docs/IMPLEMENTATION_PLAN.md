# Kế hoạch triển khai Traphaco CNC

1. Giữ dữ liệu PostgreSQL hiện có. Áp dụng migration có phiên bản khi khởi động API và worker, dùng khóa giao dịch để hai tiến trình không chạy migration đồng thời.
2. Mở danh mục văn bản làm trang chính. Bổ sung tài khoản, quyền theo vai trò, thêm URL, sửa và lưu trữ văn bản, tệp PDF/DOCX, lịch sử, phòng ban và công việc.
3. Lưu kết quả AI dạng đề xuất có căn cứ. Chỉ gửi tệp khi người có quyền xác nhận được phép. Nhắc hạn qua SMTP nếu đã cấu hình.
4. Kiểm thử trên cơ sở dữ liệu riêng trước khi thay container NAS. Xác nhận dung lượng, kiến trúc, phiên bản Compose, quyền ghi kho tệp và khả năng tải image. Giữ PostgreSQL và Qdrant đang chạy khi thay các container ứng dụng.
5. Sau khi MVP ổn định, xác minh từng nguồn trước khi thêm bộ thu thập. So sánh dự thảo, kho SOP và Microsoft 365 thuộc giai đoạn sau.

Synology từng chạy stack Docker Compose tại `/volume1/docker/vanbanphapluat`. Cấu hình, tình trạng dịch vụ và quyền truy cập hiện tại cần được xác nhận lại trước khi phát hành.
