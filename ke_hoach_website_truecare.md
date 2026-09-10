# Kế hoạch website TrueCare cho nhân viên bán hàng

Ngày khảo sát ban đầu: 10/09/2026; cập nhật triển khai và khảo sát bổ sung: 11/09/2026. Ứng dụng đã được xây dựng trên Render + Supabase; tài liệu này giữ vai trò đặc tả và checklist cho các hành vi HPT còn cần đối chiếu.

## 1. Mục tiêu và các quyết định đã chốt

- Mỗi nhân viên có tài khoản và vùng dữ liệu độc lập. Không có màn hình quản lý đội hoặc quyền xem chéo giữa nhân viên trong phiên bản đầu.
- Theo dõi riêng doanh số khách đặt, doanh số thực giao, tiền đã thu và quỹ dư. Quỹ được phép sử dụng chỉ phát sinh từ hàng đã giao.
- Hỗ trợ tạo suất gồm nhiều sản phẩm và chương trình khuyến mãi cho một sản phẩm; hỗ trợ khách lấy nhiều suất với các mức giá sỉ.
- Ưu tiên lấy lãi sản phẩm này bù sản phẩm khác trong cùng suất. Giá chào từng sản phẩm không được vượt bảng giá chào đang áp dụng.
- Có thể hỗ trợ thêm bằng quỹ dư đã có, nhưng mức sử dụng quỹ cũ không vượt **200.000đ cho mỗi suất riêng lẻ**, theo xác nhận cuối của người dùng. Tổng hỗ trợ của tất cả suất/chương trình đã cam kết không được làm âm quỹ khả dụng. Đây không phải hạn mức mỗi ngày hoặc mỗi chương trình.
- Clone đầy đủ các chức năng, trường nhập, bộ lọc và luồng thao tác mà tài khoản nhân viên có thể sử dụng trên website HPT; đây là phạm vi bắt buộc, cộng thêm các chức năng riêng TrueCare đã chốt. Bảng đối chiếu chi tiết nằm trong `doi_chieu_chuc_nang_hpt_truecare.md` và là checklist nghiệm thu.
- Clone chạy trên dữ liệu và tài khoản TrueCare độc lập. Không tích hợp ghi đơn, sửa khách hàng, tự đồng bộ hoặc lưu tài khoản đăng nhập HPT vào hệ thống mới. Giới hạn chỉ đọc trên website nguồn vẫn áp dụng trong mọi lần khảo sát tiếp theo.
- “Toàn bộ chức năng” ở đây là chức năng của website nhân viên có thể truy cập bằng quyền được cung cấp, không mặc nhiên bao gồm phân hệ quản trị công ty hoặc chức năng bị ẩn bởi quyền chưa được cấp. Không kết luận đã khảo sát hết nghiệp vụ phía server chỉ từ tên nút.
- Giao diện tiếng Việt, tiền VNĐ, ngày hiển thị dd/mm/yyyy, múi giờ Asia/Ho_Chi_Minh. Ưu tiên thao tác trên điện thoại nhưng đầy đủ bảng dữ liệu trên máy tính.

## 2. Căn cứ khảo sát và dữ liệu đầu vào

### Website tham khảo

Đã đăng nhập và xem các màn hình sau bằng Firecrawl và Playwright; không gửi thao tác lưu, tạo, sửa hoặc xóa dữ liệu nghiệp vụ.

| Màn hình           | Chức năng thực tế đã quan sát                                                                                                                                       | Cách đưa vào hệ thống mới                                                                                                 |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| Đăng nhập          | Mã công ty, tên đăng nhập, mật khẩu; liên kết đăng ký và quên mật khẩu                                                                                              | Đầy đủ luồng tài khoản trên TrueCare; không sử dụng thông tin đăng nhập HPT                                               |
| Menu               | Nhập đơn hàng, tạo khách hàng, doanh số bán hàng, doanh số thực giao, tồn kho, đổi mật khẩu, đăng xuất; Top, Dark/Light                                             | Đủ lối truy cập tương đương; lưu giao diện sáng/tối và có về đầu trang                                                    |
| Nhập đơn hàng      | DS khách hàng / Hóa đơn / Chi tiết; trong tuyến hoặc tất cả; tìm khách; nút tạo/lưu/tìm/xóa/tính lại khuyến mãi; giá thùng; cố định giá; ghi chú                    | Giữ đủ ba phần và các thao tác, có cảnh báo mất nháp, kiểm tra quỹ và xác nhận hủy                                        |
| Doanh số bán hàng  | Khoảng ngày; tổng số lượng và tiền; nhóm theo ngày; chọn/hủy và sắp xếp tùy biến theo ngành hàng, nhãn hiệu, nhóm/tên sản phẩm, khách hàng, tỉnh, địa chỉ, lệch giá | Bộ lọc và trình chọn thứ tự nhóm đầy đủ, truy ngược về toa/dòng hàng                                                      |
| Doanh số thực giao | Màn hình, khoảng ngày và tổng riêng; có tùy chọn bổ sung trên biểu mẫu cần xác minh ý nghĩa                                                                         | Đủ báo cáo thực giao, cùng bộ tùy biến liên quan; tùy chọn chưa rõ phải được khảo sát và ghi vào checklist                |
| Khách hàng         | Tên cửa hàng/chủ cửa hàng, địa chỉ/đường/phường-xã/tỉnh/huyện, điện thoại, email, loại cửa hiệu, tần suất ghé, thứ đi tuyến                                         | Đủ danh sách, tạo, xem, sửa trong hệ thống mới và các trường tương ứng                                                    |
| Tồn kho            | Giá thùng/lẻ và tồn thùng/lẻ                                                                                                                                        | Phân hệ bắt buộc có màn hình đầy đủ, tìm/lọc, dữ liệu tồn theo SKU/biến thể và nguồn/ngày cập nhật; không gọi HPT tự động |
| Đổi mật khẩu       | Mật khẩu cũ, mới, xác nhận                                                                                                                                          | Đăng nhập riêng, đổi mật khẩu và quản lý phiên của tài khoản mới                                                          |

Chỉ khảo sát các màn hình và nhãn điều khiển. Không tuyên bố đã thử thao tác lưu toa, tính khuyến mãi hoặc sửa khách hàng trên HPT.

### Điều kiện hoàn thành phạm vi clone

