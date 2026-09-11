# Đối chiếu và nhập danh mục sản phẩm TrueCare

Ngày thực hiện: 11/09/2026

## Phạm vi và nguồn dữ liệu

- Mã sản phẩm, tên sản phẩm và quy cách đóng thùng được đối chiếu từ danh mục đang kinh doanh trên HPT.
- Giá gốc chỉ lấy từ `bang_gia_goc_san_pham_thang_9.xlsx`, có hiệu lực từ ngày 07/09/2026.
- Không sử dụng giá hiển thị trên HPT và không sử dụng bảng giá chào hàng làm giá gốc hoặc giá chào.
- Mỗi màu hoặc mùi hương giữ thành một mã HPT riêng.
- Loại khỏi đợt nhập các mã quà tặng, rổ, thau, bộ chén và các mã HPT đã ghi hết hàng.

## Kết quả nhập

| Nội dung | Kết quả |
| --- | ---: |
| Mã HPT đã khảo sát | 71 |
| Sản phẩm đang kinh doanh được nhập | 66 |
| Sản phẩm khớp giá gốc tháng 9 | 65 |
| Sản phẩm chờ bổ sung giá gốc | 1 |
| Sản phẩm được gán giá chào | 0 |

Mã `10648` — **NRC750 Muối Khoáng 750ml (hồng) c5**, quy cách 24 chai/thùng — không có dòng tương ứng trong bảng giá gốc tháng 9. Sản phẩm vẫn được đưa vào danh mục để giữ đúng mã HPT, nhưng giá gốc và giá chào để trống. Hệ thống phải yêu cầu bổ sung giá gốc trước khi chốt toa có sản phẩm này.

## Mẫu đối chiếu nghiệm thu

| Mã | Tên theo HPT | Quy cách | Giá gốc tháng 9 |
| --- | --- | ---: | ---: |
| 10621 | LK Lau kính Truecare Sắc biển 580ml c5 | 24 | 18.698đ |
| 10622 | BG Bột giặt nhiệt 2.9kg MR Care C10 | 4 | 121.867đ |
| 10674 | Dây NXV Elizabeth 20ml (tím) c5 | 40 | 12.134đ |
| 10682 | Chai NGX 2.4Kg 5in1 Gold Silk (vàng) c5 | 6 | 97.385đ |
| 10690 | Túi Maxx 3.3kg Matic đậm đặc (trắng đỏ) c10 | 4 | 104.565đ |
| 10648 | NRC750 Muối Khoáng 750ml (hồng) c5 | 24 | Chờ bổ sung |

## Kiểm tra sau nhập

- API quản trị trả về đủ 66 sản phẩm và tất cả đều ở trạng thái đang kinh doanh.
- Tài khoản nhân viên nhận đủ cùng 66 sản phẩm từ danh mục dùng chung.
- Tài khoản nhân viên bị từ chối khi gọi API quản trị sản phẩm.
- Không có mã bị thiếu sau khi so sánh lại với danh sách nhập.
- Cả 66 sản phẩm đều để trống giá chào theo quy tắc đã chốt.

## Sửa lỗi lưu dữ liệu

Supabase bật kiểm tra cập nhật an toàn nên từ chối hai lệnh làm mới toàn bảng trong các hàm đồng bộ danh mục và kho. Migration `202609110007_safe_directory_sync.sql` giữ cơ chế bảo vệ này và đổi hai lệnh sang dạng có điều kiện tường minh. Sau khi áp dụng migration, thao tác lưu danh mục qua API hoạt động bình thường.
