# Bảng đối chiếu chức năng HPT → website nhân viên TrueCare

Ngày lập: 10/09/2026. Tài liệu đi kèm `ke_hoach_website_truecare.md`, theo yêu cầu clone toàn bộ chức năng website tham khảo.

## Tiến độ triển khai 11/09/2026

- Đã triển khai danh mục sản phẩm/khách hàng dùng chung, metadata người tạo và
  giới hạn sửa khách 24 giờ; dữ liệu cũ không rõ nguồn được khóa sửa với nhân
  viên.
- Đã triển khai quyền backend: nhân viên không sửa sản phẩm, danh mục hoặc tồn
  kho, kể cả qua lệnh API và tệp nhập bảng giá.
- Đã triển khai sửa toa đã chốt có lý do/phiên bản, nhập lại thực giao, xoá mềm,
  hoàn kho, đảo KPI/quỹ và thùng tạm giữ để admin khôi phục/xoá hoàn toàn.
- KPI thực giao đã gồm hàng tặng TrueCare theo giá gốc. Báo cáo loại toa trong
  thùng tạm giữ, hỗ trợ nhóm nhiều cấp, mở toa từ chi tiết và xuất KPI/quỹ.
- Các hành vi HPT chưa quan sát trực tiếp vẫn giữ trạng thái “Chưa kiểm chứng”;
  không dùng kết quả build làm bằng chứng tương đương HPT.
- Đã triển khai commit `f459353` lên Render và migration danh mục dùng chung lên
  Supabase. Smoke test online xác nhận admin/nhân viên đúng quyền và client nhân
  viên bị chặn `403` khi gọi API quản trị.

## Bằng chứng HPT bổ sung 11/09/2026

- Đã đăng nhập lại tài khoản nhân viên và mở đủ các trang menu. Không lưu khách
  hàng mới, không đổi mật khẩu và không chạy lại khuyến mãi trên toa có sẵn.
- Đã tạo một toa thử có ghi chú nhận biết, thêm một sản phẩm với số lượng lẻ,
  lưu để nhận số chứng từ, sửa ghi chú, lưu lại rồi xoá chính toa thử. Sau xoá,
  biểu mẫu trở về trạng thái `New`; không còn dữ liệu thử cần dọn.
- Đã xác minh ba tab toa là **DS Khách hàng / Hóa đơn / Chi tiết**. Chọn khách
  chuyển sang Chi tiết; chọn SKU tự điền giá, tồn và quy cách. Chi tiết có số
  lượng thùng, số lượng lẻ, KM, giảm tiền, CK/tiền, tổng tiền, tiền CK, thanh
  toán và KM đơn hàng.
- Form khách hàng có tỉnh/thành, huyện phụ thuộc, loại cửa hiệu, tần số và T2–T7.
  Danh sách HPT hiển thị 8 huyện theo cách viết cũ; TrueCare tiếp tục dùng 8 tên
  vận hành đã được người dùng chốt. Loại cửa hiệu HPT có mã `VL` và `WSS`;
  TrueCare dùng nhãn đầy đủ do người dùng quy định.
- Checkbox kỹ thuật `cb_truck` trên doanh số thực giao có nhãn hiển thị
  **“trừ ck”**. Đây là tùy chọn trừ chiết khấu khỏi báo cáo thực giao, không phải
  lọc xe hoặc tuyến.

## Phạm vi và cách dùng

- Bao phủ toàn bộ chức năng của tài khoản nhân viên có quyền truy cập trên website tham khảo, cộng các phần TrueCare đã chốt. Không chỉ clone hình ảnh hoặc vài màn hình chính.
- Hệ thống TrueCare dùng dữ liệu, đăng nhập, backend và cơ sở dữ liệu riêng. Ngoài vòng đời của đúng toa thử được người dùng cho phép ngày 11/09/2026, website HPT chỉ được xem; không lưu khách, đổi mật khẩu hay tính lại dữ liệu trên toa có sẵn.
- Danh sách dưới đây là baseline từ đợt khảo sát đã thực hiện, không phải bằng chứng đã chạy thử tất cả chức năng HPT. Trước khi code từng phân hệ phải mở rộng kiểm kê nếu còn tab, bộ lọc, popup, trường hoặc trạng thái chưa liệt kê.
- Các tiêu chí TrueCare dưới đây là đặc tả phải triển khai. Khi hành vi HPT chưa được xác minh, tiêu chí được ghi là lựa chọn thiết kế TrueCare, không gán ngược thành hành vi đã biết của HPT.
- Mỗi mã phải có bằng chứng nguồn đã che thông tin riêng tư, vị trí trên TrueCare, test case, kết quả và chênh lệch còn lại. Không đánh dấu đạt khi mới có UI hoặc chỉ thấy tên nút.

