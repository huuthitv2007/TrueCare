# Thao tác Xóa trong quản trị TrueCare

## Hành vi

Các bảng quản trị ghim cột **Thao tác** bên phải, hiển thị nút **Xóa** có chữ và KeenIcon. Các thao tác phụ ở nút **Khác**. Thanh chọn hàng loạt luôn hiện, tối đa 25 dòng mỗi yêu cầu. Modal yêu cầu lý do từ ba ký tự, nêu ảnh hưởng và giữ khóa chống lặp khi thử lại sau lỗi mạng.

| Danh sách | Xử lý |
| --- | --- |
| Khách hàng, toa, sản phẩm, nhân viên | Xóa mềm; khôi phục và xóa vĩnh viễn theo điều kiện hiện có. Không xóa tài khoản đang đăng nhập hoặc admin hoạt động cuối cùng. |
| Danh mục | Xác nhận rồi lưu ngay riêng mục được chọn. Chặn mục đang dùng và lịch ghé cố định. Giữ các chỉnh sửa chưa lưu khác trong form. |
| Kho | Đưa tồn về 0 và thêm biến động kho. Kiểm tra lượng giữ của toàn đội trong giao dịch database; tồn đã bằng 0 không tạo biến động mới. |
| Quỹ | Bù trừ khoản nhập tay/số dư đầu kỳ bằng khoản đối ứng liên kết bản gốc. Không bù trừ hai lần hoặc xóa khoản đối ứng; khoản từ toa mở chứng từ gốc. |
| Chương trình | Hủy chương trình hoạt động, giải phóng ngân sách chưa dùng rồi lưu trữ. Khôi phục hiển thị không kích hoạt lại chương trình. |
| Lịch sử nhập, nhật ký | Lưu trữ chung cho mọi admin, lọc/xem lại/khôi phục hiển thị. Không xóa dữ liệu đã nhập hoặc sửa nhật ký gốc. |

## API và migration

- `POST /api/admin/:resource/bulk-actions` tiếp tục dùng `action`, `items`, `reason`, `idempotencyKey`; bổ sung `inventory`, `funds`, `programs`, `imports`, `audit`. `purge` không áp dụng cho năm nhóm mới; kho/quỹ chỉ chấp nhận `trash` để điều chỉnh có lịch sử.
- `DELETE /api/admin/catalogs/:kind/entries` nhận `value`, `reason`, `idempotencyKey`; đọc danh mục hiện tại ở server và xóa đúng một mục.
- Danh sách chương trình, nhập và audit nhận `archive=visible|archived|all`, mặc định `visible`; lọc trước khi đếm và phân trang.
- Migration `202609120013_admin_list_actions.sql` bổ sung bảng trạng thái lưu trữ, hai view có quyền service role, RPC lưu trữ và RPC kiểm tra giữ hàng toàn đội. Trigger nhật ký append-only được giữ nguyên.
- Migration 013 đã áp dụng ngày 12/09/2026. Source SQL khớp lịch sử migration. So sánh trước/sau xác nhận toàn bộ mười bảng dữ liệu được sao lưu không đổi sau migration.

## Kiểm chứng

