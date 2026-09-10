# Bảng đối chiếu chức năng HPT → website nhân viên TrueCare

Ngày lập: 10/09/2026. Tài liệu đi kèm `ke_hoach_website_truecare.md`, theo yêu cầu clone toàn bộ chức năng website tham khảo.

## Phạm vi và cách dùng

- Bao phủ toàn bộ chức năng của tài khoản nhân viên có quyền truy cập trên website tham khảo, cộng các phần TrueCare đã chốt. Không chỉ clone hình ảnh hoặc vài màn hình chính.
- Hệ thống TrueCare dùng dữ liệu, đăng nhập, backend và cơ sở dữ liệu riêng. Website HPT tiếp tục chỉ được xem; không thử nhập/lưu/xóa toa, sửa khách, đổi mật khẩu hay tính lại dữ liệu trên đó.
- Danh sách dưới đây là baseline từ đợt khảo sát đã thực hiện, không phải bằng chứng đã chạy thử tất cả chức năng HPT. Trước khi code từng phân hệ phải mở rộng kiểm kê nếu còn tab, bộ lọc, popup, trường hoặc trạng thái chưa liệt kê.
- Các tiêu chí TrueCare dưới đây là đặc tả phải triển khai. Khi hành vi HPT chưa được xác minh, tiêu chí được ghi là lựa chọn thiết kế TrueCare, không gán ngược thành hành vi đã biết của HPT.
- Mỗi mã phải có bằng chứng nguồn đã che thông tin riêng tư, vị trí trên TrueCare, test case, kết quả và chênh lệch còn lại. Không đánh dấu đạt khi mới có UI hoặc chỉ thấy tên nút.

Trạng thái bằng chứng: **Giao diện** = đã thấy màn hình/trường/điều khiển; **Chỉ đọc** = đã mở và đọc kết quả; **Chưa kiểm chứng** = cần khảo sát tiếp hoặc kiểm thử trên môi trường thử được cho phép. Hiện chưa có mã ứng dụng nên mọi mục đều chưa triển khai.

## Ma trận chức năng bắt buộc

