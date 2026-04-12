# TOEIC Mock Test Backend - Node.js + Express + Local Storage

Project scaffold cho BE web mock test TOEIC theo hướng **Node.js + Express**, lưu **audio/image bằng local storage** và metadata trong DB.

## 1. Stack
- Node.js + Express + TypeScript
- Prisma ORM
- SQLite cho local dev nhanh
- Multer để upload file
- Local storage tại `storage/uploads/audio` và `storage/uploads/images`

> Khi lên production, bạn có thể giữ nguyên API upload và đổi DB sang PostgreSQL/MySQL, còn file storage có thể chuyển sang S3.

## 2. Cài thư viện
```bash
npm install
cp .env.example .env
npm run prisma:generate
npm run prisma:migrate
npm run seed
npm run dev
```

## 3. Cấu trúc thư mục
```bash
src/
  config/
  controllers/
  middlewares/
  routes/
  services/
  utils/
prisma/
storage/uploads/
  audio/
  images/
```

## 4. Database design chính
- `users`: người dùng
- `mock_tests`: đề thi
- `sections`: Listening / Reading
- `parts`: từng part trong section
- `questions`: câu hỏi
- `choices`: đáp án A/B/C/D
- `attempts`: phiên làm bài
- `attempt_answers`: đáp án user chọn
- `results`: kết quả chấm điểm
- `media_assets`: metadata file audio/image local

## 5. Upload API local storage
### Upload audio
```bash
curl --location 'http://localhost:8080/api/uploads/audio' \
--form 'file=@"./sample.mp3"' \
--form 'partId="<part-id>"'
```

### Upload image
```bash
curl --location 'http://localhost:8080/api/uploads/images' \
--form 'file=@"./sample.png"' \
--form 'questionId="<question-id>"'
```

Response sẽ trả:
- metadata file trong DB
- `publicUrl` để FE render trực tiếp

Ví dụ public URL:
```text
http://localhost:8080/storage/uploads/audio/1712345678-sample.mp3
```

## 6. API mock test cơ bản
### Danh sách đề
- `GET /api/mock-tests`

### Chi tiết đề
- `GET /api/mock-tests/:id`

### Start attempt
- `POST /api/attempts/start`
```json
{
  "userId": "...",
  "mockTestId": "..."
}
```

### Auto save answer
- `PUT /api/attempts/:attemptId/answers`
```json
{
  "questionId": "...",
  "choiceId": "..."
}
```

### Lấy snapshot để resume
- `GET /api/attempts/:attemptId`

### Submit bài
- `POST /api/attempts/:attemptId/submit`

## 7. Mapping với backlog BE
- BE-01: schema dữ liệu
- BE-02: API danh sách đề
- BE-03: API chi tiết đề
- BE-04: start attempt
- BE-05: realtime answer save
- BE-06: resume snapshot
- BE-07: submit bài
- BE-08 + BE-09: scoring raw + scaled bản MVP

## 8. Gợi ý bước tiếp theo
- thêm auth JWT
- thêm admin CRUD đề thi
- import question từ Excel/JSON
- timer countdown chính xác hơn
- scoring table TOEIC thật thay vì nhân hệ số đơn giản
- phân tách module service/repository rõ hơn
# BE_web_toeic
# BE_web_toeic
# BE_web_toeic
# BE_web_toeic
