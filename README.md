# Facebook Page API · Webhook & Kafka Real-time Processing

> **Bài tập môn Lập trình API – Bài 2** · Sinh viên: Âu Dương Tân · MSSV: 6451071069
>
> Hệ thống hướng sự kiện có khả năng xử lý theo thời gian thực:
> nhận Webhook event từ Facebook → xác thực chữ ký → chuẩn hóa dữ liệu → publish vào Kafka topic `raw_events`.

---

## Mục lục

1. [Kiến trúc hệ thống](#1-kiến-trúc-hệ-thống)
2. [Cấu trúc thư mục](#2-cấu-trúc-thư-mục)
3. [Yêu cầu môi trường](#3-yêu-cầu-môi-trường)
4. [Cài đặt & Cấu hình](#4-cài-đặt--cấu-hình)
5. [Khởi động Kafka bằng Docker](#5-khởi-động-kafka-bằng-docker)
6. [Chạy server](#6-chạy-server)
7. [Luồng hoạt động Webhook](#7-luồng-hoạt-động-webhook)
8. [Đăng ký nhận sự kiện từ Facebook](#8-đăng-ký-nhận-sự-kiện-từ-facebook)
9. [Danh sách API](#9-danh-sách-api)
10. [Schema chuẩn hóa sự kiện](#10-schema-chuẩn-hóa-sự-kiện)
11. [Kiểm tra luồng end-to-end](#11-kiểm-tra-luồng-end-to-end)
12. [Lấy Page Access Token](#12-lấy-page-access-token)

---

## 1. Kiến trúc hệ thống

```
Facebook Platform
      │
      │  HTTP POST (khi có comment / message mới)
      ▼
┌─────────────────────────────────────────────────┐
│              webhook-service (port 3001)         │
│                                                  │
│  GET  /webhook  ── Xác thực lần đầu (Challenge) │
│  POST /webhook                                   │
│    ├── 1. Trả 200 OK ngay lập tức               │
│    ├── 2. Xác thực X-Hub-Signature-256           │
│    ├── 3. Parse JSON payload                     │
│    ├── 4. Normalize → Unified Event Schema       │
│    └── 5. Publish → Kafka topic "raw_events"    │
└───────────────────────┬─────────────────────────┘
                        │
                        ▼
              ┌─────────────────┐
              │  Apache Kafka   │
              │  topic:         │
              │  raw_events     │
              └─────────────────┘
                        │
                        ▼
              (Consumer Service xử lý tiếp...)
```

---

## 2. Cấu trúc thư mục

```
facebook-page-api/
├── src/
│   ├── config/
│   │   ├── graph.js              # Cấu hình Facebook Graph API (base URL, token)
│   │   └── kafka.js              # Cấu hình Kafka (brokers, clientId, topic)
│   ├── middleware/
│   │   └── errorHandler.js       # Xử lý lỗi tập trung
│   ├── routes/
│   │   ├── page.js               # Routes /api/page/** (Graph API + subscription)
│   │   └── webhook.js            # Routes /webhook (GET verify + POST receive)
│   ├── services/
│   │   ├── graphService.js       # Gọi Facebook Graph API
│   │   ├── kafkaProducer.js      # Kafka Producer (connect / publish / disconnect)
│   │   └── subscriptionService.js # Đăng ký/hủy webhook subscription với Facebook
│   ├── utils/
│   │   └── normalizeEvent.js     # Chuẩn hóa payload → Unified Event Schema
│   └── index.js                  # Entry point Express
├── .env                          # Biến môi trường (KHÔNG commit lên git)
├── docker-compose.yml            # Kafka + Zookeeper + Kafka UI
├── package.json
└── swagger.yaml
```

---

## 3. Yêu cầu môi trường

| Phần mềm | Phiên bản tối thiểu |
|----------|---------------------|
| Node.js  | 18+                 |
| npm      | 9+                  |
| Docker Desktop | Bất kỳ (để chạy Kafka) |
| Tài khoản Meta Developer | Đã tạo App + Page |

---

## 4. Cài đặt & Cấu hình

### Bước 1 — Cài dependencies

```bash
cd facebook-page-api
npm install
```

### Bước 2 — Cấu hình file `.env`

File `.env` đã có sẵn. Bạn chỉ cần điền các giá trị thực của mình:

```env
PORT=3001

# ── Facebook Graph API ────────────────────────────────────────────────────────
PAGE_ACCESS_TOKEN=EAAxxxxxxxxxxxxxxxx      # Page Access Token từ Meta Developer
GRAPH_API_VERSION=v19.0

# ── Facebook Webhook ──────────────────────────────────────────────────────────
WEBHOOK_VERIFY_TOKEN=my_secure_verify_token_2024   # Token tự đặt (bạn muốn gì cũng được)
FACEBOOK_APP_SECRET=your_facebook_app_secret_here  # Lấy từ App > Settings > Basic

# ── Kafka ─────────────────────────────────────────────────────────────────────
KAFKA_BROKERS=localhost:9092
KAFKA_CLIENT_ID=facebook-page-api
KAFKA_TOPIC=raw_events
```

> **Lấy App Secret:** Meta for Developers → Chọn App → **Settings → Basic → App Secret → Show**

---

## 5. Khởi động Kafka bằng Docker

```bash
# Khởi động Kafka + Zookeeper + Kafka UI (chạy nền)
docker-compose up -d

# Kiểm tra trạng thái
docker-compose ps

# Xem log nếu cần
docker-compose logs -f kafka
```

Sau khi chạy xong:

| Service    | Địa chỉ                          |
|------------|----------------------------------|
| Kafka      | `localhost:9092`                 |
| Zookeeper  | `localhost:2181`                 |
| Kafka UI   | http://localhost:8080            |

> **Kafka UI** rất hữu ích để xem các message đã được publish vào topic `raw_events`.

Dừng Kafka khi không dùng:

```bash
docker-compose down
```

---

## 6. Chạy server

```bash
# Chế độ production
npm start

# Chế độ development (tự reload khi sửa file)
npm run dev
```

Server lắng nghe tại: **`http://localhost:3001`**

| URL | Mô tả |
|-----|-------|
| http://localhost:3001/docs | Swagger UI — tài liệu API |
| http://localhost:3001/webhook | Webhook endpoint |

Khi khởi động thành công, console hiển thị:

```
[Kafka] Producer đã kết nối. Topic: "raw_events"
Server đang chạy tại http://localhost:3001
Swagger UI:        http://localhost:3001/docs
Webhook endpoint:  http://localhost:3001/webhook
```

---

## 7. Luồng hoạt động Webhook

### Bước A — Expose server ra internet (dùng ngrok)

Facebook cần gọi được vào server của bạn từ internet. Dùng **ngrok** để tạo public URL:

```bash
# Cài ngrok: https://ngrok.com/download
ngrok http 3001
```

Bạn sẽ nhận được URL dạng:
```
Forwarding  https://abc123.ngrok-free.app -> http://localhost:3001
```

### Bước B — Cấu hình Webhook trên Meta Developer Dashboard

1. Vào [Meta for Developers](https://developers.facebook.com/) → Chọn App
2. Menu bên trái → **Webhooks**
3. Chọn **Page** → **Subscribe to this object**
4. Điền:
   - **Callback URL**: `https://abc123.ngrok-free.app/webhook`
   - **Verify Token**: Giá trị `WEBHOOK_VERIFY_TOKEN` trong `.env` của bạn
5. Nhấn **Verify and Save** — Facebook sẽ gọi `GET /webhook` để xác thực

### Bước C — Đăng ký nhận sự kiện bình luận

Sau khi verify webhook xong, gọi API để đăng ký page nhận events:

```bash
curl -X POST http://localhost:3001/api/page/{PAGE_ID}/subscribe \
  -H "Authorization: Bearer {PAGE_ACCESS_TOKEN}"
```

Từ đây, mỗi khi có bình luận mới trên page, Facebook sẽ gửi `POST /webhook` về server của bạn.

---

## 8. Đăng ký nhận sự kiện từ Facebook

Đây là bước **bắt buộc** — nếu bỏ qua, Facebook sẽ không gửi events dù webhook đã được verify.

### Đăng ký (Subscribe)

```
POST /api/page/:pageId/subscribe
Authorization: Bearer <Page_Access_Token>
```

```bash
curl -X POST http://localhost:3001/api/page/123456789/subscribe \
  -H "Authorization: Bearer EAAxxxxxx"
```

**Response thành công:**
```json
{
  "success": true,
  "message": "Đã đăng ký nhận webhook events cho page 123456789",
  "data": { "success": true }
}
```

### Kiểm tra trạng thái

```
GET /api/page/:pageId/subscription-status
Authorization: Bearer <Page_Access_Token>
```

### Hủy đăng ký

```
DELETE /api/page/:pageId/subscribe
Authorization: Bearer <Page_Access_Token>
```

---

## 9. Danh sách API

### Webhook Endpoints

| Method | Endpoint   | Mô tả |
|--------|------------|-------|
| GET    | `/webhook` | Facebook gọi để xác thực lần đầu (Challenge-Response) |
| POST   | `/webhook` | Facebook POST events vào đây (comment, message, …) |

### Page Management

| Method | Endpoint | Mô tả |
|--------|----------|-------|
| GET    | `/api/page/:pageId` | Thông tin cơ bản của Page |
| GET    | `/api/page/:pageId/posts` | Danh sách bài đăng |
| POST   | `/api/page/:pageId/posts` | Đăng bài mới |
| DELETE | `/api/page/post/:postId` | Xóa bài đăng |
| GET    | `/api/page/post/:postId/comments` | Lấy bình luận |
| GET    | `/api/page/post/:postId/likes` | Lấy lượt thích |
| GET    | `/api/page/:pageId/insights` | Thống kê page |

### Webhook Subscription

| Method | Endpoint | Mô tả |
|--------|----------|-------|
| POST   | `/api/page/:pageId/subscribe` | Đăng ký nhận webhook events |
| DELETE | `/api/page/:pageId/subscribe` | Hủy đăng ký |
| GET    | `/api/page/:pageId/subscription-status` | Kiểm tra trạng thái đăng ký |

> Mọi request đến `/api/page/**` cần header: `Authorization: Bearer <Page_Access_Token>`

---

## 10. Schema chuẩn hóa sự kiện

Dù Facebook gửi **Comment** hay **Message**, sau khi normalize đều ra cùng một schema:

```json
{
  "eventId":     "uuid-v4-tự-sinh",
  "type":        "comment | message | unknown",
  "pageId":      "ID của Facebook Page",
  "senderId":    "ID người gửi",
  "recipientId": "ID người nhận (page hoặc post)",
  "content":     "Nội dung bình luận / tin nhắn",
  "attachments": [],
  "postId":      "ID bài viết (chỉ có ở comment, null nếu là message)",
  "commentId":   "ID bình luận (chỉ có ở comment, null nếu là message)",
  "timestamp":   "2024-01-15T10:30:00.000Z",
  "receivedAt":  "2024-01-15T10:30:00.123Z",
  "raw":         { "...payload gốc từ Facebook..." }
}
```

**Ví dụ thực tế — Comment event:**
```json
{
  "eventId":     "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "type":        "comment",
  "pageId":      "123456789",
  "senderId":    "987654321",
  "recipientId": "123456789",
  "content":     "Bài viết hay quá!",
  "attachments": [],
  "postId":      "123456789_111222333",
  "commentId":   "444555666777",
  "timestamp":   "2024-01-15T10:30:00.000Z",
  "receivedAt":  "2024-01-15T10:30:00.123Z",
  "raw":         { "...raw Facebook payload..." }
}
```

---

## 11. Kiểm tra luồng end-to-end

### Cách 1 — Gửi test event giả (không cần Facebook thật)

```bash
curl -X POST http://localhost:3001/webhook \
  -H "Content-Type: application/json" \
  -d '{
    "object": "page",
    "entry": [
      {
        "id": "123456789",
        "time": 1704067200,
        "changes": [
          {
            "field": "feed",
            "value": {
              "item": "comment",
              "from": { "id": "987654321", "name": "Nguyễn Văn A" },
              "message": "Bài viết rất hay!",
              "post_id": "123456789_111222333",
              "comment_id": "444555666777",
              "created_time": 1704067200
            }
          }
        ]
      }
    ]
  }'
```

> **Lưu ý:** Nếu `FACEBOOK_APP_SECRET` chưa điền, server sẽ bỏ qua xác thực chữ ký và vẫn xử lý request (mode dev).

**Kết quả mong đợi:**
- Server trả về `{"status":"EVENT_RECEIVED"}`
- Console server hiển thị: `[Kafka] Đã publish event [comment] eventId=... → topic="raw_events"`
- Kafka UI tại http://localhost:8080 hiển thị message mới trong topic `raw_events`

### Cách 2 — Xem message trong Kafka UI

1. Mở http://localhost:8080
2. Chọn cluster `local-cluster`
3. Vào **Topics** → `raw_events`
4. Tab **Messages** → xem các sự kiện đã được publish

---

## 12. Lấy Page Access Token

1. Vào [Meta for Developers](https://developers.facebook.com/)
2. Chọn App → **Tools → Graph API Explorer**
3. Trong phần **User or Page**, chọn đúng Page của bạn
4. Thêm các permissions cần thiết:
   - `pages_read_engagement` — đọc bình luận, like
   - `pages_manage_posts` — đăng/xóa bài
   - `read_insights` — xem thống kê
   - `pages_manage_metadata` — đăng ký webhook subscription
5. Nhấn **Generate Access Token** và sao chép vào file `.env`

---

## Cấu trúc Response

**Thành công:**
```json
{
  "success": true,
  "data": { "..." }
}
```

**Lỗi:**
```json
{
  "success": false,
  "error": {
    "message": "Mô tả lỗi",
    "code": 100
  }
}
```
