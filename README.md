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
1. Đảm bảo repository đang ở chế độ **Public** (nếu dùng tài khoản GitHub Free, GitHub Pages chỉ hoạt động trên repo Public).
2. Vào repository trên GitHub → chọn **Settings** → **Pages** → mục **Build and deployment → Source**, chọn **GitHub Actions** *(workflow cũng đã bật sẵn `enablement: true` để tự kích hoạt Pages cho repo Public)*.
3. Chờ khoảng 1–2 phút trong tab **Actions** để workflow `Deploy MyVocab to GitHub Pages` chạy xong.
4. Truy cập trang web tại:
   `https://<TEN-GITHUB-CUA-BAN>.github.io/<TEN-REPO>/`

> **Tại sao tính năng AI không chạy trực tiếp trên GitHub Pages thuần?**
> GitHub Pages là máy chủ **web tĩnh** (chỉ phát file HTML/JS/CSS), không có Node.js backend để giữ `GEMINI_API_KEY` an toàn ở phía server. Vì vậy trên bản tĩnh GitHub Pages, toàn bộ tính năng **Nhớ sâu 6 cấp, trò chơi, kho từ vựng, thêm từ thủ công/hàng loạt, phát âm, PWA và Từ điển Offline** chạy 100%, còn các tính năng Gemini AI cần kết nối tới máy chủ backend (`server.ts`).

---

## 2. Bật đầy đủ tính năng Gemini AI từ chính repo GitHub (Miễn phí với Render)

Dự án đã có sẵn file `render.yaml` để chạy cả giao diện lẫn máy chủ AI `server.ts` hoàn toàn miễn phí từ repo GitHub của bạn:

1. Đăng nhập [render.com](https://render.com) bằng tài khoản GitHub.
2. Chọn **New + → Blueprint** (hoặc **Web Service**) → chọn repository MyVocab của bạn.
3. Render tự đọc `render.yaml` → nhập `GEMINI_API_KEY` vào ô Environment Variable trên trang quản trị Render → nhấn **Apply / Deploy**.
4. Sau khi triển khai xong (có link dạng `https://myvocab-xxxx.onrender.com`), bạn có **2 cách dùng**:
   - **Cách 1 (Đơn giản nhất):** Mở thẳng link `https://myvocab-xxxx.onrender.com` — chạy trọn bộ giao diện + PWA + đầy đủ Gemini AI trên cùng một địa chỉ.
   - **Cách 2 (Vẫn dùng link `github.io` của GitHub Pages):** Workflow `.github/workflows/deploy.yml` đã trỏ sẵn mặc định tới backend `https://myvocab-3gcj.onrender.com`. Nếu đổi sang URL backend khác, bạn chỉ cần vào repo GitHub → **Settings → Secrets and variables → Actions → tab Variables → New repository variable** tên `VITE_API_BASE_URL` với giá trị URL mới *(không có dấu `/` ở cuối)* rồi chạy lại workflow.

---

## 3. Chạy đầy đủ (cả AI + Server) trên máy tính cá nhân

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
