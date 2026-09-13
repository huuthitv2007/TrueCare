# Hoàn thiện nghiệp vụ TrueCare — 13/09/2026

## Phạm vi

Giữ giao diện Metronic, logo, router nghiệp vụ và mô hình workspace hiện tại. Bản này sửa chốt toa nguyên tử, ngân sách chương trình quá hạn và tính nhất quán giữa lịch chăm sóc với báo cáo; bổ sung duyệt điểm danh, lịch toàn đội, dùng suất chương trình và màn hình đặt mật khẩu mới.

Không thêm vai trò trưởng nhóm, khách hàng nhiều tuyến, Redis hoặc tính năng bản đồ. Không tự suy ra ngày công từ đơn hàng; không tự ghép lịch cũ với lượt chăm sóc khi thiếu bằng chứng.

## Thay đổi đã triển khai

| Hạng mục | Hành vi mới |
|---|---|
| Chốt toa | `saveAndConfirmOrder` lưu và chốt trong một giao dịch; lỗi kiểm tra không lưu một phần. Thử lại sau mất phản hồi dùng cùng khóa yêu cầu. Xung đột có thao tác tải bản mới để đối chiếu, giữ nội dung form. |
| Chương trình | Ngày nghiệp vụ Việt Nam thống nhất. Chương trình hết hạn không giữ quỹ/kho; trạng thái và audit cập nhật một lần trong giao dịch ghi tiếp theo. |
| Kho chung | Database kiểm tra lượng giữ của toàn bộ nhân viên; hai workspace không thể cùng giữ vượt tồn. Dữ liệu thiếu tồn cũ không chặn thao tác không làm tăng thiếu hụt. |
| Lịch chăm sóc | Kiểm tra ID sửa, tuyến và khách đang hoạt động. Lịch hoàn thành dùng “Điều chỉnh kết quả”, có lý do, ngày thực hiện và lịch sử trước/sau. Lượt chăm sóc liên kết lịch–khách và được vô hiệu hóa có dấu vết khi điều chỉnh. |
| Tham chiếu | Gộp khách cập nhật cả lịch và lịch sử liên quan, giữ ID gốc để đối chiếu. Chặn xóa vĩnh viễn khách/tuyến còn được lịch sử sử dụng. Ẩn lịch không xóa lượt chăm sóc. |
| Điểm danh | Nhân viên chỉ tự ghi hôm nay; ngày cũ gửi yêu cầu. Admin duyệt/từ chối bằng phiên bản; một yêu cầu chờ mỗi người/ngày. Chặn ngày tương lai và trạng thái sai. |
| Báo cáo | Tính lượt chăm sóc theo ngày thực hiện và kết quả có hiệu lực; chỉ ngày công hợp lệ được tính. Có sao chép, TXT và vùng văn bản chọn hết; đặt lại chỉ đổi ngày/chế độ xem. |
| Lịch toàn đội | Admin có bộ lọc nhân viên/tuyến/trạng thái/khoảng ngày, lưu URL. Ngày/tuần/tháng, danh sách mobile, tìm khách và gợi ý theo tuyến/lần chăm sóc. Sửa lịch nhân viên phải có lý do. |
| Dùng suất | Tìm sản phẩm, giải thích thiếu giá/không đủ điều kiện, xem trước phần bù/ngân sách; chọn khách và số suất để tạo toa bằng `applyProgram`. |
| Khôi phục mật khẩu | PKCE do server quản lý, cookie mã hóa và proof dùng một lần tại database; không chấp nhận phiên đăng nhập thường làm bằng chứng khôi phục. Thu hồi phiên trước khi đổi mật khẩu. |
| Kỹ thuật | Hai API admin lọc trước phân trang, tối đa 100 dòng; đọc dữ liệu chung một lần và phân trang đầy đủ. Asset có hash cache dài; HTML/API không cache, asset/API thiếu trả 404. `noindex`, dependency khóa theo lockfile, CI type/test/build/E2E. |

## API và dữ liệu

