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

## Ghi chú nghiệm thu sau đăng nhập

Các phiên đăng nhập production lưu trong `.private/release-admin-storage.json`, `.private/smoke-admin-storage.json` và `.private/smoke-employee-storage.json` đều đã hết hạn: `/api/state` trả 401. Các credential có nhãn rõ trong `C:\Users\ZGAMESVN\Documents\account.txt` đã thử ở mức hạn chế và đều trả 401, không tiếp tục thử thêm để tránh khóa hoặc rate-limit tài khoản.

Do đó, phần nghiệm thu production sau đăng nhập admin chưa có bằng chứng hiện thời trong đợt bổ sung này. Cần một phiên admin hợp lệ hoặc credential đúng để kiểm tra trực tiếp các màn hình sau đăng nhập trên website thật: báo cáo cuối ngày, popup điểm danh, chương trình, Lịch Theo Tuyến và trạng thái redirect `/admin` khi đã xác thực. Không xác nhận xóa, điều chỉnh kho, bù trừ quỹ hoặc lưu trữ dữ liệu production trong bước kiểm tra này.

## Khôi phục

Nếu bản `01d1a5e21df7a4337930704c9a76cae2274af92b` lỗi nghiêm trọng, rollback ứng dụng trên Render về deploy đang hoạt động trước đó. Giữ nguyên database; phần bổ sung này không thêm migration mới và không yêu cầu chạy lại migration cũ.
