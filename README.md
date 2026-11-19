# MyVocab

Ứng dụng học từ vựng tiếng Anh **Nhớ sâu 6 cấp độ**, trò chơi phản xạ, từ điển offline và hỗ trợ cài đặt PWA trên máy tính.

---

## 1. Chạy web miễn phí bằng GitHub Pages (Khuyên dùng)

Dự án đã được cấu hình sẵn workflow tự động build & phát hành lên **GitHub Pages** tại `.github/workflows/deploy.yml`.

### Bước 1: Đưa mã nguồn lên GitHub
Tạo một repository mới trên GitHub (ví dụ `myvocab`), sau đó chạy trong thư mục dự án:

```bash
git init
git add .
git commit -m "Deploy MyVocab"
git branch -M main
git remote add origin https://github.com/<TEN-GITHUB-CUA-BAN>/<TEN-REPO>.git
git push -u origin main
```

### Bước 2: Bật GitHub Pages
1. Vào repository trên GitHub → chọn **Settings** → **Pages**.
2. Ở mục **Build and deployment → Source**, chọn **GitHub Actions**.
3. Chờ khoảng 1–2 phút trong tab **Actions** để workflow `Deploy MyVocab to GitHub Pages` chạy xong.
4. Truy cập trang web tại:
   `https://<TEN-GITHUB-CUA-BAN>.github.io/<TEN-REPO>/`

> **Lưu ý về tính năng trên GitHub Pages (web tĩnh):**
> - **Hoạt động 100% không cần server:** Học Nhớ sâu 6 cấp độ (tùy chọn ôn cấp 6), toàn bộ trò chơi luyện từ, quản lý bộ thẻ, nhập/xuất JSON, thêm từ thủ công/hàng loạt, phát âm giọng đọc, cài đặt app trên máy tính (PWA) và **Từ điển Offline** tích hợp sẵn.
> - **Các tính năng AI (Tách từ bằng Gemini AI, Tạo bộ từ AI, Scan ảnh, Tra Google Search):** Cần có backend Node.js (`server.ts`) giữ `GEMINI_API_KEY` bảo mật. Nếu bạn triển khai `server.ts` lên Cloud Run / Render / Railway, chỉ cần thêm biến môi trường trong GitHub: **Settings → Secrets and variables → Actions → Variables → New repository variable** tên `VITE_API_BASE_URL` trỏ tới URL backend của bạn (ví dụ `https://myvocab-api.onrender.com`), rồi chạy lại workflow.

---

## 2. Chạy đầy đủ (cả AI + Server) trên máy tính cá nhân

```bash
npm install
cp .env.example .env
# Điền GEMINI_API_KEY vào file .env
npm run dev
```

Mở trình duyệt tại `http://localhost:3000`.

### Build bản tĩnh thủ công
```bash
npm run build:gh
```
Thư mục `dist/` sau khi build có thể tải thẳng lên GitHub Pages, Netlify, Vercel hoặc Cloudflare Pages.