Trạng thái bằng chứng: **Giao diện** = đã thấy màn hình/trường/điều khiển; **Chỉ đọc** = đã mở và đọc kết quả; **Đã thử toa riêng** = chỉ thao tác trên toa thử có dấu nhận biết và đã xoá; **Chưa kiểm chứng** = cần khảo sát tiếp hoặc kiểm thử trên môi trường thử được cho phép. Tiến độ TrueCare được ghi riêng phía trên và được nghiệm thu bằng test/source tương ứng.

## Ma trận chức năng bắt buộc

| Mã      | Chức năng nguồn và bằng chứng hiện có                                                                                                                 | Hành vi TrueCare và tiêu chí nghiệm thu                                                                                                                                                                   |
| ------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| AUTH-01 | Đăng nhập mã công ty / tên đăng nhập / mật khẩu — đã đăng nhập để khảo sát                                                                            | Đăng nhập TrueCare với cùng nhóm trường; mã TRUECARE mặc định; kiểm tra hợp lệ, lỗi chung, phiên hết hạn; mọi nhân viên vẫn có dữ liệu riêng                                                              |
| AUTH-02 | Liên kết Đăng ký — Giao diện, form con chưa kiểm chứng                                                                                                | TrueCare chủ động không sao chép đăng ký công khai: endpoint trả `403`, chỉ admin được tạo tài khoản, đúng quy tắc quản trị đã chốt                                                                       |
| AUTH-03 | Quên mật khẩu — Giao diện, luồng gửi chưa kiểm chứng                                                                                                  | Gửi liên kết đặt lại có hạn qua email của chính tài khoản; không tiết lộ tài khoản có tồn tại; không thử gửi yêu cầu trên HPT                                                                             |
| AUTH-04 | Đổi mật khẩu: cũ/mới/xác nhận — Giao diện                                                                                                             | Xác thực lại, báo sai/mật khẩu không khớp, cập nhật đúng, thu hồi phiên theo cấu hình; thử bằng tài khoản giả TrueCare                                                                                    |
| AUTH-05 | Đăng xuất — Giao diện                                                                                                                                 | Thu hồi phiên và xóa cache riêng tư; quay lại bằng nút back không hiển thị dữ liệu người trước                                                                                                            |
| NAV-01  | Menu và tên nhân viên — Chỉ đọc                                                                                                                       | Đủ lối tới nhập đơn, khách hàng, hai doanh số, tồn kho, mật khẩu/đăng xuất; thêm phần TrueCare mà không làm mất chức năng nguồn                                                                           |
| NAV-02  | Top, Dark, Light — Giao diện                                                                                                                          | Về đầu trang; chuyển sáng/tối, lưu lựa chọn profile và hiển thị đầy đủ trên mobile/desktop                                                                                                                |
| CUS-01  | Danh sách khách trong màn hình nhập đơn; Trong tuyến / Tất cả — Chỉ đọc                                                                               | Chuyển phạm vi danh sách, tìm không dấu, phân trang và chọn đúng khách dùng chung; nhân viên không truy cập toa/quỹ của người khác                                                                        |
| CUS-02  | Tìm khách trong biểu mẫu — Giao diện                                                                                                                  | Tìm theo tên/mã/điện thoại, xử lý không có kết quả; chọn khách điền đúng thông tin tham chiếu, không tự tạo khách trùng                                                                                   |
| CUS-03  | Tạo khách: tên cửa hàng, chủ, địa chỉ/đường/phường-xã, tỉnh/huyện, điện thoại/email, loại cửa hiệu — đã mở form, kiểm tra danh sách chọn và không lưu | Đủ các trường tương đương; huyện, loại cửa hiệu và lịch ghé là danh sách dùng chung do admin quản lý; nhân viên tạo khách có metadata máy chủ và chỉ sửa trong 24 giờ                                     |
| CUS-04  | Tần suất ghé và chọn thứ T2–T7 — Giao diện                                                                                                            | Lưu được mã tần suất và lịch thứ độc lập. Các mã chưa rõ như 1.1/1.2 không bị tự diễn giải sai; xác minh mô tả nguồn trước khi chuyển mã thành chu kỳ tự động                                             |
| CUS-05  | Biểu tượng chỉnh khách trong danh sách — Giao diện, hành vi lưu chưa kiểm chứng                                                                       | Xem/sửa hồ sơ trong TrueCare, cảnh báo thay đổi chưa lưu, nhật ký trước/sau và giữ lịch sử đơn khi sửa tên/địa chỉ                                                                                        |
| ORD-01  | Ba phần DS khách hàng / Hóa đơn / Chi tiết — Giao diện                                                                                                | Có đủ ba tab, dữ liệu xuyên suốt, chuyển tab không mất nháp; vào lại đơn mở đúng khách và chi tiết                                                                                                        |
| ORD-02  | Điều khiển tạo mới / lưu — Đã thử toa riêng: lưu cấp số chứng từ, sửa và lưu lại giữ nguyên số                                                        | TrueCare tạo/lưu nháp/chốt theo trạng thái, có khóa chống gửi lặp, báo rõ thành công/lỗi và không tự tạo đơn khi chỉ mở màn hình                                                                          |
| ORD-03  | Điều khiển tìm toa, số chứng từ — Giao diện                                                                                                           | Tìm mã/toa theo khách/ngày, mở đầy đủ dòng hàng/quà/ghi chú; phân biệt toa chưa giao và phiếu đã giao                                                                                                     |
| ORD-04  | Xóa toa và hộp xác nhận — Đã xác nhận trên đúng toa thử rồi dọn sạch                                                                                  | TrueCare xoá mềm toa và đảo tác động KPI/quỹ/kho đúng một lần; admin khôi phục hoặc xoá hẳn từ thùng tạm giữ, mọi thao tác có lý do và lịch sử                                                            |
| ORD-05  | Giá thùng và cố định giá — Giao diện, ý nghĩa thuật toán nguồn chưa kiểm chứng                                                                        | Chuyển đơn vị giá thùng/lẻ không đổi tổng; cố định giá giữ giá đã chọn khi đổi số lượng/tính lại khuyến mãi. Đây là quy tắc TrueCare dự kiến; ghi nhận khác biệt nếu khảo sát nguồn cho thấy hành vi khác |
| ORD-06  | Ghi chú toa — Giao diện                                                                                                                               | Lưu, xem, sửa ghi chú; định dạng văn bản an toàn, có/không đưa lên bản in theo cấu hình                                                                                                                   |
| ORD-07  | Chi tiết hàng — đã xác minh tìm/chọn SKU, tự điền giá/tồn/quy cách, số lượng thùng/lẻ, KM, giảm tiền, CK và các tổng; đã thêm một dòng vào toa thử    | TrueCare thêm/sửa/bỏ SKU, hương, số lượng thùng/lẻ, đơn giá, quà/giảm giá, tính lại tổng và giữ snapshot giá gốc                                                                                          |
| ORD-08  | Điều khiển tính lại khuyến mãi — Giao diện, thuật toán chưa kiểm chứng                                                                                | Xem trước chênh lệch, áp dụng thay phiên bản cũ, không nhân đôi quà, giữ giá cố định, kiểm tra đủ quỹ. Không chạy lại khuyến mãi trên toa thật HPT để dò thuật toán                                       |
| RPT-01  | Doanh số khách đặt: tổng lượng/tiền, từng ngày — Chỉ đọc                                                                                              | Màn riêng theo ngày đặt; tổng nhóm và tổng toàn bộ bằng dữ liệu đơn hợp lệ; không cộng thêm phiếu giao thành đơn mới                                                                                      |
| RPT-02  | Từ ngày / đến ngày, chọn ngày, Áp dụng / Thoát — Giao diện                                                                                            | Bao gồm trọn ngày đầu/cuối theo giờ Việt Nam; áp dụng cập nhật kết quả; thoát bỏ thay đổi bộ lọc chưa áp dụng                                                                                             |
| RPT-03  | Tùy biến chưa chọn / đã chọn; ngành hàng, nhãn hiệu, nhóm SP, tên SP, khách, tỉnh, địa chỉ, lệch giá — Giao diện                                      | Có đầy đủ chiều nhóm tương đương, chọn/hủy và thứ tự lên/xuống; phân biệt nhóm với lọc; kết quả không đổi tổng khi chỉ đổi cách nhóm                                                                      |
| RPT-04  | Các giá trị doanh số dạng liên kết — Giao diện, đích/drill-down chưa kiểm kê hết                                                                      | Truy từ tổng đến danh sách toa/dòng hàng; quay lại giữ bộ lọc. Khảo sát các cấp liên kết chỉ đọc của nguồn và bổ sung cấp còn thiếu trước nghiệm thu                                                      |
| DEL-01  | Doanh số thực giao và khoảng ngày riêng — Chỉ đọc                                                                                                     | Màn riêng theo ngày giao thực tế, hỗ trợ một đơn giao nhiều lần; cộng đúng lượng và tiền sau giảm giá của phần đã giao                                                                                    |
| DEL-02  | Checkbox kỹ thuật `cb_truck` — đã xác minh nhãn hiển thị “trừ ck”                                                                                     | TrueCare báo cáo thực giao cho phép bật/tắt việc trừ chiết khấu khỏi giá trị hiển thị mà không thay đổi chứng từ, KPI theo giá gốc hoặc sổ quỹ                                                            |
| INV-01  | Giá thùng, giá lẻ, tồn thùng, tồn lẻ theo sản phẩm — Chỉ đọc                                                                                          | Màn tồn kho bắt buộc; giá/đơn vị và quy đổi đúng theo SKU/biến thể; phân biệt chưa có dữ liệu, hết hàng, còn hàng                                                                                         |
| INV-02  | Danh sách tồn và các trạng thái/điều khiển con — đã đọc danh sách, chưa xác nhận mọi điều khiển                                                       | Khảo sát bổ sung phần tìm/lọc/làm mới/phân trang nếu nguồn có; TrueCare có tìm/lọc và ngày cập nhật, không hiển thị snapshot nhập tay như dữ liệu HPT thời gian thực                                      |
| UX-01   | Các form có trạng thái tải/thoát; trạng thái lỗi/phiên hết hạn chưa thử đầy đủ                                                                        | Triển khai loading, rỗng, lỗi mạng, hết phiên, dữ liệu không hợp lệ; không tải vô hạn hoặc mất nháp; thử lỗi chỉ trên ứng dụng mới                                                                        |