- Khảo sát tiếp chỉ đọc các tab, màn hình con, bộ lọc, trường và trạng thái mà tài khoản nhân viên truy cập được; mỗi chức năng có mã, bằng chứng, màn hình TrueCare tương ứng và tiêu chí kiểm thử trong bảng đối chiếu.
- Phân biệt đã thấy giao diện, đã thử thao tác chỉ đọc và chưa xác minh hành vi ghi. Nút lưu/xóa/tính lại khuyến mãi chỉ kiểm thử bằng dữ liệu giả trên TrueCare hoặc môi trường thử được cho phép; không bấm thử trên HPT.
- Với nghiệp vụ nguồn chưa quan sát đủ: không loại khỏi phạm vi và không tự nhận đã clone chính xác. Ghi trạng thái cần xác minh; dùng mô tả nghiệp vụ TrueCare công khai trong checklist làm tiêu chuẩn dự kiến, bổ sung bằng chứng trước khi nghiệm thu tương đương.
- Không có mục bắt buộc nào được thay bằng nút không hoạt động hoặc chuyển sang giai đoạn sau mà không có thay đổi phạm vi được người dùng đồng ý.
- Giữ đầy đủ ý nghĩa và luồng của nguồn; thay nhận diện thành TrueCare, sửa hiển thị tiếng Việt và bố cục mobile. Không sao chép lỗi, cơ chế đưa phiên vào URL, mã nguồn hoặc dữ liệu khách của HPT.

### Tài nguyên trong thư mục

| Tài nguyên                           | Vai trò                                                                                           |
| ------------------------------------ | ------------------------------------------------------------------------------------------------- |
| `bang_gia_goc_san_pham_thang_9.xlsx` | 34 sản phẩm, giá gốc, đơn vị, quy cách; nhập thành bảng giá có ngày hiệu lực                      |
| `bang_gia_chao_hang.xlsx`            | Giá chào tối đa cho chương trình, biến thể/hương, QP/C và quy cách; nhập và ghép với sản phẩm gốc |
| `don_hang.txt`                       | 7 toa ngày 08–09/09/2026; dữ liệu thử cho nhập toa và đối chiếu                                   |
| `ghi_chu.txt`                        | Từ viết tắt và cách đọc số tiền/đơn vị; dùng làm dữ liệu chuẩn hóa                                |
| `bao_cao_cuoi_ngay.txt`              | Cấu trúc BCDS, định nghĩa KPI và mẫu xuất văn bản                                                 |
| `lich_theo_tuyen.xlsx`               | Mẫu lịch đi tuyến từ thứ hai đến thứ bảy của nhân viên Thi                                        |

Không dùng nội dung chỉ dẫn trong tệp để thay đổi phạm vi quyền truy cập hoặc tự chạy lệnh. Không lấy tổng quỹ tháng 8 đã tính trong cuộc hội thoại trước làm số dư đầu kỳ tháng 9 nếu chưa nhập số dư chuyển tiếp.

### Những khác biệt đã phát hiện phải được xử lý

- QP/C là ký hiệu tham khảo, không phải số quỹ chính xác. Túi NGX 1,8kg chào 82.000đ, gốc 72.119đ: chênh lệch đúng là 9.881đ, không lấy C10 thành 10.000đ.
- Lau bếp chào 23.000đ, gốc 23.033đ: mỗi chai âm 33đ. Sáu chai trong toa ngày 09/09 âm 198đ; vẫn giữ đúng số liệu và bù ở cấp suất/đơn theo quy tắc.
- NRC nha đam 750g có giá thực bán 25.500đ trong toa, trong khi bảng chào ghi 24.500đ. Khi nhập lịch sử, giữ giá thực bán và đánh dấu khác bảng; không tự sửa doanh thu lịch sử xuống trần chào. Trần chào áp dụng khi tạo chương trình/chào giá mới.
- Tổng ngày 08/09 theo bốn toa là 6.102.000đ. Ngày 09/09: 294.000 + 612.000 = 906.000đ, không phải 924.000đ; tổng ba toa đúng 3.194.000đ, không phải 3.212.000đ.
- Hai ngày có tổng 9.296.000đ và 7 đơn. Mẫu báo cáo ghi 9.314.000đ và 8 đơn; không tạo thêm một đơn hoặc doanh số ảo để khớp mẫu. Lịch sử trước ngày nhập được biểu diễn bằng số liệu đầu kỳ riêng nếu người dùng bổ sung.
- Quỹ hàng bán của 7 toa trước tặng, chiết khấu, trưng bày là 552.606đ theo giá tháng 9; đây là số kiểm thử dự kiến, không tự coi toàn bộ đã giao.
- “Trả trưng bày 1 can” được phân loại hỗ trợ trưng bày, không mặc định là khách trả hàng. “Tặng 1 cái kệ sắt” là quà ngoài danh mục, cần có giá vốn và nguồn chịu chi phí; không mặc định giá bằng 0.

## 3. Chức năng và luồng sử dụng

### Tài khoản và profile

- Màn hình đăng nhập tương đương nguồn có mã công ty, tên đăng nhập và mật khẩu. Mã công ty khởi tạo là TRUECARE; tài khoản vẫn độc lập theo nhân viên, mã công ty không cấp quyền xem dữ liệu người khác.
- Đăng ký bằng email xác minh và tên đăng nhập riêng; backend ánh xạ bộ mã công ty/tên đăng nhập sang danh tính Supabase Auth, trả lỗi chung để không lộ tài khoản có tồn tại. Không đưa quyền tra email người khác hoặc secret key xuống client.
- Có đăng ký, quên mật khẩu qua email, đổi mật khẩu với xác thực hiện tại, đăng xuất và thu hồi các phiên khác. Tên hiển thị độc lập với tên đăng nhập/email.
- Mỗi tài khoản tự quản lý hồ sơ, avatar, tuyến đi, mục tiêu tháng/ngày, khách mở mới, nhãn hàng trọng tâm, lịch làm việc/ngày nghỉ, khoảng báo cáo và mẫu báo cáo.
- Cài đặt số dư quỹ đầu kỳ, ngày bắt đầu theo dõi và các chỉ tiêu lũy kế ban đầu bằng một nghiệp vụ mở kỳ có lịch sử, không ghi đè số tổng.
- Bảng giá gốc và chào được sao chép từ bộ mẫu khi khởi tạo tài khoản; các thay đổi sau đó thuộc riêng tài khoản đó.

### Dashboard

- Hiển thị doanh số đặt, doanh số giao, quỹ dự kiến từ đơn chưa giao, quỹ đã ghi nhận, ngân sách đang giữ cho chương trình và quỹ còn có thể sử dụng.
- Chọn hôm nay, hôm qua, tuần này, tháng này hoặc khoảng ngày. Hiển thị số đơn, khách mở mới, tiến độ KPI, tuyến hôm nay và các dòng cần đối chiếu.
- Bấm một chỉ tiêu để tới danh sách đã lọc; danh sách và chỉ tiêu phải dùng cùng điều kiện tính.

### Sản phẩm và bảng giá

