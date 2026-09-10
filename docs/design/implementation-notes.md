# Thiết kế TrueCare

Concept: `dashboard-concept.png`, tạo bằng Image Gen trước khi dựng giao diện. Mục tiêu: ứng dụng thao tác số liệu nhân viên, giữ điều hướng và biểu mẫu theo kế hoạch; không dùng ảnh concept làm giao diện.

## Hệ thống giao diện

- Điều hướng xanh đậm #102c43, nền chính trắng, đường phân cách #e5eaf0.
- Nút chính và số quỹ dương xanh #178366; quỹ âm có số âm và nhãn, màu đỏ.
- Font sans-serif hỗ trợ tiếng Việt; cỡ nhập liệu tối thiểu 16px trên điện thoại; vùng bấm 44px.
- Bảng số liệu dùng cột tiền căn phải, tiêu đề rõ; form và thông báo dùng cùng thành phần xuyên các phân hệ.
- Dashboard: bộ lọc ngày, bốn chỉ tiêu, bảng đơn gần đây, tiến độ tháng/tuyến hôm nay, công việc cần xử lý.
- Màn nhập đơn: ba tab DS khách hàng / Hóa đơn / Chi tiết theo cùng hệ thống, thanh tác vụ lưu/chốt và tổng tiền rõ ràng.
- Mobile: nội dung một cột, thanh điều hướng dưới và menu cho các phân hệ còn lại.

## Điều chỉnh có chủ đích so với ảnh concept

- Ngày phải theo dữ liệu và thời điểm ứng dụng, không dùng ngày 2025 trong ảnh.
- Mục tiêu tháng ban đầu 80.000.000đ theo kế hoạch, không lấy số 0 minh họa làm cấu hình.
- Thông tin tài khoản lấy từ người đang đăng nhập; không dùng tên/mã nhân viên minh họa.
- Bổ sung nhãn môi trường cục bộ để phân biệt bản thử và dữ liệu thật.
- Dữ liệu trống không được tự thay bằng số bán hàng giả.

Kiểm thử trình duyệt và đối chiếu hình ảnh được ghi trong báo cáo nghiệm thu sau khi dựng xong.
