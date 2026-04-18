# Facebook Page API – Backend

Backend Express.js đóng vai trò làm lớp trung gian giữa client và Facebook Graph API.
Dự án này thực hiện Phần 2 của bài tập môn Lập trình API.

---

## Yêu cầu môi trường

- Node.js >= 18
- npm >= 9
- Tài khoản Meta Developer đã tạo App và có **Page Access Token**

---

## Cài đặt

```bash
# 1. Clone hoặc giải nén thư mục dự án
cd facebook-page-api

# 2. Cài dependencies
npm install

# 3. Tạo file .env từ file mẫu
cp .env.example .env
```

Mở file `.env` và điền token của bạn vào:

```
PAGE_ACCESS_TOKEN=EAAxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
GRAPH_API_VERSION=v19.0
PORT=3000
```

---

## Chạy server

```bash
# Chạy bình thường
npm start

# Chạy ở chế độ dev (tự reload khi sửa file)
npm run dev
```

Server mặc định lắng nghe tại `http://localhost:3000`.

---

## Cấu trúc thư mục

```
facebook-page-api/
├── src/
│   ├── config/
│   │   └── graph.js          # Cấu hình base URL và token
│   ├── middleware/
│   │   └── errorHandler.js   # Xử lý lỗi tập trung
│   ├── routes/
│   │   └── page.js           # Định nghĩa toàn bộ route /api/page
│   ├── services/
│   │   └── graphService.js   # Gọi Facebook Graph API
│   └── index.js              # Entry point, khởi tạo Express
├── .env.example
├── package.json
└── README.md
```

---

## Danh sách API

### Page

| Method   | Endpoint                          | Mô tả                              |
|----------|-----------------------------------|------------------------------------|
| GET      | `/api/page/:pageId`               | Lấy thông tin cơ bản của Page      |
| GET      | `/api/page/:pageId/posts`         | Lấy danh sách bài đăng             |
| POST     | `/api/page/:pageId/posts`         | Đăng bài mới lên Page              |
| DELETE   | `/api/page/post/:postId`          | Xoá bài đăng                       |
| GET      | `/api/page/post/:postId/comments` | Lấy bình luận của bài đăng         |
| GET      | `/api/page/post/:postId/likes`    | Lấy lượt thích của bài đăng        |
| GET      | `/api/page/:pageId/insights`      | Lấy thống kê (insights) của Page   |

---

## Chi tiết từng API

### GET `/api/page/:pageId`

Trả về thông tin cơ bản của Page: id, tên, fan count, mô tả, category, website.

```
GET http://localhost:3000/api/page/123456789
```

---

### GET `/api/page/:pageId/posts`

Trả về danh sách bài đăng gần nhất.

| Query param | Kiểu   | Mặc định | Mô tả              |
|-------------|--------|----------|--------------------|
| `limit`     | number | 10       | Số bài muốn lấy    |

```
GET http://localhost:3000/api/page/123456789/posts?limit=5
```

---

### POST `/api/page/:pageId/posts`

Đăng bài mới lên trang.

**Body (JSON):**

| Trường    | Bắt buộc | Mô tả                        |
|-----------|----------|------------------------------|
| `message` | Có       | Nội dung bài viết            |
| `link`    | Không    | Đường dẫn đính kèm (URL)     |

```json
{
  "message": "Xin chào từ API!",
  "link": "https://example.com"
}
```

---

### DELETE `/api/page/post/:postId`

Xoá bài đăng theo ID. `postId` có dạng `{pageId}_{postId}`.

```
DELETE http://localhost:3000/api/page/post/123456789_987654321
```

---

### GET `/api/page/post/:postId/comments`

Lấy các bình luận của một bài đăng.

| Query param | Kiểu   | Mặc định | Mô tả                  |
|-------------|--------|----------|------------------------|
| `limit`     | number | 20       | Số bình luận muốn lấy  |

```
GET http://localhost:3000/api/page/post/123456789_987654321/comments
```

---

### GET `/api/page/post/:postId/likes`

Lấy danh sách người đã like bài đăng.

| Query param | Kiểu   | Mặc định | Mô tả               |
|-------------|--------|----------|---------------------|
| `limit`     | number | 20       | Số lượt like muốn lấy |

```
GET http://localhost:3000/api/page/post/123456789_987654321/likes
```

---

### GET `/api/page/:pageId/insights`

Lấy số liệu thống kê của Page (lượt tiếp cận, người tương tác, lượt xem…).

| Query param | Kiểu   | Mặc định | Giá trị hợp lệ               |
|-------------|--------|----------|------------------------------|
| `period`    | string | `day`    | `day`, `week`, `month`, `lifetime` |

```
GET http://localhost:3000/api/page/123456789/insights?period=week
```

> **Lưu ý:** API Insights yêu cầu Page Access Token có quyền `read_insights`.

---

## Lấy Page Access Token

1. Vào [Meta for Developers](https://developers.facebook.com/)
2. Chọn App > **Tools > Graph API Explorer**
3. Trong phần **User or Page**, chọn đúng Page của bạn
4. Thêm các permissions cần thiết:
   - `pages_read_engagement`
   - `pages_manage_posts`
   - `read_insights`
5. Nhấn **Generate Access Token** và sao chép token vào file `.env`

---

## Ví dụ response

Tất cả response đều có cấu trúc:

```json
{
  "success": true,
  "data": { ... }
}
```

Khi có lỗi:

```json
{
  "success": false,
  "error": {
    "message": "Mô tả lỗi",
    "code": 100
  }
}
```