- Một sản phẩm có nhóm, nhãn hiệu, dạng bao bì, dung lượng, đơn vị bán, quy cách; màu/hương là biến thể. Không gộp Maxx can 3,3kg với Maxx túi 3,3kg.
- Có từ điển biệt danh: NGX, NXV, NRC, LS/NLS, NLK, NLB, SS, Zero, thùng/T, dây; tẩy tím/xanh = SS, đen = Zero theo quy tắc đã xác nhận. Các quy tắc có phạm vi loại hàng, không áp màu sang nhóm sản phẩm khác.
- Mỗi phiên bản bảng giá có ngày hiệu lực. Giá gốc và giá chào là hai cột và hai nguồn riêng. Giá, quy cách và tên sản phẩm tại thời điểm chốt đơn được chụp lại trên dòng đơn.
- Không lấy giá mới tính lại đơn cũ. Một giá thiếu hoặc sản phẩm ghép mơ hồ phải hiện lý do; không dùng 0 hoặc sản phẩm gần giống làm giá gốc.
- Các ô gộp trong Excel được đọc theo phạm vi gộp; không điền xuống mọi ô trống một cách tùy tiện. Dây xả vải 20g/20ml được ghép bằng biệt danh đã kiểm tra, đơn vị giao dịch là dây.

### Khách hàng và tuyến

- Thêm/sửa/lưu trữ hồ sơ khách trong ứng dụng mới; không xóa vật lý khách đã có giao dịch.
- Tên cửa hàng, người liên hệ, điện thoại, địa chỉ chi tiết, tỉnh, huyện/khu vực bán hàng, xã/phường, loại cửa hàng, tuyến, thứ ghé, tần suất, ghi chú và vị trí nếu người dùng tự nhập.
- Tìm tiếng Việt có hoặc không dấu, tên gần đúng và số điện thoại. Cảnh báo khách có thể trùng; gộp khách cần thao tác chủ động và giữ lịch sử tham chiếu.
- Hồ sơ khách có đơn đã đặt, các lần giao, tiền đã thu/còn phải thu, sản phẩm mua, quà đã nhận và lịch sử viếng thăm.
- Nhãn huyện/tuyến theo dữ liệu bán hàng thực tế; giữ nguyên địa chỉ gốc, không tự sửa địa danh dựa trên suy đoán.
- Trong màn hình nhập đơn, danh sách khách có “Trong tuyến” / “Tất cả”; tìm kiếm luôn áp dụng trong phạm vi đang chọn. Có lối tạo/sửa khách tương đương biểu tượng trong danh sách nguồn, nhưng chỉ tác động dữ liệu TrueCare.
- Loại cửa hiệu và mã tần suất ghé là danh mục cấu hình, giữ được các mã nguồn như 1.1/1.2/2.1/4/8/12/24. Chưa biết ý nghĩa mã thì lưu như mã, không tự chuyển thành lịch; lịch thứ T2–T7 là lựa chọn riêng.

### Đơn hàng, toa và thực giao

- Giữ ba tab chức năng tương đương nguồn: **DS khách hàng → Hóa đơn → Chi tiết**. Chuyển tab không mất nháp; đổi khách hoặc tạo đơn mới khi còn sửa chưa lưu phải cảnh báo.
- Có tạo mới, lưu nháp/lưu sửa, tìm toa đã có, xem chi tiết, xóa dòng, hủy/xóa toa và tính lại khuyến mãi. Chỉ xóa cứng bản nháp chưa có chứng từ liên quan; với đơn đã chốt/giao, thao tác xóa chuyển thành hủy/đảo theo quy tắc kiểm toán, có xác nhận và lý do.
- “Giá thùng” chuyển cách nhập/hiển thị đơn giá theo thùng hoặc đơn vị; chuyển qua lại không nhân chia hai lần. “Cố định giá” giữ giá người dùng đã chọn khi thay số lượng/tính lại chương trình, nhưng không bỏ qua trần chào hoặc kiểm tra quỹ.
- “Tính lại khuyến mãi” tạo bản xem trước quà/giảm giá mới và phần khác với bản hiện tại; áp dụng thay phiên bản cũ, không cộng quà lặp. Giá của dòng cố định được giữ; nếu không đủ ngân sách thì báo không hợp lệ thay vì tự sửa giá.
- Đơn gốc có trạng thái nháp → đã chốt → giao một phần → giao đủ; hủy phần chưa giao có lý do. Toa/phiếu giao là chứng từ con của đơn, có mã riêng.
- Mã đơn và phiếu giao do server cấp, duy nhất trong tài khoản. Mỗi chứng từ có ngày thực tế, khách, ghi chú và người sở hữu.
- Nhập thùng và đơn vị lẻ; nếu nguồn đã ghi “1 thùng × 4 can” thì hiểu là cùng lượng hàng, không cộng thành 8 can.
- Dòng hàng bán, dòng quà tặng, hỗ trợ trưng bày, chiết khấu và đổi/trả được phân loại riêng. Nhập quà không tăng doanh số bán.
- Chốt đơn lưu giá bán, giá gốc, quy cách, phiên bản bảng giá và phân bổ giảm giá. Tính quỹ dự kiến nhưng chưa cộng vào quỹ khả dụng.
- Khi giao hàng, chọn số lượng thực giao từng dòng và quà thực giao. Cho phép nhiều lần giao; không được giao quá số đã đặt còn lại. Quỹ chỉ ghi nhận cho phần thực giao.
- Doanh số bán hàng lọc theo ngày đặt; doanh số thực giao lọc theo ngày giao. Đơn ngày 30/09 giao 02/10 không bị dồn cả hai số về cùng ngày.
- Theo dõi thu tiền riêng để biết công nợ, nhưng không dùng ngày thu tiền để ghi quỹ vì người dùng đã chọn mốc giao hàng.
- In/tải PDF hoặc Excel toa giao; xuất nội dung chào hàng cho khách. Bản khách xem không chứa giá gốc, quỹ và ngân sách nội bộ.
- Sửa giao dịch đã giao bằng phiên bản điều chỉnh và bút toán đảo/liên kết, không sửa âm thầm số đã ghi nhận. Không xóa sổ quỹ khi hủy một chứng từ.

### Tồn kho — phân hệ bắt buộc trong bản clone

