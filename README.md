# TrueCare — không gian bán hàng cá nhân

Ứng dụng cho nhân viên theo dõi khách hàng, toa hàng, giao thực tế, tồn kho,
quỹ dư, khuyến mãi/suất chào và báo cáo cuối ngày. Toa, giao hàng, quỹ và báo
cáo tách theo tài khoản; khách hàng, sản phẩm và danh mục lựa chọn dùng chung
toàn đội.

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

Các kiểm tra hiện bao gồm quy đổi thùng/lẻ, KPI và quỹ theo thực giao, quà
TrueCare tính KPI theo giá gốc, giao nhiều lần, trả hàng, sửa/xoá/khôi phục toa,
hoàn kho không lặp, giới hạn hỗ trợ 200.000đ mỗi suất, trần giá chào, nhập
Excel/TXT, phân quyền và báo cáo theo ngày giao/đặt.

## Triển khai dữ liệu thật

`supabase/migrations/` chứa RLS, giao dịch có khóa chống gửi lặp và migration
danh mục dùng chung. Migration `202609110003_shared_directory.sql` giữ nguyên
mọi ID cũ, không tự gộp sản phẩm/khách trùng tên và đánh dấu sản phẩm cũ để
admin đối chiếu. Sao lưu `employee_states` trước khi áp dụng; không đưa secret
key vào biến `VITE_*`. Ứng dụng không ghi dữ liệu vào website HPT.
