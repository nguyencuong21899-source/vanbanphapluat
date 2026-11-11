# Bàn làm việc pháp lý Traphaco CNC

Bản triển khai 11/11/2026 mở rộng hệ thống VBPL theo các nhóm nghiệp vụ trong tài liệu LEXcentra do người dùng cung cấp. Đây là phần mềm nội bộ của Traphaco CNC, không phải sản phẩm hay API LEXcentra. Các tỷ lệ hiệu quả trong tài liệu giới thiệu không được coi là kết quả đã đo.

## Các chức năng và phạm vi hiện có

| Nghiệp vụ | Cách sử dụng | Giới hạn |
|---|---|---|
| Phân tích vụ việc | Mở hồ sơ, nhập mục tiêu và bối cảnh, thêm chứng từ; Agent đề xuất nhận định, câu hỏi thiếu dữ kiện và phương án | Chỉ phân tích nguồn đã cung cấp; cần chuyên môn xác nhận |
| Theo dõi thay đổi | Giữ danh mục VBPL, dự thảo và nhắc mốc đã nhập; mở hồ sơ **Đánh giá thay đổi** với bản cũ, bản mới và SOP liên quan | Chưa tự thu thập Internet/Outlook, chưa tự xác minh hiệu lực |
| Tra cứu và nghiên cứu | Đặt câu hỏi trong hồ sơ; thêm căn cứ từ danh mục, trích đoạn hoặc tệp; đọc trích dẫn và giới hạn | Chưa tìm toàn bộ kho bằng vector hoặc nghiên cứu web tự động |
| Rà soát | Thêm hợp đồng, SOP, quy chế, playbook và căn cứ; xem ma trận phù hợp, xung đột, thiếu, lỗi thời, chưa rõ | Không tự sửa bản gốc hoặc kết luận vi phạm |
| Soạn thảo | Chọn Agent **Soạn thảo và góp ý**, ghi loại văn bản, đối tượng, mục tiêu; tải mẫu và nguồn | Tạo bản làm việc, xuất TXT; chưa xuất DOCX có định dạng/redline |
| Nghĩa vụ và công việc | Từ phát hiện đã duyệt, chọn **Lập công việc từ phát hiện**; xác nhận người phụ trách và hạn nội bộ | Giao việc qua ứng dụng; không tự gửi email mới |
| Phân phối tri thức | Báo cáo mới nhất được Pháp chế duyệt sẽ xuất hiện trong **Tri thức đã duyệt** | Chỉ trong phạm vi hồ sơ; không tự xuất bản ra ngoài |
| Kiểm soát | Phân quyền hồ sơ, nguồn bất biến, phiên bản báo cáo, ý kiến duyệt, lịch sử truy cập và xử lý | Chưa phân quyền riêng từng tệp; mọi nguồn trong hồ sơ dùng cùng phạm vi |

## Quy trình thực tế

1. Vào **Bàn làm việc pháp lý**, chọn Agent hoặc **Mở hồ sơ mới**.
2. Điền tên, câu hỏi/mục tiêu, bối cảnh và phạm vi truy cập.
3. Ở **Hồ sơ và nguồn**, tải PDF có lớp văn bản, DOCX, TXT hoặc MD; hoặc nhập trích đoạn/URL. Có thể lấy bản chụp từ danh mục VBPL và sao chép nội dung nguồn từ hồ sơ khác được phép đọc.
4. Ở **Kết quả và phê duyệt**, xác nhận được phép gửi nội dung tới Gemini rồi chạy Agent. Nếu chưa cấu hình AI, viết báo cáo và ma trận phát hiện thủ công.
5. Rà soát nguyên văn căn cứ, vị trí điều/trang và dữ kiện còn thiếu. Chỉnh báo cáo bằng cách lưu phiên bản mới. Trích dẫn phải khớp văn bản nguồn; kiểm tra khớp không thay thế xác minh hiệu lực hay đánh giá áp dụng pháp luật.
6. Pháp chế/quản trị duyệt kết quả hoặc yêu cầu sửa. Chỉ kết quả mới nhất, khớp phiên bản hồ sơ hiện tại được duyệt.
7. Từ phát hiện đã duyệt, lập công việc, chọn người phụ trách có quyền xem hồ sơ và ngày hạn nội bộ. Người nhận nộp bằng chứng bằng mô tả, mã hồ sơ hoặc đường dẫn; Pháp chế xác nhận hoàn thành.
8. Tra cứu kết quả đã duyệt tại **Tri thức đã duyệt**, xuất báo cáo TXT hoặc xem lịch sử. Khi bổ sung nguồn hay sửa hồ sơ, kết quả cũ còn nguyên nhưng không còn xuất hiện như tri thức hiện hành.

## Phân quyền