- Giữ `/api/commands`; thêm `saveAndConfirmOrder`, các lệnh yêu cầu/duyệt điểm danh và điều chỉnh kết quả trong `server/care-domain.ts`.
- `GET /api/admin/attendance-requests` và `GET /api/admin/route-schedules` dùng view chỉ service role truy cập; kiểm tra admin tại Express trước khi truy vấn.
- Điểm danh, yêu cầu, lịch và lịch sử điều chỉnh tiếp tục ở JSON workspace, cùng cơ chế phiên bản/giao dịch hiện có.
- Migration `202609130014_workspace_hardening.sql` bổ sung view, proof khôi phục, kiểm tra tham chiếu và kiểm tra giữ kho. Không sửa lại số liệu lịch sử hoặc chạy lại migration 009–013.
- Bản ghi lịch cũ không đủ bằng chứng hiển thị yêu cầu đối chiếu; không tự nối theo tên khách/ngày. Khôi phục hiển thị lịch không làm thay đổi báo cáo.

## Kiểm thử và giới hạn

Kết quả trước khi phát hành:

- `npm run typecheck`: đạt.
- `npm test`: 79/79 đạt, gồm kiểm thử nghiệp vụ, bảo mật khôi phục và SQL migration thực trên PostgreSQL/PGlite cô lập.
- `npm run build`: đạt với Vite 8.2.2.
- `npm audit --omit=dev`: 0 lỗ hổng.
- `npm run test:e2e`: 138/138 đạt trong 26,6 phút trên Chromium desktop/mobile, Firefox và WebKit. Ma trận kiểm tra light/dark ở 360, 390, 768, 1023, 1024, 1440 và 1920px.

Kiểm thử ghi dữ liệu chỉ chạy trên SQLite cô lập, fixture trình duyệt và PostgreSQL/PGlite cô lập. Production chỉ đăng nhập, đọc dữ liệu, mở/hủy modal và kiểm tra tài nguyên.

Các ca hồi quy bao gồm giao dịch chốt thất bại/khóa gửi lặp; tranh kho giữa hai workspace; hết hạn theo giờ Việt Nam; điểm danh tương lai/trạng thái sai/ngày cũ/duyệt cạnh tranh; liên kết lịch–lượt chăm sóc và điều chỉnh; tham chiếu sau gộp/xóa; proof khôi phục dùng một lần; quyền employee A/B/admin với backend thật.

Luồng khôi phục được kiểm tra bằng SDK Supabase đã khóa phiên bản với transport kiểm thử, SQL proof thực và màn hình trình duyệt. Không gửi email hoặc đổi mật khẩu tài khoản production. Chưa xác nhận việc chuyển email thực tế tới hộp thư qua cấu hình SMTP của production; đây là phần phụ thuộc dịch vụ cần kiểm tra bằng tài khoản/môi trường email kiểm thử riêng. Liên kết phải mở trong trình duyệt đã gửi yêu cầu trong vòng 15 phút. Hướng dẫn nền: [Supabase password recovery](https://supabase.com/docs/guides/auth/passwords#resetting-a-password).

## Sao lưu và khôi phục

- Bản trước: `f110b37cb94b7362b533906d955ed46bb167d2eb`.
- Render deploy hoạt động trước thay đổi: `dep-daj7q70ae00c738tqghg`, service `srv-dah9v7u1egvs73d75us0`.
- Sao lưu source và Git bundle ngoài repo: `C:\Users\ZGAMESVN\Downloads\TrueCare-backups\pre-hardening-20260913-190329`.
- Snapshot database ngay trước migration: `database-1789304953501.json` trong cùng thư mục, không đưa vào Git vì có dữ liệu nội bộ. Migration 014 đã áp dụng thành công; migration 013 khớp source, hai view được tạo và dấu vân tay của cả 19 bảng cũ không đổi trong transaction. SHA-256 migration: `f5d456f2d10aa1d7098582730e949735b25196a4dae95454f8d9ea54fa33ea88`.
- Nếu bản ứng dụng lỗi nghiêm trọng: chọn deploy hoạt động trước đó trên Render và rollback; giữ migration bổ sung và dữ liệu mới. Sửa lỗi bằng commit tiếp theo. Không tự chạy migration đảo ngược hoặc phục hồi đè dữ liệu mới. [Render deploys](https://render.com/docs/deploys)
- Logo gốc SHA-256: `800994985fcfbcdFA0b83d689ba591e5aec45eef4479c5ecaea6b69396040026` (so sánh không phân biệt hoa/thường).
- Ảnh kiểm thử tự sinh, log và trace nằm ngoài Git; chỉ báo cáo tổng hợp được theo dõi.
