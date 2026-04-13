/**
 * tests/postman-flow.ts
 *
 * Script mô phỏng đúng luồng test Postman:
 *   Bước 1 – GET  /mock-tests/:id        → xem cấu trúc đề thi
 *   Bước 2 – POST /attempts/start        → bắt đầu làm bài
 *   Bước 3 – PUT  /attempts/:id/answers  → lưu đáp án (3 câu, 1 bỏ trống)
 *   Bước 4 – POST /attempts/:id/submit   → nộp bài (scoring chạy tại đây)
 *   Bước 5 – GET  /attempts/:id/result   → xem lại kết quả từ DB
 *   Bước 6 – Kiểm tra kỳ vọng PASS/FAIL
 *
 * Chạy: npx tsx tests/postman-flow.ts
 * Yêu cầu: server đang chạy tại http://localhost:8080
 */

import { PrismaClient } from '@prisma/client';

const BASE   = 'http://localhost:8080/api';
const prisma = new PrismaClient();

// ─────────────────────────────────────────────────────────────────────────────
// Helpers hiển thị
// ─────────────────────────────────────────────────────────────────────────────

function header(title: string) {
  console.log('\n' + '═'.repeat(60));
  console.log(`  ${title}`);
  console.log('═'.repeat(60));
}

function subheader(title: string) {
  console.log('\n' + '─'.repeat(60));
  console.log(`  ${title}`);
  console.log('─'.repeat(60));
}

function printInput(method: string, url: string, body?: unknown) {
  console.log(`\n  ▶ ĐẦU VÀO`);
  console.log(`    ${method} ${url}`);
  if (body !== undefined) {
    console.log(`    Body: ${JSON.stringify(body, null, 2).replace(/\n/g, '\n    ')}`);
  }
}

function printOutput(data: unknown) {
  console.log(`\n  ◀ ĐẦU RA`);
  console.log('    ' + JSON.stringify(data, null, 2).replace(/\n/g, '\n    '));
}

// ─────────────────────────────────────────────────────────────────────────────
// Gọi API
// ─────────────────────────────────────────────────────────────────────────────