| Mã | Chức năng nguồn và bằng chứng hiện có | Hành vi TrueCare và tiêu chí nghiệm thu |
|---|---|---|
| AUTH-01 | Đăng nhập mã công ty / tên đăng nhập / mật khẩu — đã đăng nhập để khảo sát | Đăng nhập TrueCare với cùng nhóm trường; mã TRUECARE mặc định; kiểm tra hợp lệ, lỗi chung, phiên hết hạn; mọi nhân viên vẫn có dữ liệu riêng |
| AUTH-02 | Liên kết Đăng ký — Giao diện, form con chưa kiểm chứng | Đăng ký tên đăng nhập/email/mật khẩu, xác minh email, chống trùng; khảo sát form nguồn bổ sung trước khi xác nhận tương đương |
| AUTH-03 | Quên mật khẩu — Giao diện, luồng gửi chưa kiểm chứng | Gửi liên kết đặt lại có hạn qua email của chính tài khoản; không tiết lộ tài khoản có tồn tại; không thử gửi yêu cầu trên HPT |
| AUTH-04 | Đổi mật khẩu: cũ/mới/xác nhận — Giao diện | Xác thực lại, báo sai/mật khẩu không khớp, cập nhật đúng, thu hồi phiên theo cấu hình; thử bằng tài khoản giả TrueCare |
| AUTH-05 | Đăng xuất — Giao diện | Thu hồi phiên và xóa cache riêng tư; quay lại bằng nút back không hiển thị dữ liệu người trước |
| NAV-01 | Menu và tên nhân viên — Chỉ đọc | Đủ lối tới nhập đơn, khách hàng, hai doanh số, tồn kho, mật khẩu/đăng xuất; thêm phần TrueCare mà không làm mất chức năng nguồn |
| NAV-02 | Top, Dark, Light — Giao diện | Về đầu trang; chuyển sáng/tối, lưu lựa chọn profile và hiển thị đầy đủ trên mobile/desktop |
| CUS-01 | Danh sách khách trong màn hình nhập đơn; Trong tuyến / Tất cả — Chỉ đọc | Chuyển phạm vi danh sách, tìm không dấu, phân trang, chọn đúng khách cho đơn; không truy cập khách của tài khoản khác |
| CUS-02 | Tìm khách trong biểu mẫu — Giao diện | Tìm theo tên/mã/điện thoại, xử lý không có kết quả; chọn khách điền đúng thông tin tham chiếu, không tự tạo khách trùng |
| CUS-03 | Tạo khách: tên cửa hàng, chủ, địa chỉ/đường/phường-xã, tỉnh/huyện, điện thoại/email, loại cửa hiệu — Giao diện | Đủ các trường tương đương; tỉnh/huyện phụ thuộc đúng; kiểm tra trường bắt buộc và lưu dữ liệu trong TrueCare |
| CUS-04 | Tần suất ghé và chọn thứ T2–T7 — Giao diện | Lưu được mã tần suất và lịch thứ độc lập. Các mã chưa rõ như 1.1/1.2 không bị tự diễn giải sai; xác minh mô tả nguồn trước khi chuyển mã thành chu kỳ tự động |
| CUS-05 | Biểu tượng chỉnh khách trong danh sách — Giao diện, hành vi lưu chưa kiểm chứng | Xem/sửa hồ sơ trong TrueCare, cảnh báo thay đổi chưa lưu, nhật ký trước/sau và giữ lịch sử đơn khi sửa tên/địa chỉ |
| ORD-01 | Ba phần DS khách hàng / Hóa đơn / Chi tiết — Giao diện | Có đủ ba tab, dữ liệu xuyên suốt, chuyển tab không mất nháp; vào lại đơn mở đúng khách và chi tiết |
| ORD-02 | Điều khiển tạo mới / lưu — Giao diện, hành vi ghi chưa kiểm chứng | Tạo đơn mới, lưu nháp/sửa và chốt theo trạng thái; khóa chống gửi lặp; báo rõ thành công/lỗi, không tự tạo đơn khi chỉ mở màn hình |
| ORD-03 | Điều khiển tìm toa, số chứng từ — Giao diện | Tìm mã/toa theo khách/ngày, mở đầy đủ dòng hàng/quà/ghi chú; phân biệt toa chưa giao và phiếu đã giao |
| ORD-04 | Xóa toa và hộp xác nhận — Giao diện, chưa gửi xác nhận | Xóa nháp chưa tham chiếu hoặc hủy nghiệp vụ có lịch sử; hủy xác nhận không đổi dữ liệu; không xóa phần thực giao/quỹ/kho |
| ORD-05 | Giá thùng và cố định giá — Giao diện, ý nghĩa thuật toán nguồn chưa kiểm chứng | Chuyển đơn vị giá thùng/lẻ không đổi tổng; cố định giá giữ giá đã chọn khi đổi số lượng/tính lại khuyến mãi. Đây là quy tắc TrueCare dự kiến; ghi nhận khác biệt nếu khảo sát nguồn cho thấy hành vi khác |
| ORD-06 | Ghi chú toa — Giao diện | Lưu, xem, sửa ghi chú; định dạng văn bản an toàn, có/không đưa lên bản in theo cấu hình |
| ORD-07 | Chi tiết hàng và các thao tác con — mới thấy tab, chưa kiểm kê hết | Khảo sát tiếp các trường/nút chỉ đọc; TrueCare phải thêm/sửa/bỏ SKU, hương, số lượng thùng/lẻ, đơn giá, quà/giảm giá và tính lại tổng, giữ snapshot giá gốc |
| ORD-08 | Điều khiển tính lại khuyến mãi — Giao diện, thuật toán chưa kiểm chứng | Xem trước chênh lệch, áp dụng thay phiên bản cũ, không nhân đôi quà, giữ giá cố định, kiểm tra đủ quỹ. Không chạy lại khuyến mãi trên toa thật HPT để dò thuật toán |
| RPT-01 | Doanh số khách đặt: tổng lượng/tiền, từng ngày — Chỉ đọc | Màn riêng theo ngày đặt; tổng nhóm và tổng toàn bộ bằng dữ liệu đơn hợp lệ; không cộng thêm phiếu giao thành đơn mới |
| RPT-02 | Từ ngày / đến ngày, chọn ngày, Áp dụng / Thoát — Giao diện | Bao gồm trọn ngày đầu/cuối theo giờ Việt Nam; áp dụng cập nhật kết quả; thoát bỏ thay đổi bộ lọc chưa áp dụng |
| RPT-03 | Tùy biến chưa chọn / đã chọn; ngành hàng, nhãn hiệu, nhóm SP, tên SP, khách, tỉnh, địa chỉ, lệch giá — Giao diện | Có đầy đủ chiều nhóm tương đương, chọn/hủy và thứ tự lên/xuống; phân biệt nhóm với lọc; kết quả không đổi tổng khi chỉ đổi cách nhóm |
| RPT-04 | Các giá trị doanh số dạng liên kết — Giao diện, đích/drill-down chưa kiểm kê hết | Truy từ tổng đến danh sách toa/dòng hàng; quay lại giữ bộ lọc. Khảo sát các cấp liên kết chỉ đọc của nguồn và bổ sung cấp còn thiếu trước nghiệm thu |
| DEL-01 | Doanh số thực giao và khoảng ngày riêng — Chỉ đọc | Màn riêng theo ngày giao thực tế, hỗ trợ một đơn giao nhiều lần; cộng đúng lượng và tiền sau giảm giá của phần đã giao |
| DEL-02 | Điều khiển/tùy biến bổ sung trong form thực giao, có checkbox kỹ thuật `cb_truck` — thấy cấu trúc, nhãn/ý nghĩa chưa kiểm chứng | Ghi mục cần khảo sát tiếp; không tự gọi đó là lọc xe/tuyến khi chưa có nhãn hoặc bằng chứng. Sau xác minh phải có chức năng tương đương và test riêng, không bỏ qua vì chưa rõ |
| INV-01 | Giá thùng, giá lẻ, tồn thùng, tồn lẻ theo sản phẩm — Chỉ đọc | Màn tồn kho bắt buộc; giá/đơn vị và quy đổi đúng theo SKU/biến thể; phân biệt chưa có dữ liệu, hết hàng, còn hàng |
| INV-02 | Danh sách tồn và các trạng thái/điều khiển con — đã đọc danh sách, chưa xác nhận mọi điều khiển | Khảo sát bổ sung phần tìm/lọc/làm mới/phân trang nếu nguồn có; TrueCare có tìm/lọc và ngày cập nhật, không hiển thị snapshot nhập tay như dữ liệu HPT thời gian thực |
| UX-01 | Các form có trạng thái tải/thoát; trạng thái lỗi/phiên hết hạn chưa thử đầy đủ | Triển khai loading, rỗng, lỗi mạng, hết phiên, dữ liệu không hợp lệ; không tải vô hạn hoặc mất nháp; thử lỗi chỉ trên ứng dụng mới |

