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

## 4. Các task 1-7 đã cover
- **BE-01**: schema dữ liệu đầy đủ cho tests, sections, parts, questions, choices, attempts, answers, results, media assets
- **BE-02**: API danh sách đề có `keyword`, `status`, `sectionType`, `sortBy`, `pagination`
- **BE-03**: API chi tiết đề trả về toàn bộ cấu trúc section/part/question/choice + `resumeAttempt` nếu truyền `userId`
- **BE-04**: `start attempt` có cơ chế resume attempt đang làm; có thể `forceRestart`
- **BE-05**: `save answer` có validation question/choice thuộc đúng đề và hỗ trợ `remainingTimeSec`
- **BE-06**: API lấy attempt đang làm dang dở theo `userId + mockTestId`, ngoài ra vẫn giữ API snapshot theo `attemptId`
- **BE-07**: `submit attempt` chấm điểm, lưu kết quả và trả về idempotent response nếu đã submit trước đó

## 5. Database design chính
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

## 6. Upload API local storage
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

## 7. API mock test cơ bản
### Danh sách đề
`GET /api/mock-tests?page=1&limit=10&keyword=toeic&status=PUBLISHED&sectionType=LISTENING&sortBy=newest&userId=<user-id>`

### Chi tiết đề
`GET /api/mock-tests/:id?userId=<user-id>`

### Start attempt
`POST /api/attempts/start`
```json
{
  "userId": "...",
  "mockTestId": "...",
  "forceRestart": false
}
```

### Lấy attempt đang làm dang dở
`GET /api/attempts/in-progress?userId=<user-id>&mockTestId=<mock-test-id>`

### Lấy snapshot theo attemptId
`GET /api/attempts/:attemptId`

### Auto save answer
`PUT /api/attempts/:attemptId/answers`
```json
{
  "questionId": "...",
  "choiceId": "...",
  "remainingTimeSec": 7012
}
```

> Muốn clear đáp án, gửi `choiceId: null`.

### Submit bài
`POST /api/attempts/:attemptId/submit`

## 8. Seed data
`npm run seed` sẽ tạo:
- 1 user demo: `demo@toeic.local`
- 1 mock test published: `toeic-mock-test-01`
- 4 câu mẫu để test full luồng start → save → resume → submit

## 9. Gợi ý bước tiếp theo
- thêm auth JWT
- thêm admin CRUD đề thi
- import question từ Excel/JSON
- timer countdown chính xác hơn ở server
- scoring table TOEIC thật thay vì nhân hệ số đơn giản
- phân tách module service/repository rõ hơn
- thêm test integration cho attempt flow
