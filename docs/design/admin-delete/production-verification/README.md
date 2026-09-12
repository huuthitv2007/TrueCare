# Nghiệm thu production thao tác Xóa admin

Ngày kiểm tra: 12/09/2026. Website: https://truecare-employee.onrender.com.

## Deploy

- Render service: `srv-dah9v7u1egvs73d75us0`.
- Deploy ID: `dep-daiksdmk1f9s738kgla0`.
- Application commit: `7b39e09a772a9e806b691fc134d8a8719d8f5806`.
- Điểm khôi phục trước deploy: `0cbf0b6`.
- Build command trên Render: `npm ci --include=dev && npm run build`.
- Start command trên Render: `npm run start:production`.
- Health check: `/api/health`.

Render Dashboard đã dùng **Manual Deploy -> Deploy latest commit**. Deploy chuyển trạng thái Live lúc 20:06:40 GMT+7. Cấu hình production, biến môi trường, domain và database được giữ nguyên.

## Kết quả

| Hạng mục | Kết quả |
| --- | --- |
| Health | 200, `mode=supabase`, `productionReady=true` |
| Bundle mới | `/assets/index-Csa7R7KC.js`, `/assets/index-C0vuaUuq.css`, `/assets/Admin-CbCDtlux.js` |
| Logo | SHA256 `800994985FCFBCDFA0B83D689BA591E5AEC45EEF4479C5ECAEA6B69396040026` |
| Font/KeenIcons/print assets | 9/9 tài nguyên trả 200 đúng MIME |
| Migration 013 | SQL trong source khớp lịch sử/schema production; không chạy lại migration |
| Quyền admin | 12 endpoint admin GET trả 200 với tài khoản admin |
| Ẩn danh/nhân viên | Ẩn danh bị chặn khỏi admin API; nhân viên bị chặn 5 nhóm bulk API mới |
| Dữ liệu nghiệp vụ | So sánh trước/sau khớp khi bỏ qua audit/version/session/theme |

## Kiểm thử trình duyệt

- Admin matrix: 462 lượt route/theme/viewport/engine đạt, gồm Chromium, Firefox và WebKit tại 360, 390, 768, 1023, 1024, 1440 và 1920px. Có kiểm tra không tràn ngang toàn trang, theme sáng/tối, hết loading, không crash, nút Xóa nhìn thấy khi cuộn trong bảng, không lỗi console/page/http.
- Employee workspace: 13 route nhân viên đạt trên Chromium, Firefox và WebKit ở 1440px; request ghi dữ liệu bị chặn trong harness.
- Tương tác admin: mở rồi hủy modal Xóa ở khách hàng, sản phẩm và nhật ký; kiểm tra lý do, focus, Escape, drawer mobile và bộ lọc lưu trữ ở quỹ, nhập dữ liệu, nhật ký.
- Theme và reload: đổi theme, tải lại trang và khôi phục theme ban đầu đạt trên cả ba engine.
- Phân trang: sản phẩm next/back đạt trên cả ba engine.
- Axe: vùng `#workspace-content` của trang khách hàng không có violation trong Chromium, Firefox và WebKit.

Không xác nhận xóa, bù trừ quỹ, điều chỉnh kho hoặc lưu trữ dữ liệu production. Các thao tác thay đổi dữ liệu vẫn được kiểm thử bằng fixture, PostgreSQL riêng và bộ kiểm thử nghiệp vụ trước deploy.

## Ảnh

Ảnh dưới đây đã che dữ liệu nhận diện, giữ lại layout, logo, cột Thao tác, nút Xóa và modal:

- [Sản phẩm mobile light](screenshots/products-390-light.png)
- [Sản phẩm mobile dark](screenshots/products-390-dark.png)
- [Sản phẩm desktop light](screenshots/products-1440-light.png)
- [Sản phẩm desktop dark](screenshots/products-1440-dark.png)
- [Modal Xóa mobile](screenshots/delete-modal-390.png)
- [Modal Xóa desktop](screenshots/delete-modal-1440.png)

## Khôi phục

Nếu bản ứng dụng lỗi nghiêm trọng, rollback trên Render về deploy trước commit `0cbf0b6`. Giữ nguyên database và migration 013; không chạy migration đảo ngược và không phục hồi đè dữ liệu mới. Sau rollback ứng dụng, xử lý lỗi bằng commit tiếp theo rồi deploy lại theo luồng thường.