- Typecheck và build đạt.
- 52 kiểm thử nghiệp vụ/SQL đạt, gồm áp dụng toàn bộ 13 migration trên PostgreSQL riêng, quyền service role/nhân viên, nhật ký bất biến, rollback nếu ghi audit lỗi, bù trừ chính xác và xung đột phiên bản.
- Playwright: lượt đầy đủ đạt 101/102 ca trong 21,7 phút; ca Firefox còn lại quá thời gian khi đóng context và đạt khi chạy lại riêng (13 giây). Tổng cộng 102 ca có kết quả đạt. Ma trận đạt 25 route × bảy chiều rộng × hai theme × ba engine = 1.050 lượt trang; gồm breakpoint 1023/1024px, không tràn ngang toàn trang hoặc lỗi tài nguyên. Có kiểm tra axe và focus bàn phím.
- Render production `https://truecare-employee.onrender.com` đã chạy commit `7b39e09a772a9e806b691fc134d8a8719d8f5806` qua deploy `dep-daiksdmk1f9s738kgla0`. Health trả 200, HTML tải bundle mới `/assets/index-Csa7R7KC.js`, `/assets/index-C0vuaUuq.css` và Admin chunk `/assets/Admin-CbCDtlux.js`; logo giữ SHA256 bên dưới.
- Tài nguyên production đã kiểm tra 200 đúng MIME: Inter CSS/woff2, KeenIcons CSS/font, theme init và print assets. Không phát sinh lỗi console hoặc 404 trong ma trận nghiệm thu cuối.
- Tài khoản nhân viên kiểm thử bị từ chối ở cả năm nhóm API admin mới; truy cập ẩn danh bị chặn khỏi admin API; state nghiệp vụ trước/sau bằng nhau.
- Không tạo hoặc sửa giao dịch nghiệp vụ production để thử chức năng Xóa. Kiểm thử thay đổi dữ liệu dùng fixture, PostgreSQL riêng và bộ API nghiệp vụ với dữ liệu QA riêng.
- Luồng admin production được nghiệm thu chỉ đọc: các danh sách hiển thị cột **Thao tác**, nút **Xóa**, menu **Khác**, bộ lọc lưu trữ và phân trang; modal Xóa mở, focus vào lý do và đóng bằng Escape/Hủy. Không xác nhận xóa, bù trừ, điều chỉnh kho hoặc lưu trữ dữ liệu production.

## Ảnh giao diện

Ảnh chụp từ fixture có dữ liệu, tên file chứa chiều rộng và theme:

- [Khách hàng desktop](admin-customers-1440-light.png), [khách hàng mobile](admin-customers-390-light.png).
- [Kho mobile](admin-inventory-390-light.png), [quỹ mobile dark](admin-funds-390-dark.png).
- [Lịch sử nhập](admin-imports-1440-light.png), [nhật ký dark](admin-audit-1440-dark.png).

Ảnh nghiệm thu production đã che dữ liệu nằm trong `production-verification/screenshots`:

- [Sản phẩm mobile light](production-verification/screenshots/products-390-light.png), [sản phẩm mobile dark](production-verification/screenshots/products-390-dark.png).
- [Sản phẩm desktop light](production-verification/screenshots/products-1440-light.png), [sản phẩm desktop dark](production-verification/screenshots/products-1440-dark.png).
- [Modal Xóa mobile](production-verification/screenshots/delete-modal-390.png), [modal Xóa desktop](production-verification/screenshots/delete-modal-1440.png).

## Phát hành và khôi phục

Sao lưu source trước thay đổi và dữ liệu trước migration ở `C:\Users\ZGAMESVN\Downloads\TrueCare-backup-admin-delete-20260912-095447`. File `base-commit.txt` chứa phiên bản gốc; `database-before-013.json` chứa bản sao dữ liệu và lịch sử migration. Log kiểm thử tạm nằm ngoài repository trong cùng thư mục sao lưu.

Logo gốc giữ SHA256 `800994985FCFBCDFA0B83D689BA591E5AEC45EEF4479C5ECAEA6B69396040026`.

Bản build frontend bàn giao: `.local/TrueCare-admin-delete-build-20260912.zip`. Backend và migration nằm trong source; khi triển khai dùng `npm ci`, `npm run build`, `npm run start:production` với cấu hình production hiện có.

Website: https://truecare-employee.onrender.com. Migration phải có trước bản ứng dụng mới. Nếu ứng dụng lỗi, dùng Render rollback phiên bản ứng dụng; giữ migration bổ sung và dữ liệu mới, không chạy migration đảo ngược hoặc phục hồi đè database. Khôi phục source cục bộ bằng checkout riêng từ commit trong `base-commit.txt`, không reset công việc đang có.

Render đã được triển khai thủ công bằng **Manual Deploy → Deploy latest commit** tại service `srv-dah9v7u1egvs73d75us0`. Điểm khôi phục ứng dụng trước deploy là commit `0cbf0b6`; nếu cần rollback, dùng Render rollback về deploy trước và giữ nguyên database/migration 013. Dashboard trong lúc kiểm tra hiển thị cảnh báo quyền truy cập Git repository trước khi clone, nhưng deploy thủ công vẫn clone/build thành công; chưa thay đổi cấu hình CI/CD.
