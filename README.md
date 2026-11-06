# Chùa Online – live tương tác TikTok

## 1. Cài đặt (làm một lần)
1. Cài Node.js bản LTS (20 trở lên) từ https://nodejs.org
2. Cài OBS Studio từ https://obsproject.com và TikTok LIVE Studio.
3. Giải nén thư mục `chua-live` ra chỗ cố định, ví dụ `D:\chua-live`.
4. Mở `config.json`, sửa `ten_tai_khoan_1` thành username TikTok của bạn (không có @).

## 2. Mỗi lần live
1. Bấm đúp `start.bat`. Giữ cửa sổ đen này mở suốt buổi live.
2. Mở OBS (cảnh đã cài ở mục 3), bấm **Start Virtual Camera**.
3. Mở TikTok LIVE Studio, bấm **Go LIVE**.
4. Trong vòng 30 giây, cửa sổ đen hiện `live - roomId ...` là đã nhận được quà và bình luận.

## 3. Cài OBS (làm một lần)
1. Settings → Video: Base 1080x1920, Output 1080x1920, FPS 30.
2. Sources → + → Browser:
   - URL: `http://localhost:8080/scene.html?room=USERNAME_CUA_BAN`
   - Width 1080, Height 1920
   - Tích **Control audio via OBS**
3. Edit → Advanced Audio Properties: cột Audio Monitoring của nguồn Browser chọn **Monitor and Output**.

## 4. Cài TikTok LIVE Studio (làm một lần)
1. Tạo scene dạng **dọc (Portrait)**.
2. Add source → **Camera** → chọn **OBS Virtual Camera**, kéo cho phủ kín khung.
3. Âm thanh: bật **âm thanh hệ thống / desktop audio**, tắt micro nếu không nói.
4. Tiêu đề và chủ đề live: đặt phù hợp, ví dụ "Nghe kinh an yên mỗi ngày".

## Âm thanh và hình
- Tiếng tụng kinh: `public/audio/chant.mp3`, tự lặp, tự phục hồi khi lỗi.
- Tiếng chuông: tự tạo bằng code; muốn thay thì đặt file `public/audio/bell.mp3`.
- Ban thờ: `public/img/altar.jpg`. Sư thầy: `public/video/monk.webm`.

## Mức quà
- Dưới 10 xu: zoom vào người tặng, chuông 1 tiếng.
- Từ 10 xu: chuông 3 tiếng, banner lâu hơn. Sửa mốc ở `const BIG_GIFT_XU = 10;` trong `public/scene.js`.

## Nhiều tài khoản
Thêm vào `accounts` trong `config.json`, mỗi tài khoản dùng link `scene.html?room=ten_tai_khoan`.

## Lỗi thường gặp
- Cửa sổ đen báo `offline` liên tục khi đã live: kiểm tra username trong `config.json`, đợi thêm 30 giây.
- Live không có tiếng: kiểm tra mục 3 bước 3 và mục 4 bước 3.
- Hình trong OBS bị đứng: chuột phải nguồn Browser → Refresh.

## Live bằng điện thoại (khi chưa có quyền LIVE Studio)
1. Máy tính và điện thoại dùng chung một Wi-Fi. Chạy `start.bat` trên máy tính.
2. Trên máy tính mở CMD, gõ `ipconfig`, ghi lại dòng IPv4 Address (ví dụ 192.168.1.5).
3. Trên điện thoại mở Chrome/Safari: `http://192.168.1.5:8080/scene.html?room=USERNAME_CUA_BAN`
   (lần đầu Windows hỏi tường lửa thì chọn Allow cho Node.js).
4. Chạm vào màn hình một lần để bật âm thanh và toàn màn hình.
5. Mở app TikTok → LIVE → chọn chế độ chia sẻ màn hình (Mobile gaming / Chơi game trên di động) → bắt đầu, rồi quay lại trình duyệt.
6. Bật chế độ Không làm phiền để thông báo không hiện lên live.