- Có trang tồn kho riêng với tên/mã/biến thể sản phẩm, giá thùng, giá lẻ, tồn thùng và tồn lẻ; tìm theo tên/mã, lọc nhóm/nhãn hiệu, còn/hết/chưa có dữ liệu tồn và ngày cập nhật.
- Tồn được lưu theo đơn vị cơ sở từng SKU; hiển thị thùng = phần nguyên chia quy cách, lẻ = phần dư. Giá thùng là giá lẻ × quy cách của bảng giá đang chọn, không lấy giá gốc thay cho giá bán.
- Nguồn tồn là bản nhập Excel hoặc khai báo tồn đầu kỳ của nhân viên trong TrueCare, có thời điểm kiểm kê. Không tự dùng dữ liệu tồn công ty đã nhìn thấy trên HPT và không coi một snapshot cũ là tồn thời gian thực của HPT.
- Có làm mới từ dữ liệu TrueCare, lịch sử nhập/điều chỉnh tồn và lý do. Nhập snapshot kiểm kê tạo chênh lệch điều chỉnh tại thời điểm đó, không cộng số tồn nhập lại như một lần nhập hàng mới.
- Khi bật theo dõi tồn cho SKU, ghi nhận nhập bổ sung, hàng bán/quà thực giao xuất kho, hàng trả có nhận lại và đủ điều kiện nhập kho; giao dịch kho liên kết chứng từ và chống ghi lặp. Thực giao và sổ quỹ/kho phải cập nhật nguyên tử.
- Chốt đơn giữ lượng hàng cho phần chưa giao; hủy/giảm đơn giải phóng phần giữ. Tồn khả dụng = tồn thực tế − hàng đã giữ. Đơn nháp và phương án random xem trước không xuất kho hoặc giữ hàng.
- Khi lưu chương trình đã chọn “bảo đảm có hàng”, giữ SKU cho số suất tương ứng và chuyển khoản giữ sang đơn khi áp dụng; không giữ hai lần. Nếu không chọn bảo đảm, ghi rõ chưa giữ hàng và kiểm tra lại lúc khách đặt.
- SKU chưa có dữ liệu tồn vẫn hiển thị là “chưa cập nhật”, không mặc định 0 hoặc tự cam kết còn hàng. Cho phép lưu đơn chờ bổ sung tồn; khi bật kiểm soát tồn thì chặn giữ hàng/thực giao vượt lượng khả dụng.
- Tồn kho ở đây thuộc tài khoản nhân viên và phục vụ chức năng clone; không phát sinh quyền quản trị kho chung hoặc dữ liệu dùng chung giữa các tài khoản.

### Quà, khuyến mãi, chiết khấu và đổi trả

- Hỗ trợ tặng hàng theo số lượng, mua X tặng Y, tặng khi đạt tiền/đạt số thùng, giảm tiền, giảm phần trăm, giá sỉ theo số suất và hỗ trợ trưng bày.
- Mỗi khoản có nguồn chịu chi phí: quỹ nhân viên hoặc công ty hỗ trợ. Chỉ phần nhân viên chịu mới trừ quỹ; khoản công ty hỗ trợ được ghi rõ để không bị bỏ sót hay trừ hai lần.
- Quà ngoài danh mục như kệ sắt, bộ chén có tên, số lượng, giá vốn và nguồn tài trợ riêng. Không mặc định bỏ tất cả bộ chén chỉ vì lần rà Excel trước từng loại bộ chén ra khỏi phạm vi tính.
- Nếu quà chưa có giá vốn hoặc chưa rõ người chịu chi phí: vẫn giữ được đơn nháp và giá trị bán; quỹ sau khuyến mãi gắn trạng thái chưa đủ căn cứ và không được dùng làm nguồn cho random.
- Phần trăm giảm giá được chuyển thành số tiền nguyên đồng, làm tròn một lần. Giảm giá chung được phân bổ theo tỷ trọng tiền bán; phần đồng lẻ phân bổ theo số dư lớn nhất và thứ tự dòng cố định.
- Trả hàng phải tham chiếu lần giao cũ, giới hạn số còn có thể trả, dùng giá gốc và tiền bán sau giảm giá đã ghi nhận của lần giao đó. Hoàn quà chỉ làm hoàn lại giá vốn khi có ghi nhận thực sự nhận lại quà.
- Đổi ngang cùng giá vốn ghi nhận hai phía và quỹ thay đổi bằng 0; đổi khác loại thể hiện hàng thu về, hàng giao mới và tiền thu/thối thêm. Không tính lần đổi như một đơn bán mới đầy đủ.

### Quỹ dư cá nhân

Các chỉ tiêu được tính từ sổ giao dịch, không từ một ô tổng có thể sửa trực tiếp:

```text
Quỹ phát sinh hàng bán = Tiền hàng bán thực giao sau giảm giá − Giá gốc hàng bán thực giao
Quỹ ròng phát sinh = Quỹ hàng bán − Giá gốc quà thực giao nhân viên chịu
                   − Chi phí hỗ trợ/trưng bày nhân viên chịu + Điều chỉnh đổi/trả
Quỹ đã ghi nhận = Số dư đầu kỳ + Tổng quỹ ròng + Bổ sung quỹ − Rút/chi quỹ
Quỹ khả dụng = Quỹ đã ghi nhận − Ngân sách đã giữ cho cam kết chưa thực hiện
```

- Hiển thị tách trước/sau khuyến mãi và nguồn phát sinh từng khoản. Từ tổng quỹ truy tới toa, lần giao, dòng sản phẩm và giá gốc.
- Bổ sung/rút/điều chỉnh quỹ cần số tiền, ngày và lý do; ghi sổ bất biến. Không ghi tiền thu khách vào quỹ như một khoản lãi thứ hai.
- Giá trị giao dịch hợp lệ có thể khiến sổ quỹ âm sau trả hàng/điều chỉnh. Hệ thống phải phản ánh sự thật, cảnh báo thiếu quỹ và chặn cấp ngân sách khuyến mãi mới; không chặn ghi nhận hàng thực sự đã trả để giữ một số dư đẹp.

## 4. Bộ tạo suất và giá sỉ không vượt quỹ

### Đầu vào của chương trình

- Chế độ: nhiều sản phẩm hoặc một sản phẩm; tên, ngày hiệu lực/hết hạn, đối tượng khách, tuyến và số suất tối đa.
- Nhóm/SKU bắt buộc, SKU loại trừ, màu/hương cho phép, số loại hàng, lượng tối thiểu/tối đa mỗi loại, thùng nguyên hoặc cho phép lẻ, tổng tiền suất mục tiêu.
- Nhóm hàng trọng tâm, mức quà tối đa, mặt hàng có thể tặng, chiết khấu, số suất khách lấy và các bậc giá sỉ.
- Mức quỹ muốn giữ lại mỗi suất, ngân sách hỗ trợ từ quỹ hiện có, danh mục có hàng để chào. Nếu chưa nhập tồn thì ghi “chưa kiểm tra tồn”, không tự nhận là còn hàng.
- Mặc định tìm phương án không dùng quỹ cũ trước. Chỉ phương án sử dụng quỹ cũ mới yêu cầu người dùng bật hỗ trợ và hiển thị rõ số quỹ sẽ dùng.

### Ràng buộc và cách tính

```text
P = Tổng tiền khách trả cho suất sau mọi giảm giá
C = Giá gốc toàn bộ hàng bán trong suất
G = Giá gốc quà/chi phí nhân viên chịu của suất
M = P − C − G
Hỗ trợ quỹ cũ cần thiết = max(0, −M)
```

