# Nghiệm thu production bổ sung: báo cáo, chương trình và Lịch Theo Tuyến

Ngày kiểm tra: 13/09/2026. Website: https://truecare-employee.onrender.com.

## Deploy

- Render service: `srv-dah9v7u1egvs73d75us0`.
- Deploy ID: `dep-daiq43jm8hqs73ds2bu0`.
- Application commit: `01d1a5e21df7a4337930704c9a76cae2274af92b`.
- Trigger: Manual Deploy -> Deploy latest commit trên Render Dashboard.
- Trạng thái Render: `Deploy succeeded|Live`.
- Thời lượng build/deploy hiển thị: `52.9s`.
- Source hiển thị trên Dashboard: `01d1a5e`.
- Build command: `npm ci --include=dev && npm run build`.
- Start command: `npm run start:production`.
- Health check: `/api/health`.

## Kết quả production public smoke

| Hạng mục | Kết quả |
| --- | --- |
| Health | 200, `mode=supabase`, `productionReady=true` |
| Bundle mới | `/assets/index-YVeCcusi.js`, `/assets/index-B9gEIJqE.css` |
| Logo | SHA256 `800994985FCFBCDFA0B83D689BA591E5AEC45EEF4479C5ECAEA6B69396040026` |
| Login/Forgot shell | `/login` và `/forgot-password` tải shell đăng nhập, có logo TrueCare |
| Protected routes ẩn danh | `/programs`, `/route-schedule`, `/admin` trả shell đăng nhập, không lộ màn hình nghiệp vụ |
| Console/tài nguyên | Không ghi nhận lỗi console hoặc tài nguyên 404 trong public smoke |

## Firecrawl public verification

- Firecrawl scrape `/login`: HTTP 200, title `Đăng nhập · TrueCare`, logo `truecare-logo.png`, form mã công ty/email/mật khẩu và link quên mật khẩu hiển thị.
- Firecrawl scrape `/route-schedule`: HTTP 200 nhưng nội dung public vẫn là shell đăng nhập, không lộ Lịch Theo Tuyến khi chưa xác thực.
- Firecrawl scrape `/admin`: HTTP 200 nhưng nội dung public vẫn là shell đăng nhập, không lộ màn hình quản trị khi chưa xác thực.
- Các scrape dùng `maxAge=0` để buộc lấy bản hiện tại sau deploy.

## Kiểm thử trước deploy

- `npm run typecheck`: đạt.
- `npm test`: 56/56 kiểm thử nghiệp vụ đạt.
- `npm run build`: đạt, build tạo bundle `index-YVeCcusi.js`.
- `npm run test:e2e`: 114/114 ca Playwright đạt trên desktop, mobile, Firefox và WebKit.
- Ma trận route/theme/viewport giữ kiểm tra 360, 390, 768, 1023, 1024, 1440 và 1920px; có kiểm tra không tràn ngang toàn trang, theme sáng/tối, không lỗi console/page/http.
- Ca mới bổ sung:
  - `/programs` hiển thị sản phẩm đủ điều kiện trong form tạo chương trình và giải thích sản phẩm bị chặn.
  - `/route-schedule` tạo và hoàn thành Lịch Theo Tuyến, kết quả được ghi thành lượt chăm sóc để dùng lại trong báo cáo.
  - `/admin` base redirect về dashboard chính; các phân hệ `/admin/*` vẫn còn để giữ chức năng quản trị và phân quyền.

## Nghiệm thu sau đăng nhập admin

Đã đăng nhập production bằng tài khoản admin được cung cấp trong phiên làm việc và chạy smoke chỉ đọc. Không lưu thông tin đăng nhập vào Git hoặc báo cáo.

Kết quả lưu tại `docs/design/route-attendance-auth-verification/authenticated-smoke.json`:

- Session sau đăng nhập có role `admin`.
- `/api/state` trả 200, state version tại thời điểm kiểm tra là 119.
- `/` tải dashboard nhân viên, `/report` tải báo cáo cuối ngày, `/programs` tải form chương trình, `/route-schedule` tải Lịch Theo Tuyến.
- `/admin` redirect về `/` sau khi đã xác thực; các phân hệ `/admin/overview`, `/admin/customers`, `/admin/products`, `/admin/inventory`, `/admin/funds`, `/admin/programs`, `/admin/imports`, `/admin/audit`, `/admin/employees`, `/admin/catalogs`, `/admin/system` vẫn truy cập được để giữ chức năng quản trị.
- Nút Xóa dòng đang hiển thị trên dữ liệu production ở các danh sách có dữ liệu: khách hàng, sản phẩm, nhật ký, nhân viên và danh mục. Các danh sách không có dữ liệu hiển thị trạng thái bulk disabled đúng.
- Modal Xóa sản phẩm mở được, có trường lý do quản trị và đóng bằng Escape/Hủy; không bấm xác nhận xóa.
- Lịch Theo Tuyến không tràn ngang ở 360, 390, 768, 1023, 1024, 1440 và 1920px.
- Không ghi nhận lỗi console hoặc response HTTP xấu trong smoke sau đăng nhập.

Ảnh nghiệm thu đã mask dữ liệu bảng/thống kê nằm trong `docs/design/route-attendance-auth-verification/`, gồm dashboard, báo cáo, chương trình, Lịch Theo Tuyến và các phân hệ admin ở 1440px.

## Khôi phục

Nếu bản `01d1a5e21df7a4337930704c9a76cae2274af92b` lỗi nghiêm trọng, rollback ứng dụng trên Render về deploy đang hoạt động trước đó. Giữ nguyên database; phần bổ sung này không thêm migration mới và không yêu cầu chạy lại migration cũ.