async function api<T = unknown>(method: string, path: string, body?: unknown): Promise<T> {
  const url = `${BASE}${path}`;
  const res = await fetch(url, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const json = await res.json() as { data: T };
  if (!res.ok) throw new Error(`${method} ${path} → HTTP ${res.status}: ${JSON.stringify(json)}`);
  return json.data;
}

// ─────────────────────────────────────────────────────────────────────────────
// Main
// ─────────────────────────────────────────────────────────────────────────────

async function run() {
  header('TOEIC Scoring – Postman Flow Script');

  // ── Bước 0: Lấy dữ liệu từ DB ──────────────────────────────────────────
  subheader('BƯỚC 0 – Lấy dữ liệu từ DB (không gọi API)');

  const user = await prisma.user.findFirstOrThrow({ orderBy: { createdAt: 'desc' } });

  const mockTest = await prisma.mockTest.findFirstOrThrow({
    where: { status: 'PUBLISHED' },
    orderBy: { createdAt: 'desc' },
    include: {
      sections: {
        orderBy: { orderNo: 'asc' },
        include: {
          parts: {
            orderBy: { orderNo: 'asc' },
            include: {
              questions: {
                orderBy: { orderNo: 'asc' },
                include: { choices: true },
              },
            },
          },
        },
      },
    },
  });

  const allQuestions = mockTest.sections.flatMap((s) =>
    s.parts.flatMap((p) =>
      p.questions.map((q) => ({
        ...q,
        sectionType: s.type,
        partTitle:   p.title,
      })),
    ),
  );

  console.log(`\n  userId     : ${user.id}  (${user.fullName})`);
  console.log(`  mockTestId : ${mockTest.id}  (${mockTest.title})`);
  console.log(`  Tổng câu   : ${allQuestions.length}\n`);

  for (const q of allQuestions) {
    const correct = q.choices.find((c) => c.isCorrect);
    const wrong   = q.choices.find((c) => !c.isCorrect);
    console.log(`  [${q.sectionType}] Q${q.questionNumber} – ${q.stem}`);
    console.log(`    ✅ Đúng : ${correct?.label}. ${correct?.content}  (id: ${correct?.id})`);
    console.log(`    ❌ Sai  : ${wrong?.label}. ${wrong?.content}  (id: ${wrong?.id})`);
  }

  // ── Bước 1: GET /mock-tests/:id ─────────────────────────────────────────
  subheader('BƯỚC 1 – GET /mock-tests/:id  →  xem cấu trúc đề thi');
  console.log('  Giải thích: Lấy toàn bộ cấu trúc đề thi để biết questionId và choiceId');

  const url1 = `/mock-tests/${mockTest.id}`;
  printInput('GET', `${BASE}${url1}`);

  const testDetail = await api<typeof mockTest>(`GET`, url1);
  console.log('\n  ◀ ĐẦU RA (tóm tắt)');
  console.log(`    title          : ${(testDetail as any).title}`);
  console.log(`    totalQuestions : ${(testDetail as any).totalQuestions}`);
  console.log(`    status         : ${(testDetail as any).status}`);
  console.log(`    sections       : ${(testDetail as any).sections.length} section(s)`);

  // ── Bước 2: POST /attempts/start ────────────────────────────────────────
  subheader('BƯỚC 2 – POST /attempts/start  →  bắt đầu làm bài');
  console.log('  Giải thích: Tạo 1 lượt thi mới, trạng thái IN_PROGRESS, bắt đầu đếm giờ');

  const startBody = { userId: user.id, mockTestId: mockTest.id };
  printInput('POST', `${BASE}/attempts/start`, startBody);

  const attempt = await api<{ id: string; status: string; remainingTimeSec: number }>(
    'POST', '/attempts/start', startBody,
  );

  printOutput({
    id:               attempt.id,
    status:           attempt.status,
    remainingTimeSec: attempt.remainingTimeSec,
  });
  console.log('\n  → Lưu lại attemptId:', attempt.id);

  // ── Bước 3: Lưu đáp án ──────────────────────────────────────────────────
  subheader('BƯỚC 3 – PUT /attempts/:id/answers  →  lưu đáp án từng câu');
  console.log('  Kịch bản: Q1 ✅ đúng | Q2 ❌ sai | Q3 ✅ đúng | Q4 ⬜ bỏ trống\n');

  const [q1, q2, q3] = allQuestions;

  // 3A — Q1 đúng
  const q1Correct = q1!.choices.find((c) => c.isCorrect)!;
  const body3A = { questionId: q1!.id, choiceId: q1Correct.id };
  console.log(`  [3A] Q${q1!.questionNumber} – "${q1!.stem}"`);
  console.log(`       Chọn: ${q1Correct.label}. ${q1Correct.content}  ✅ (đáp án đúng)`);
  printInput('PUT', `${BASE}/attempts/${attempt.id}/answers`, body3A);
  const ans3A = await api('PUT', `/attempts/${attempt.id}/answers`, body3A);
  console.log('  ◀ ĐẦU RA:', JSON.stringify(ans3A));

  // 3B — Q2 sai
  const q2Wrong = q2!.choices.find((c) => !c.isCorrect)!;
  const body3B  = { questionId: q2!.id, choiceId: q2Wrong.id };
  console.log(`\n  [3B] Q${q2!.questionNumber} – "${q2!.stem}"`);
  console.log(`       Chọn: ${q2Wrong.label}. ${q2Wrong.content}  ❌ (sai, đúng là ${q2!.choices.find((c) => c.isCorrect)?.label})`);
  printInput('PUT', `${BASE}/attempts/${attempt.id}/answers`, body3B);
  const ans3B = await api('PUT', `/attempts/${attempt.id}/answers`, body3B);
  console.log('  ◀ ĐẦU RA:', JSON.stringify(ans3B));

  // 3C — Q3 đúng
  const q3Correct = q3!.choices.find((c) => c.isCorrect)!;
  const body3C    = { questionId: q3!.id, choiceId: q3Correct.id };
  console.log(`\n  [3C] Q${q3!.questionNumber} – "${q3!.stem}"`);
  console.log(`       Chọn: ${q3Correct.label}. ${q3Correct.content}  ✅ (đáp án đúng)`);
  printInput('PUT', `${BASE}/attempts/${attempt.id}/answers`, body3C);
  const ans3C = await api('PUT', `/attempts/${attempt.id}/answers`, body3C);
  console.log('  ◀ ĐẦU RA:', JSON.stringify(ans3C));

  // 3D — Q4 bỏ trống
  console.log(`\n  [3D] Q${allQuestions[3]!.questionNumber} – "${allQuestions[3]!.stem}"`);
  console.log(`       ⬜ BỎ TRỐNG – không gọi API cho câu này`);
  console.log('       → Server sẽ tính câu này là blank khi submit');

  // ── Bước 4: Submit ───────────────────────────────────────────────────────
  subheader('BƯỚC 4 – POST /attempts/:id/submit  →  nộp bài + tính điểm');
  console.log('  Giải thích: Server chạy calculateRawScore() rồi toScaledScore()');
  console.log('  Không cần body – chỉ cần attemptId trên URL');

  printInput('POST', `${BASE}/attempts/${attempt.id}/submit`);

  const result = await api<{
    totalScore:       number;
    listeningScaled:  number;
    readingScaled:    number;
    listeningRaw:     number;
    readingRaw:       number;
    correctCount:     number;
    wrongCount:       number;
    blankCount:       number;
    listeningBlank:   number;
    readingBlank:     number;
    breakdown:        { sections: unknown[]; parts: unknown[] };
  }>('POST', `/attempts/${attempt.id}/submit`);

  console.log('\n  ◀ ĐẦU RA – Kết quả scoring:');
  console.log('\n  ┌─ calculateRawScore() ────────────────────────────────');
  console.log(`  │  correctCount   = ${result.correctCount}   (số câu đúng toàn bài)`);
  console.log(`  │  wrongCount     = ${result.wrongCount}   (số câu sai toàn bài)`);
  console.log(`  │  blankCount     = ${result.blankCount}   (số câu bỏ trống)`);
  console.log(`  │  listeningRaw   = ${result.listeningRaw}   (câu đúng phần Listening)`);
  console.log(`  │  readingRaw     = ${result.readingRaw}   (câu đúng phần Reading)`);
  console.log(`  │  listeningBlank = ${result.listeningBlank}   (bỏ trống phần Listening)`);
  console.log(`  │  readingBlank   = ${result.readingBlank}   (bỏ trống phần Reading)`);
  console.log('  ├─ toScaledScore() ───────────────────────────────────');
  console.log(`  │  listeningScaled = ${result.listeningScaled}   (điểm Listening quy đổi 5–495)`);
  console.log(`  │  readingScaled   = ${result.readingScaled}   (điểm Reading quy đổi 5–495)`);
  console.log(`  │  totalScore      = ${result.totalScore}   (tổng điểm TOEIC 10–990)`);
  console.log('  └──────────────────────────────────────────────────────');

  console.log('\n  ◀ BREAKDOWN – theo Section:');
  for (const s of result.breakdown.sections as any[]) {
    console.log(`    [${s.type}] ${s.title}: ✅${s.correctCount} ❌${s.wrongCount} ⬜${s.blankCount} / ${s.totalQuestions} câu`);
  }

  console.log('\n  ◀ BREAKDOWN – theo Part:');
  for (const p of result.breakdown.parts as any[]) {
    console.log(`    ${p.title}: ✅${p.correctCount} ❌${p.wrongCount} ⬜${p.blankCount} / ${p.totalQuestions} câu`);
  }

  // ── Bước 5: GET result ───────────────────────────────────────────────────
  subheader('BƯỚC 5 – GET /attempts/:id/result  →  xem lại kết quả từ DB');
  console.log('  Giải thích: Xác nhận dữ liệu đã được lưu đúng vào database');

  printInput('GET', `${BASE}/attempts/${attempt.id}/result`);

  const getResult = await api<typeof result>('GET', `/attempts/${attempt.id}/result`);

  const consistent =
    getResult.totalScore      === result.totalScore &&
    getResult.correctCount    === result.correctCount &&
    getResult.listeningScaled === result.listeningScaled;

  console.log(`\n  ◀ ĐẦU RA: totalScore=${getResult.totalScore}, correctCount=${getResult.correctCount}`);
  console.log(`  DB nhất quán với Submit: ${consistent ? '✅ PASS' : '❌ FAIL'}`);

  // ── Bước 6: Kiểm tra kỳ vọng ────────────────────────────────────────────
  subheader('BƯỚC 6 – Kiểm tra kỳ vọng');
  console.log('  Kịch bản: Q1✅ Q2❌ Q3✅ Q4⬜  →  đúng=2, sai=1, blank=1');
  console.log('            listeningRaw=1, readingRaw=1\n');

  type Check = { label: string; actual: number; expected: number };
  const checks: Check[] = [
    { label: 'correctCount',   actual: result.correctCount,   expected: 2 },
    { label: 'wrongCount',     actual: result.wrongCount,     expected: 1 },
    { label: 'blankCount',     actual: result.blankCount,     expected: 1 },
    { label: 'listeningRaw',   actual: result.listeningRaw,   expected: 1 },
    { label: 'readingRaw',     actual: result.readingRaw,     expected: 1 },
    { label: 'listeningBlank', actual: result.listeningBlank, expected: 0 },
    { label: 'readingBlank',   actual: result.readingBlank,   expected: 1 },
  ];

  let allPass = true;
  for (const c of checks) {
    const pass = c.actual === c.expected;
    if (!pass) allPass = false;
    const icon   = pass ? '✅' : '❌';
    const note   = pass ? '' : `  ← kỳ vọng ${c.expected}`;
    console.log(`  ${icon}  ${c.label.padEnd(16)} = ${c.actual}${note}`);
  }

  console.log('\n' + '═'.repeat(60));
  console.log(`  KẾT QUẢ CUỐI: ${allPass ? '✅ TẤT CẢ PASS' : '❌ CÓ TEST FAIL'}`);
  console.log('═'.repeat(60) + '\n');

  await prisma.$disconnect();
}

run().catch(async (err) => {
  console.error('\n❌ LỖI:', err.message);
  await prisma.$disconnect();
  process.exit(1);
});