- Cho phép dòng sản phẩm âm nếu các dòng khác trong cùng suất bù được. Không lấy lợi nhuận dự kiến của một khách/suất chưa bán khác để bảo đảm cho suất hiện tại.
- Với mọi SKU, giá bán phân bổ trước và sau giảm giá không vượt giá chào tương ứng. Không chỉ kiểm tra tổng tiền suất vì tổng có thể che việc nâng giá một mặt hàng.
- Lưu giá phân bổ từng dòng khi chốt giá trọn suất. Từ tổng giá các dòng theo bảng chào, phân bổ khoản giảm theo tỷ trọng; không cộng khoản chênh lệch dương lên mặt hàng vượt trần.
- Mỗi bậc giá sỉ kiểm tra trên toàn bộ số suất/quà thực tế của bậc đó, kể cả quà tặng thêm chỉ phát sinh khi mua nhiều suất.
- Hỗ trợ quỹ cũ của từng suất không quá 200.000đ. Đồng thời, tổng hỗ trợ của các suất không vượt quỹ khả dụng hoặc ngân sách người dùng cho phép. Không mặc định cấp đủ 200.000đ nếu tài khoản thực tế chỉ còn 50.000đ.
- Ví dụ: mỗi suất cần bù 150.000đ, 10 suất cần giữ 1.500.000đ. Nếu quỹ khả dụng chỉ 500.000đ thì tối đa 3 suất loại đó, hoặc phải giảm mức bù/phối lại hàng. Không coi 200.000đ là ngân sách dùng chung cho cả 10 suất.
- Với quà/chiết khấu theo bậc lấy nhiều suất, phân bổ chi phí và tiền giảm cho từng suất theo tỷ trọng tiền bán (chia đều nếu suất giống nhau), phân bổ đồng lẻ theo số dư lớn nhất/thứ tự suất cố định; kiểm tra trần 200.000đ cho từng suất sau phân bổ.
- Giá vốn quà ngoài danh mục chưa biết hoặc SKU thiếu giá chào/giá gốc thì loại khỏi phép random và giải thích lý do, không gán 0.
- Sinh tối đa 5 phương án khác nhau mỗi lần bằng bộ tính xác định có seed; tìm không quá 2.000 ứng viên. Trả phương án hợp lệ trước, ghi rõ khi không tìm đủ; không tự nới ràng buộc.
- Ưu tiên phương án dùng ít quỹ cũ nhất, tiếp đó gần ngân sách khách, đạt hàng trọng tâm và đa dạng sản phẩm. Random chỉ thay thứ tự/ứng viên hợp lệ, không thay công thức tiền.
- Khi chưa tìm được phương án trong giới hạn tìm kiếm: thông báo đúng tình trạng đó, gợi ý giảm quà, tăng số hàng có lãi, đổi phối hợp hoặc giảm mức chiết khấu; không tự tăng giá vượt bảng chào và không tuyên bố đã chứng minh mọi tổ hợp đều bất khả thi.

### Giữ ngân sách và chống dùng trùng

- Xem trước/random không trừ quỹ. Khi lưu để đem chào, giữ ngân sách cho số lượt sử dụng tối đa đã khai báo.
- Ngân sách giữ phải đủ cho kịch bản được khách chọn. Nếu nhiều bậc giá sỉ/biến thể dùng chung một hạn mức suất thì giữ theo mức hỗ trợ tệ nhất trong các lựa chọn có thể xảy ra; không cộng lợi nhuận của lựa chọn chưa bán để bù.
- Server khóa hàng số dư quỹ và bộ đếm suất, tính lại giá/khả dụng và giới hạn 200.000đ mỗi suất, tạo chương trình và khoản giữ trong cùng giao dịch cơ sở dữ liệu. Có khóa chống gửi lặp.
- Mỗi lượt lấy suất có định danh riêng, liên kết các dòng đơn/giao/quà và khoản hỗ trợ đã dùng/đang giữ. Giao thành nhiều lần hoặc sửa đơn không được đặt lại hạn mức 200.000đ cho cùng suất.
- Khi khách đặt, phần giữ của chương trình chuyển sang đơn; không trừ hai lần. Khi giao từng phần, phần chi phí đã thực hiện được ghi vào sổ và phần giữ còn lại được tính lại theo phần chưa giao.
- Không thả khoản giữ khi các hàng có lãi đã giao trước nhưng quà/hàng lỗ chưa giao. Quỹ giữ còn lại phải đủ cho trường hợp chỉ phần còn lại này được giao tiếp.
- Hết hạn/hủy chương trình giải phóng phần chưa cam kết. Ngân sách đã gắn với đơn chờ giao không tự mất khi chương trình hết hạn.
- Kiểm tra lại khi sửa chương trình, đổi số suất, đặt hàng và giao hàng; chỉnh số ở trình duyệt không được vượt kiểm tra trên server.
- Việc trả hàng sau này có thể làm quỹ thiếu; hệ thống báo và dừng khuyến mãi mới. Cam kết “không vượt quỹ” là kiểm soát tại thời điểm giữ/chốt/giao dựa trên dữ liệu có thật, không dự đoán doanh thu tương lai.

## 5. Báo cáo, tìm kiếm và nhập dữ liệu

### Báo cáo cuối ngày

- Sinh báo cáo TXT theo mẫu đã gửi, kèm nút sao chép và tải về. Không tự gửi Zalo/email hoặc đăng báo cáo đi nơi khác.
- Ngày, nhân viên, tuyến lấy từ profile/lịch; ASO giữ giá trị cấu hình ban đầu 15, không tự suy từ số đơn.
- DS có hai cách xem đặt/giao; báo cáo mẫu mặc định dùng doanh số đặt hàng, có nhãn rõ khi chọn thực giao. KPI và báo cáo phải dùng cùng cách ghi nhận.
- DS đạt = doanh số ngày / mục tiêu ngày. Lũy tiến tính trong kỳ đang chọn cộng số liệu đầu kỳ đã nhập, không cố định mãi ngày đầu tháng.
- Ngày làm việc theo lịch T2–T7 và ngày nghỉ cấu hình. DS còn phải đạt/ngày = max(0, mục tiêu kỳ − doanh số lũy kế) / số ngày làm việc còn lại sau ngày báo cáo. Nếu hết ngày làm việc, hiển thị thiếu bao nhiêu thay vì chia cho 0.
- DH đếm đơn duy nhất, không đếm số lần giao thành nhiều đơn. MM đếm khách có mốc mở mới trong kỳ, không coi mọi khách vừa nhập lịch sử là khách mới hôm nay.
- NGX/NXV/#/NHTT tổng hợp theo SKU và quy cách từng SKU. Không đổi 12 chai của loại này thành một thùng của loại có quy cách 24 chai. Báo cáo tổng nhóm hiển thị số thùng nguyên và đơn vị lẻ theo từng loại đơn vị, có bảng giải thích khi nhóm trộn quy cách.
- Mục tiêu khởi tạo từ mẫu: tháng 80 triệu, ngày 4 triệu, khách mới 30, NHTT NGX túi 4,2kg; đều là cấu hình cá nhân có thể chỉnh. Không lấy mẫu báo cáo làm số thực tế đã đạt.

### Tìm kiếm và bộ lọc dùng chung

