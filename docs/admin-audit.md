# Audit Admin Console TrueCare

Ngày audit: 11/09/2026. Nguồn bằng chứng: mã nguồn, API production, kiểm tra trình duyệt chỉ đọc trên Render và bộ test tự động. Tài khoản HPT là tài khoản nhân viên nên chỉ dùng đối chiếu luồng bán hàng, không dùng để suy đoán quyền admin HPT.

| Phân hệ | Trước thay đổi | Kết quả triển khai | Ưu tiên | Tiêu chí nghiệm thu |
|---|---|---|---|---|
| Tổng quan admin | Một bảng nhân viên, không có hàng đợi cảnh báo | Đầy đủ | P0 | Thấy toa giao dở, kho thấp, quỹ âm, dữ liệu thiếu, khách trùng và sản phẩm cần đối chiếu |
| Khách hàng | Chỉ lưu trữ/khôi phục ở màn hình chung | Đầy đủ | P0 | Có thùng rác, khôi phục, purge khi không có liên kết và gộp khách nguyên tử |
| Toa toàn đội | Phải mở từng workspace | Đầy đủ | P0 | Lọc nhân viên/trạng thái/ngày, mở đúng toa và quản lý thùng tạm giữ |
| Sản phẩm & giá | Danh mục chung nhưng cập nhật giá giả lập theo nhân viên | Đầy đủ | P0 | Giá áp dụng toàn công ty, mã đang dùng không trùng, có lịch sử/ngày hiệu lực |
| Kho | Tồn tách trong từng JSON nhân viên | Đầy đủ | P0 | Một số dư công ty, biến động ghi owner/toa, nhân viên không điều chỉnh được |
| Quỹ & chương trình | Chỉ xem qua workspace | Đầy đủ | P1 | Tổng hợp theo nhân viên và mở đúng workspace để xử lý |
| Tài khoản | Tạo, khóa, reset, thu hồi; chưa sửa email/lần đăng nhập | Đầy đủ | P0 | Sửa hồ sơ, thấy lần đăng nhập cuối, không làm mất admin cuối cùng |
| Danh mục | Textarea toàn bộ danh sách, không biết mục đang dùng | Đầy đủ | P1 | Hiện số nơi dùng và chặn xóa mục có liên kết |
| Nhập dữ liệu | Không có lịch sử tập trung | Đầy đủ | P1 | Ghi preview/commit/failed, không lưu nội dung tệp nhạy cảm |
| Nhật ký | 30 dòng kỹ thuật, không lọc hoặc xem trước/sau | Đầy đủ | P0 | Phân trang/lọc/xuất/chi tiết và trigger chặn sửa/xóa |
| Cài đặt hệ thống | Chưa có | Đầy đủ | P1 | Hiện health, DB latency, deployment/runtime; không trả secrets |
| Phân quyền API | Có admin middleware và kiểm tra một số command | Đầy đủ | P0 | Employee bị chặn ở mọi API admin và command sản phẩm/kho/danh mục/khách xóa |
| Chống gửi lặp & đồng thời | Workspace có receipt; kho chưa có version chung | Đầy đủ | P0 | Kho có version riêng, RPC khóa cùng workspace/danh mục/kho |
| Đăng nhập | Chưa giới hạn thử sai, chưa lưu lần đăng nhập | Đầy đủ | P1 | Chặn tạm sau 8 lần/15 phút và cập nhật `last_login_at` |

## Quy tắc dữ liệu

- Khách ở thùng rác bị ẩn khỏi toa mới nhưng vẫn giữ nguyên lịch sử. Purge chỉ chạy khi toàn bộ workspace không còn toa/lượt ghé tham chiếu.
- Gộp khách chuyển mọi `customerId` sang khách đích trong một transaction, giữ khách nguồn ở trạng thái `merged` và ghi audit.
- Kho công ty bằng tổng số dư kho nhân viên tại thời điểm migration. Mọi movement cũ giữ `owner_id`; movement mới khóa bằng `inventoryVersion`.
- Bảng giá có lịch sử theo ngày hiệu lực. Toa đã lập tiếp tục dùng giá snapshot trên dòng toa.
- Nhật ký quản trị không ghi mật khẩu, JWT, Supabase key hoặc nội dung tệp tải lên.

## Bằng chứng kiểm thử

- Migration 005–006 đã chạy thử và áp dụng trên Supabase; trước chuyển đổi có 4 workspace, 2 tài khoản, 1 khách dùng chung và tổng tồn 0 đơn vị. Sau chuyển đổi các số tổng không đổi, danh mục chuẩn có 29 mục.
- 37 unit/integration tests đạt, gồm vòng đời khách, chặn purge khi còn toa, đổi tên danh mục và cập nhật tham chiếu, mã sản phẩm, tổng hợp admin, phân quyền, quỹ và kho.
- 11 API admin mới trả kết quả hợp lệ; tài khoản nhân viên gọi `/api/admin/dashboard` nhận 403.
- E2E trên Chromium kiểm tra đủ 11 mục quản trị ở desktop và màn khách hàng 390 px; không có lỗi console hoặc tràn ngang trang.
- `typecheck`, production build và `npm audit --omit=dev --audit-level=high` đều đạt; audit dependency không phát hiện lỗ hổng.