- Mọi tài khoản nội bộ có thể tạo hồ sơ riêng và dùng Agent trên hồ sơ được phép sửa.
- Chủ hồ sơ sửa hồ sơ của mình; quản lý sửa hồ sơ chia sẻ cho phòng mình; Pháp chế và quản trị rà soát tất cả.
- Riêng tư: chủ hồ sơ, Pháp chế, quản trị.
- Phòng ban: các tài khoản cùng phòng được đọc. Chủ hồ sơ, quản lý phòng, Pháp chế và quản trị được sửa.
- Toàn công ty: mọi tài khoản được đọc, quyền sửa vẫn theo chủ hồ sơ/Pháp chế/quản trị. Chỉ Pháp chế hoặc quản trị quyết định phạm vi toàn công ty.
- Sao chép nguồn không cho phép nhân viên tự mở rộng phạm vi của tài liệu gốc. Các thao tác sao chép/chia sẻ do Pháp chế cần được kiểm tra trước khi thực hiện.
- Phạm vi mới không được loại người đang nhận nghĩa vụ ra khỏi hồ sơ.
- Báo cáo chờ duyệt cũng được người có quyền đọc hồ sơ xem với nhãn trạng thái rõ ràng. Kho tri thức chỉ lấy báo cáo đã duyệt.

Danh mục VBPL cũ là danh mục chung cho tài khoản nội bộ. Tệp hợp đồng/SOP hạn chế truy cập nên được thêm vào hồ sơ, không đưa vào danh mục chung.

## Lưu trữ, API và vận hành

- Migration bổ sung: `backend/app/migrations/004_legal_workbench.sql`, chạy tự động khi API/worker khởi động.
- PostgreSQL lưu `legal_matters`, `legal_sources`, `legal_reports`, `legal_actions`. Giữ nguyên bảng và dữ liệu cũ.
- Tệp gốc nằm trong `data/documents/legal-<uuid>.<ext>` trên NAS. Nội dung trích xuất và digest được lưu trong PostgreSQL.
- Mỗi hồ sơ tối đa 15 nguồn; tệp tối đa 20 MB; một nguồn tối đa 65.000 ký tự; một yêu cầu AI tối đa 120.000 ký tự. Quá giới hạn được báo lỗi; không âm thầm bỏ bớt nguồn. PDF scan cần OCR trước.
- Nguồn hồ sơ là bản chụp: thay đổi văn bản trong danh mục chung không tự thay bản chụp. Thêm nguồn mới và phân tích lại khi muốn dùng phiên bản mới.
- Lịch sử trả tối đa 100 sự kiện, màn hình chi tiết trả tối đa 30 báo cáo mới nhất; bản cũ vẫn ở DB.
- Không tự truy cập URL nguồn. Không tự gửi email, sửa SOP hay ký/phát hành tài liệu từ kết quả AI.
- API nhóm `/api/legal`: `matters`, `matters/{id}/sources`, `matters/{id}/files`, `sources/{id}/file`, `matters/{id}/generate`, `matters/{id}/reports`, `matters/{id}/reports/{report}/review`, `matters/{id}/actions`, `actions`, `library`, `knowledge`, `people`.
- PUT hồ sơ, lưu báo cáo, chạy Agent và PATCH nghĩa vụ kiểm tra phiên bản để tránh ghi đè thay đổi đồng thời.
- Xác nhận AI bao gồm bối cảnh hồ sơ, tất cả nguồn và mô tả phòng ban. Mỗi lần gọi được ghi nhật ký; kết quả có provider, người tạo, bản chụp danh sách nguồn và thời điểm.
- Dùng `GEMINI_API_KEY` và `GEMINI_MODEL` đã có trong cấu hình riêng. Khi chưa cấu hình, API trả 503 và giao diện hướng dẫn biên soạn thủ công.
- Nhắc mốc VBPL/dự thảo và nhắc công việc cũ được giữ nguyên. Nghĩa vụ mới hiển thị quá hạn trong bàn làm việc; chưa có email nhắc riêng cho bảng nghĩa vụ mới.
- Sao lưu đồng bộ PostgreSQL, `data/documents` và cấu hình riêng theo README. Không commit bí mật hoặc tài liệu nghiệp vụ lên Git.

## Xác minh và phần cần cấu hình tiếp

Kiểm thử tích hợp dùng PostgreSQL riêng: nâng cấp từ schema cũ, tạo nguồn/tệp, sáu loại hồ sơ, phân quyền đọc/tải/sửa/sao chép, báo cáo Gemini giả lập, căn cứ không khớp, phiên bản cũ, phê duyệt, tri thức, nghĩa vụ và bằng chứng. Luồng cũ được kiểm tra lại trong cùng bộ test.

Kiểm tra giao diện bằng Edge headless với API giả lập: trang đầu, hồ sơ rỗng, thêm nguồn, báo cáo thủ công, duyệt, giao việc, kho tài liệu/tri thức, trạng thái tải/lỗi và màn hình 390 px. TypeScript và Vite production build phải đạt.

Các phần chưa triển khai: kết nối Outlook/Microsoft 365; crawler nguồn chính thức; tìm kiếm toàn kho và Internet tự động; OCR; redline DOCX; kết nối NotebookLM; báo cáo KPI thời gian/chất lượng phân tích. Màn hình hiện hiển thị số hồ sơ, nghĩa vụ quá hạn và kết quả đã duyệt trong phạm vi truy cập, chưa suy diễn tỷ lệ tiết kiệm chi phí/thời gian.

Trước khi đo PoC nên cung cấp hồ sơ thử thực tế, playbook/mẫu chuẩn, căn cứ pháp luật đã xác minh và tiêu chí người duyệt. Gemini thật và chất lượng pháp lý chưa được xác nhận bằng các test giả lập.