- Khách hàng: tên, số điện thoại, huyện, xã, tuyến, loại khách, mới/cũ, có mua/chưa mua trong kỳ.
- Đơn/phiếu giao: mã, khách, ngày/khoảng ngày, trạng thái, tuyến/huyện, sản phẩm/nhóm/nhãn hiệu, có quà, có giảm giá, có hàng trả, lệch giá, quỹ âm/dương và cần đối chiếu.
- Sổ quỹ: khoảng ngày, loại phát sinh, đơn/phiếu giao, chương trình và nguồn tài trợ.
- Tìm không dấu; bộ lọc lưu trong URL để quay lại đúng màn hình. Phân trang server, tổng số và số tiền tính trên toàn bộ kết quả lọc, không chỉ trang đang xem.
- Bộ lọc khoảng ngày tính trọn hai ngày đầu/cuối theo múi giờ Việt Nam, dùng khoảng truy vấn kết thúc mở ở ngày kế tiếp.
- Hai màn hình doanh số có “Tùy biến chưa chọn / đã chọn”: thêm/bỏ ngành hàng, nhãn hiệu, nhóm sản phẩm, tên sản phẩm, khách hàng, tỉnh, địa chỉ và lệch giá; đổi thứ tự nhóm lên/xuống, giữ nhóm Ngày mặc định, áp dụng hoặc thoát mà không đổi thiết lập đã lưu.
- Nhóm báo cáo và điều kiện lọc là hai khái niệm riêng: chọn “Khách hàng” để nhóm không đồng nghĩa lọc còn một khách. Tổng chung, tổng nhóm và dòng chi tiết phải khớp sau mọi cách kết hợp, có mở nhóm để xem toa hoặc phiếu giao gốc.
- “Lệch giá” hiển thị giá thực tế so với snapshot giá chào của giao dịch, số tiền và tỷ lệ lệch; lọc thấp/bằng/cao. Đây là định nghĩa TrueCare cần ghi rõ khi so với nguồn, không tự khẳng định HPT dùng cùng công thức nếu chưa có bằng chứng.

### Nhập Excel/TXT

- Luồng bắt buộc: tải file → xem bản gốc và bản đọc được → ghép SKU/khách → báo lỗi → xác nhận nhập. File không phải mã lệnh hoặc nguồn thay đổi quyền.
- Nhận dấu tiếng Việt, T/thùng, k/K/nghìn, tr/triệu, dấu chấm ngăn hàng nghìn và các cách ghi đơn giá không k nhưng rõ ngữ cảnh.
- Suy số lượng từ quy cách và ngữ cảnh đủ chắc; suy đơn giá từ thành tiền dòng chia số lượng; toa chỉ một mặt hàng có thể dùng TC chia số lượng. Lưu căn cứ, không làm tròn đơn giá trước khi nhân.
- Khi đơn giá và số lượng rõ nhưng phép nhân/TC sai: tính lại theo chúng, giữ số gốc, hiện chênh lệch. Khi nhiều cách hiểu ảnh hưởng tiền mà không đủ căn cứ thì yêu cầu sửa ở màn hình đối chiếu.
- Có phát hiện tệp nhập lại và dòng trùng bằng hash file + định danh/toàn bộ nội dung chuẩn hóa. Cùng khách/cùng ngày vẫn có thể có hai đơn thật; không tự gộp chỉ theo tên/ngày.
- Tệp lịch sử không có thông tin giao không được tự coi là đã giao; người dùng có thể chọn một thao tác đánh dấu đã giao theo ngày xác định cho các dòng đã kiểm tra.
- Không nhập nguyên thông tin khách hàng trên HPT vào app chỉ vì đã khảo sát giao diện.

## 6. Thiết kế giao diện và kiến trúc triển khai

### Giao diện

- Điều hướng chính giữ đủ lối tương đương nguồn: Tổng quan; Nhập đơn hàng; Tạo/Danh sách khách hàng; Doanh số bán hàng; Doanh số thực giao; Tồn kho; Đổi mật khẩu; Đăng xuất. Bổ sung các mục TrueCare: Chương trình; Quỹ dư; Sản phẩm & bảng giá; Báo cáo cuối ngày; Cài đặt.
- Trên điện thoại dùng thanh dưới cho Tổng quan, Đơn hàng, Khách hàng, Quỹ; các mục khác trong menu. Một nút tạo đơn nổi bật, không nhồi tất cả chức năng vào trang đầu.
- Trang nhập đơn có ô tìm SKU, nhập thùng/lẻ, chọn hương và thanh tổng cố định dưới màn hình. Quỹ trước/sau quà và phần cần quỹ cũ cập nhật ngay.
- Trang chương trình có vùng điều kiện, kết quả phương án và bảng giải thích giá bán/giá gốc/quà/quỹ. Mỗi phương án có số lượng suất, hiệu lực, số ngân sách giữ và cảnh báo trần giá.
- Bảng desktop có tiêu đề cố định và cột tiền căn phải. Mobile ưu tiên dòng hàng gọn, không thu nhỏ nguyên bảng desktop.
- Giai đoạn thiết kế trước code: dựng luồng/màn hình tương đương từ ảnh và bảng kiểm kê HPT, giữ đủ tab, trường, điều khiển và kết quả; dùng UX Pilot/Product Design để thể hiện bản clone mang nhận diện TrueCare. Không thay bằng ba hướng sản phẩm khác nhau làm rơi chức năng nguồn; các phương án trình bày nếu có đều phải vượt cùng checklist chức năng.
- Mặc định giao diện sáng, nền trắng, xanh đậm cho điều hướng, xanh lá cho quỹ dương, đỏ cho thiếu quỹ; luôn có nhãn/số thay vì chỉ phân biệt màu. Font hỗ trợ tiếng Việt, nút chạm tối thiểu 44px.
- Có Dark/Light lưu theo profile và nút về đầu trang; đầy đủ tương tác trên cả hai chế độ. Phiên hết hạn đưa về đăng nhập, giữ nháp của chính người dùng an toàn và không hiện dữ liệu tài khoản trước sau khi đổi tài khoản.

### Công nghệ được chọn

- React + TypeScript + Vite cho ứng dụng web; Tailwind CSS và shadcn/ui cho thành phần; React Router, TanStack Query, React Hook Form + Zod cho điều hướng, dữ liệu và biểu mẫu.
- Node.js 24 cho công cụ phát triển. Chọn bản thư viện ổn định tương thích tại lúc khởi tạo và khóa bằng lockfile; không dùng phiên bản mặc định cũ Node 23 trong tài liệu kỹ năng.
- Supabase Auth, PostgreSQL và Storage private. Hàm nghiệp vụ server cho nhập dữ liệu, chốt/giao đơn, đổi trả và giữ quỹ; hàm SQL giao dịch nguyên tử cho cập nhật nhiều bảng.
- PostgreSQL NUMERIC để tính chính xác; lưu tiền tổng bằng đồng nguyên. Dùng decimal trong lớp tính và không dùng số thực JavaScript làm nguồn quyết định tiền. Đơn giá suy chia có thể có phần lẻ, tổng tiền nguồn được giữ chính xác.
- V1 dùng trực tuyến; có tự lưu nháp để tránh mất nhập liệu. Không chốt đơn, giao hàng hoặc giữ ngân sách khi offline. Đồng bộ offline nhiều thiết bị đầy đủ nằm ngoài V1.
- Định hướng triển khai frontend trên Vercel, backend Supabase; chưa tạo dịch vụ trả phí hoặc deploy ở bước lập kế hoạch. Môi trường thử dùng dữ liệu giả, môi trường thật nhập dữ liệu riêng.