## Chức năng TrueCare bổ sung, vẫn bắt buộc

- Quỹ chỉ từ thực giao; xem trước/sau tặng, chiết khấu, trưng bày và đổi trả.
- Random cả suất nhiều sản phẩm lẫn khuyến mãi đơn phẩm; trần giá từng mặt hàng theo bảng chào; hỗ trợ tối đa 200.000đ **mỗi suất**, giữ đủ tổng ngân sách khi có nhiều suất.
- Profile độc lập, KPI, báo cáo cuối ngày theo mẫu, lịch tuyến, nhập Excel/TXT, đối chiếu số gốc/tính lại và xuất toa không lộ giá vốn.
- Phiếu giao từng phần, sổ quỹ bất biến, giữ hàng/tồn kho riêng của nhân viên. Các khả năng hỗ trợ nhập/điều chỉnh tồn trong TrueCare là thiết kế phục vụ module clone, không phải tuyên bố website nguồn có cùng màn quản trị kho.

## Quy trình kiểm kê và nghiệm thu clone

1. Đọc checklist trước khi khảo sát. Mở các đường dẫn/menu đã biết, tab và popup chỉ đọc; ghi nhãn trường, giá trị lựa chọn, trạng thái và kết quả hiển thị cần tái tạo.
2. Không dùng “Tạo mới”, “Lưu”, “Xóa”, “Đồng ý”, “Tính lại khuyến mãi”, sửa khách hoặc đổi mật khẩu trên nguồn để kiểm thử. Không quét endpoint hoặc đoán chức năng ngoài quyền được cung cấp.
3. Nếu tab chỉ có dữ liệu khi chọn khách/đơn và hành động chọn có thể gây ghi dữ liệu, chỉ đọc cấu trúc hoặc dùng mô tả/bằng chứng do người dùng cung cấp; không tự vượt giới hạn chỉ đọc.
4. Gắn mỗi mã với route và thành phần TrueCare, đầu vào/đầu ra, lỗi, kiểm soát quyền và kịch bản test. Các phần chưa rõ được giữ là mục bắt buộc cần xác minh, không được hạ xuống “không làm”.
5. Thiết kế giữ tương đương luồng, trường, tùy biến và kết quả; chỉnh nhận diện TrueCare và bố cục responsive. Không yêu cầu bê nguyên mã ASP.NET hoặc các lỗi hiển thị của nguồn.
6. Kiểm thử thao tác tạo/sửa/hủy và các trạng thái lỗi trên database thử TrueCare bằng dữ liệu giả; kiểm tra cả mobile/desktop, sáng/tối và tài khoản thứ hai.
7. Chỉ nghiệm thu “clone đầy đủ” khi không còn mã bắt buộc thiếu chức năng, test không đạt hoặc hành vi chưa xác minh. Báo cáo bàn giao phải nêu rõ phạm vi tài khoản đã đối chiếu và các khác biệt được người dùng chấp nhận.

## Các đường dẫn đã quan sát để khảo sát lại

Chỉ ghi đường dẫn trang, không kèm thông tin đăng nhập, query chứa phiên hoặc danh sách khách:

- `/Default.aspx` — đăng nhập, liên kết đăng ký/quên mật khẩu.
- `/Registry.aspx` — liên kết đăng ký đã thấy, chưa khảo sát biểu mẫu.
- `/DSRDashboard.aspx` — menu nhân viên.
- `/DSROrderBycase.aspx` — nhập đơn, danh sách khách, hóa đơn, chi tiết.
- `/DSRCreateCustomer.aspx` — tạo khách.
- `/DSRDailyOrder.aspx` — doanh số bán hàng.
- `/DSRSaleOut.aspx` — doanh số thực giao.
- `/DSRInventory.aspx` — tồn kho.
- `/DSRChangePassword.aspx` — đổi mật khẩu.

Nguồn: website tham khảo http://seller.hptbs.com/Default.aspx và quan sát đã thực hiện ngày 10/09/2026. Bảng này ghi phạm vi kế hoạch; chưa có ứng dụng clone được xây dựng hoặc kiểm thử.
