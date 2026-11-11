# Kế hoạch triển khai Traphaco CNC

1. Giữ dữ liệu PostgreSQL hiện có. Áp dụng migration có phiên bản khi khởi động API và worker, dùng khóa giao dịch để hai tiến trình không chạy migration đồng thời.
2. Bàn làm việc pháp lý là trang chính; danh mục văn bản được giữ riêng. Tài khoản, quyền theo vai trò, thêm URL, sửa/lưu trữ văn bản, tệp, lịch sử, phòng ban và công việc tiếp tục hoạt động.
3. Lưu kết quả AI dạng đề xuất có căn cứ. Chỉ gửi tệp khi người có quyền xác nhận được phép. Nhắc hạn qua SMTP nếu đã cấu hình.
4. Kiểm thử trên cơ sở dữ liệu riêng trước khi thay container NAS. Xác nhận dung lượng, kiến trúc, phiên bản Compose, quyền ghi kho tệp và khả năng tải image. Giữ PostgreSQL và Qdrant đang chạy khi thay các container ứng dụng.
5. Hồ sơ đa nguồn, rà soát, soạn thảo/góp ý, kho SOP theo quyền truy cập, phê duyệt và nghĩa vụ được mô tả trong LEGAL_WORKBENCH.md. Xác minh từng nguồn trước khi thêm bộ thu thập. Microsoft 365, nghiên cứu web tự động và OCR cần triển khai tiếp.

Synology từng chạy stack Docker Compose tại `/volume1/docker/vanbanphapluat`. Cấu hình, tình trạng dịch vụ và quyền truy cập hiện tại cần được xác nhận lại trước khi phát hành.