### Các nhóm bảng dữ liệu chính

| Nhóm             | Bảng/đối tượng chính                                                                                 |
| ---------------- | ---------------------------------------------------------------------------------------------------- |
| Tài khoản        | login_identities (server-private), profiles, user_settings, reporting_periods, opening_balances      |
| Danh mục         | products, variants, product_aliases, price_books, price_book_items                                   |
| Khách/tuyến      | customers, routes, route_schedules, visits                                                           |
| Giao dịch        | orders, order_lines, deliveries, delivery_lines, payments, return_exchanges                          |
| Tồn kho          | inventory_snapshots, inventory_balances, inventory_movements, inventory_reservations                 |
| Chương trình     | programs, program_options, program_tiers, program_redemptions, gifts, discounts, budget_reservations |
| Tùy biến báo cáo | saved_report_views, report_group_dimensions                                                          |
| Quỹ/kiểm toán    | fund_ledger, subsidy_usage, audit_events                                                             |
| Nhập dữ liệu     | import_batches, import_rows, import_issues                                                           |

- Mọi bảng nghiệp vụ có owner_id; khóa ngoại liên tài khoản bị chặn bằng kiểm tra sở hữu và khóa kết hợp, không chỉ ẩn trên UI.
- Dòng giao tham chiếu dòng đơn; dòng trả tham chiếu dòng giao; bút toán tham chiếu nghiệp vụ gốc và có khóa chống ghi hai lần.
- Ghi snapshot giá gốc/giá chào/quy cách/giảm giá tại chốt đơn. Khi đề xuất chưa chốt gặp bảng giá mới, buộc tính lại trước khi dùng.

### Hợp đồng thao tác nghiệp vụ

- PreviewImport → CommitImport: bản xem trước, lỗi và các sửa đã xác nhận; commit nguyên tử theo lô được chọn, chống nhập lặp.
- PreviewOrder → ConfirmOrder: kiểm tra sản phẩm, lượng, giá, giảm giá và ngân sách; trả số đã tính từ server và version.
- CreateOrderDraft / SaveOrderDraft / FindOrders / CancelOrder / RecalculatePromotions: đủ các thao tác nhập toa tương đương nguồn; thay khuyến mãi theo phiên bản và không ghi quà hai lần.
- RecordDelivery / RecordReturnExchange: lưu số lượng thực tế, bút toán và trạng thái đơn trong cùng giao dịch; chặn gửi lặp và vượt số lượng.
- SearchInventory / ImportInventorySnapshot / AdjustInventory / ReserveInventory: đọc tồn, nhập bản kiểm kê, điều chỉnh có lý do và giữ hàng; kiểm tra sở hữu, số lượng và cập nhật nguyên tử cùng chứng từ khi giao.
- GenerateProgram → ReserveProgram → ApplyProgramToOrder: sinh trước, giữ sau, chuyển khoản giữ sang đơn; luôn kiểm tra lại trên server.
- GetDashboard / SearchOrders / SearchCustomers / GetFundLedger / ExportDailyReport: dùng một bộ lọc và một định nghĩa chỉ tiêu chung.
- GetSalesReport / GetDeliveredSalesReport / SaveReportView: nhận bộ lọc và danh sách nhóm có thứ tự; trả tổng, các cấp nhóm và liên kết chi tiết; chỉ cho phép các trường nhóm nằm trong danh sách đã khai báo.
- Mọi thay đổi tiền có idempotency key và version kiểm soát chỉnh sửa đồng thời; API trả lỗi có mã và thông báo tiếng Việt thay vì tự lưu một phần.

## 7. Bảo mật, kiểm thử và lộ trình

### Bảo mật và dữ liệu

- RLS cho dữ liệu cá nhân; xác thực JWT và sở hữu tài nguyên ở server. Thử truy cập đổi ID của người khác phải bị từ chối cả đọc, ghi, export và tải file.
- Không cấp cho client quyền ghi trực tiếp vào sổ quỹ hoặc số ngân sách giữ. Các nghiệp vụ tiền đi qua hàm server/SQL đã giới hạn quyền; cấu hình search_path an toàn và kiểm tra chủ sở hữu trong hàm nâng quyền nếu cần dùng.
- Không đưa secret key, mật khẩu HPT, URL phiên khảo sát hoặc dữ liệu khách vào mã nguồn/log/prototype. File import, avatar và export dùng bucket private, link có thời hạn.
- Repo GitHub hiện công khai và chỉ có README; connector hiện chỉ đọc. Kế hoạch không yêu cầu push. Khi xây dựng, đưa tệp dữ liệu thật, bản sao lưu, ảnh khảo sát và .env vào danh sách không commit trước khi thêm mã nguồn.
- Upload kiểm tra loại/kích thước, giới hạn tối đa mặc định 10MB và 10.000 dòng/lần, chống file Excel nén bất thường; dữ liệu văn bản export không trở thành công thức Excel.
- Audit ghi ai/lúc nào/giá trị trước-sau cho thay đổi giá, chốt/giao/đổi trả, điều chỉnh quỹ và chi ngân sách; không ghi bí mật phiên.
- Sao lưu cơ sở dữ liệu và kiểm tra phục hồi trước khi dùng dữ liệu thật. Thu hồi phiên khi đổi mật khẩu; xóa dữ liệu nháp/cache người dùng khi đăng xuất.

### Kiểm thử nghiệm thu