## Chức năng TrueCare bổ sung, vẫn bắt buộc

- Quỹ chỉ từ thực giao; xem trước/sau tặng, chiết khấu, trưng bày và đổi trả.
- Random cả suất nhiều sản phẩm lẫn khuyến mãi đơn phẩm; trần giá từng mặt hàng theo bảng chào; hỗ trợ tối đa 200.000đ **mỗi suất**, giữ đủ tổng ngân sách khi có nhiều suất.
- Profile độc lập, KPI, báo cáo cuối ngày theo mẫu, lịch tuyến, nhập Excel/TXT, đối chiếu số gốc/tính lại và xuất toa không lộ giá vốn.
- Phiếu giao từng phần, sổ quỹ bất biến, giữ hàng/tồn kho riêng của nhân viên. Các khả năng hỗ trợ nhập/điều chỉnh tồn trong TrueCare là thiết kế phục vụ module clone, không phải tuyên bố website nguồn có cùng màn quản trị kho.

## Quy trình kiểm kê và nghiệm thu clone

1. Đọc checklist trước khi khảo sát. Mở các đường dẫn/menu đã biết, tab và popup chỉ đọc; ghi nhãn trường, giá trị lựa chọn, trạng thái và kết quả hiển thị cần tái tạo.
2. Sau vòng đời toa thử đã được cho phép và dọn sạch ngày 11/09/2026, không tiếp tục dùng “Tạo mới”, “Lưu”, “Xóa”, “Đồng ý”, “Tính lại khuyến mãi”, sửa khách hoặc đổi mật khẩu trên nguồn nếu chưa có chỉ dẫn mới. Không quét endpoint hoặc đoán chức năng ngoài quyền được cung cấp.
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

Nguồn: website tham khảo http://seller.hptbs.com/Default.aspx, quan sát ngày 10/09/2026 và vòng khảo sát/toa thử đã dọn ngày 11/09/2026. TrueCare đã được xây dựng, kiểm thử và triển khai; các mục còn ghi “Chưa kiểm chứng” không được xem là tương đương HPT chỉ vì ứng dụng đã online.
