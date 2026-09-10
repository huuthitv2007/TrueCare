# TrueCare — không gian bán hàng cá nhân

Ứng dụng cho nhân viên theo dõi khách hàng, toa hàng, giao thực tế, tồn kho,
quỹ dư, khuyến mãi/suất chào và báo cáo cuối ngày. Dữ liệu của mỗi tài khoản
được tách riêng.

## Chạy cục bộ

Yêu cầu Node.js 24 trở lên.

```powershell
npm install
npm run dev
```

Mở `http://127.0.0.1:5173`, đăng ký tài khoản TrueCare mới, rồi chọn **Nhập
dữ liệu** để xem trước và nhập các tệp trong thư mục này. Bản cục bộ lưu SQLite
trong `.local-data/`; thư mục này đã được Git bỏ qua.

Các đơn nhập từ lịch sử được lưu là **nháp**. Chúng không tăng quỹ khả dụng cho
đến khi người dùng ghi nhận lần giao thực tế.

## Kiểm tra

```powershell
npm run typecheck
npm run test
npm run build
```

Các kiểm tra hiện bao gồm quy đổi thùng/lẻ, quỹ chỉ theo thực giao, giao nhiều
lần, trả hàng, thiếu giá vốn, giới hạn hỗ trợ 200.000đ mỗi suất, giữ quỹ/tồn,
trần giá chào, kiểm tra nhập Excel/TXT và báo cáo theo ngày giao/đặt.

## Triển khai dữ liệu thật

`supabase/migrations/` chứa nền tảng RLS và giao dịch có khóa chống gửi lặp.
Chỉ triển khai sau khi cấu hình Supabase và email xác thực; không đưa secret
key vào biến `VITE_*`. Chưa có kết nối ghi dữ liệu vào website HPT.