1. Nhập đúng 34 SKU và giữ phân biệt can/túi, 600/900ml, Care/Maxx. Giá gốc và giá chào không bị hoán đổi.
2. Nhập đúng 7 toa; tổng đặt 08/09 = 6.102.000đ, 09/09 = 3.194.000đ; báo lệch mẫu và không bịa đơn thứ tám.
3. Quỹ trước quà/chi phí cho 7 toa = 552.606đ nếu giả lập giao đủ. Chưa có ghi nhận giao thì quỹ khả dụng từ các toa này bằng 0.
4. Dòng 6 chai lau bếp giá 23.000đ có quỹ -198đ; tổng suất có thể hợp lệ nếu được hàng khác bù. Không tự sửa giá để làm dòng dương.
5. Giá thực bán lịch sử NRC 25.500đ được giữ; chương trình mới không vượt giá chào tương ứng 24.500đ.
6. Quà NRC 750g trà xanh trừ 22.142đ khi nhân viên chịu; quà công ty tài trợ không trừ lần nữa. Kệ sắt thiếu giá không được tự tính 0.
7. Giao một phần, giao khác tháng, giao lặp, trả một phần, đổi ngang và đổi chênh đều ra đúng doanh số/quỹ; hủy đơn chưa giao không đảo doanh số đã giao.
8. Random cho cả hai chế độ, nhiều bậc giá sỉ; mọi giá từng dòng không vượt trần, mọi ngân sách còn khả dụng sau giữ đều không âm.
9. Hai thiết bị cùng giữ quỹ, bấm nhiều lần, random lại, tăng số suất, giao một suất nhiều lần, hết hạn/hủy chương trình và chuyển khoản giữ sang đơn không dùng trùng ngân sách hoặc vượt 200.000đ trên cùng suất. Trường hợp 500.000đ quỹ / 150.000đ hỗ trợ mỗi suất chỉ cho giữ tối đa 3 suất, không cho 10 suất.
10. Không có tổ hợp thỏa điều kiện thì trả lý do, không nới giá/trần quỹ; quà chưa biết giá và lợi nhuận từ đơn chưa giao không được làm tiền bù.
11. Giao hàng có lãi trước, quà/hàng lỗ sau vẫn giữ đủ ngân sách phần còn lại; trả hàng sau khi đã dùng quỹ phải hiện thiếu quỹ và dừng cấp mới.
12. Nhập lại cùng file không nhân đôi; hai đơn thật cùng khách/ngày không bị gộp nhầm. Dòng nhập chưa đủ dữ liệu không cộng vào tổng như đã hoàn tất.
13. Báo cáo đúng biên ngày, KPI, ngày nghỉ, kỳ tùy chọn, dữ liệu đầu kỳ và trường hợp hết ngày làm việc. Không gom sai quy cách thùng giữa SKU.
14. Hai tài khoản độc lập không thể đọc/sửa/file-export của nhau. Bản chào/PDF cho khách không lộ giá gốc/quỹ.
15. Playwright kiểm tra đăng nhập → tạo khách → nhập/chốt đơn → giao từng phần → quỹ → random/giữ → báo cáo trên mobile và desktop; kiểm tra thao tác bàn phím, lỗi mạng, khôi phục nháp và chống gửi lặp.
16. Nghiệm thu từng mã chức năng trong `doi_chieu_chuc_nang_hpt_truecare.md`: mọi màn hình, tab, trường, nút, tìm kiếm và tùy biến báo cáo đều có đối ứng hoạt động; không dùng nút giả để đánh dấu hoàn thành.
17. Giá thùng/lẻ chuyển qua lại giữ nguyên số tiền; cố định giá không bị tính lại chương trình ghi đè; tính lại hai lần không nhân đôi quà; đổi khách/chuyển tab không làm mất nháp âm thầm.
18. Tạo, tìm, lưu sửa và hủy toa hoạt động trên dữ liệu thử TrueCare; hủy toa có phần đã giao không xóa các phát sinh thực giao/quỹ/kho.
19. Tồn thùng/lẻ khớp đơn vị cơ sở; nhập lại snapshot không nhân đôi tồn; giao quà cũng xuất kho; đơn và chương trình chuyển phần giữ không giữ hàng hai lần; trả hàng chỉ nhập lại khi thực nhận và đủ điều kiện.
20. Nhóm/hủy nhóm và sắp thứ tự báo cáo không đổi tổng gốc; drill-down quay lại đúng bộ lọc; Dark/Light, về đầu trang, quên mật khẩu và đăng xuất đều hoạt động.
21. Các chức năng chưa rõ ý nghĩa hoặc chưa quan sát hết trên HPT phải có bằng chứng bổ sung/đặc tả được xác nhận trước khi đánh dấu đạt tương đương. Không được ghi “clone toàn bộ đã hoàn tất” khi checklist còn mục bắt buộc chưa kiểm chứng.

### Các bước triển khai sau khi duyệt kế hoạch

1. Hoàn thiện kiểm kê chức năng HPT chỉ đọc, gồm màn hình con và tùy chọn; chốt bảng tương đương và giao diện clone mang nhận diện TrueCare. Hạn mức đã chốt là 200.000đ mỗi suất. Không cần có thông tin giao/kệ sắt để xây tính năng, nhưng cần chúng để chốt số liệu thật.
2. Dựng nền tài khoản, database/RLS, danh mục, bảng giá và khách hàng; nhập thử dữ liệu vào môi trường kiểm thử.
3. Hoàn thành đủ luồng clone: ba tab nhập toa và các thao tác, doanh số đặt/thực giao, tồn kho bắt buộc, sổ quỹ, quà/giảm giá/đổi trả. Kiểm tra đối chiếu bằng số liệu mẫu trước khi thêm random.
4. Xây bộ tạo chương trình và giá sỉ, cơ chế giữ quỹ, hạn mức, kiểm soát đồng thời và bản chào cho khách.
5. Hoàn thành tuyến, bộ tùy biến/nhóm báo cáo tương đương HPT, báo cáo cuối ngày, tìm kiếm, export và sáng/tối; kiểm thử từng mã checklist, hành trình, bảo mật và giao diện clone.
6. Chạy thử bằng tài khoản/dữ liệu giả, xác nhận backup/restore; sau đó mới nhập dữ liệu thật và triển khai theo hạ tầng được chọn. Không tự đăng lên GitHub hoặc website HPT.

## 8. Nguồn kỹ thuật và công cụ đã sử dụng

- Website chức năng: http://seller.hptbs.com/Default.aspx — khảo sát chỉ đọc bằng Firecrawl và Playwright; phiên khảo sát đã dừng.
- Context7: tài liệu Supabase về RLS, secret key chỉ ở server và database functions nguyên tử: https://supabase.com/docs/guides/database/postgres/row-level-security ; https://supabase.com/docs/guides/database/functions ; https://supabase.com/docs/guides/api/api-keys .
- Vite: https://vite.dev/guide/ — lựa chọn bộ công cụ React/TypeScript và yêu cầu Node; dùng Node 24.
- UX Pilot: đã xem danh mục template dashboard, có các mẫu Datalyze và Ledger; chưa tạo trang/prototype hoặc chọn thay cho người dùng.
- GitHub: đã kiểm tra metadata repo TrueCare, không tạo commit/PR/push và không tải file nghiệp vụ lên repo.
- Các skill đã tham khảo: app-builder, playwright-skill, Firecrawl interact, Product Design get-context/ideate, Build Web Apps frontend-app-builder, hướng dẫn bảo mật của Codex Security. Chưa có mã ứng dụng để chạy security scan.
- Không có công cụ Deep Research riêng được cung cấp trong phiên này; phần khảo sát nguồn được thực hiện bằng Firecrawl, Context7 và đọc tài nguyên cục bộ.

Không có mật khẩu, token phiên hoặc danh sách khách hàng trích xuất từ HPT trong tài liệu kế hoạch này.
