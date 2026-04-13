/**
 * e2e-scoring.ts
 * Chạy: npx tsx tests/e2e-scoring.ts
 *
 * Script này tự động:
 *  1. Lấy user + mockTest mới nhất từ DB
 *  2. Start attempt
 *  3. Gửi đáp án: câu 1 đúng, câu 2 sai, câu 3 đúng, câu 4 bỏ trống
 *  4. Submit
 *  5. Lấy lại result (GET /result)
 *  6. In kết quả ra console
 */

const BASE = 'http://localhost:8080/api';

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

async function api(method: string, path: string, body?: unknown) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json();
  if (!res.ok) throw new Error(`${method} ${path} → ${res.status}: ${JSON.stringify(json)}`);
  return json.data;
}

function label(correct: number, wrong: number, blank: number, total: number) {
  return `✅ ${correct}  ❌ ${wrong}  ⬜ ${blank}  (/${total})`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Lấy dữ liệu từ DB trực tiếp để biết questionId, choiceId
// ─────────────────────────────────────────────────────────────────────────────

import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function run() {
  // 1. Lấy user + mockTest
  const user     = await prisma.user.findFirstOrThrow({ orderBy: { createdAt: 'desc' } });
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

  const questions = mockTest.sections.flatMap((s) =>
    s.parts.flatMap((p) => p.questions),
  );

  console.log('\n══════════════════════════════════════════════════');
  console.log('  TOEIC Scoring Engine – E2E Test');
  console.log('══════════════════════════════════════════════════');
  console.log(`  User       : ${user.fullName} (${user.id})`);
  console.log(`  MockTest   : ${mockTest.title} (${mockTest.id})`);
  console.log(`  Questions  : ${questions.length} câu`);
  console.log('──────────────────────────────────────────────────\n');

  // 2. Start attempt
  const attempt = await api('POST', '/attempts/start', {
    userId: user.id,
    mockTestId: mockTest.id,
  });
  console.log(`[1] Started attempt: ${attempt.id}`);

  // 3. Gửi đáp án theo kịch bản:
  //    Q1 → ĐÚNG | Q2 → SAI | Q3 → ĐÚNG | Q4 → BỎ TRỐNG
  const scenarios: Array<{ q: (typeof questions)[0]; strategy: 'correct' | 'wrong' | 'blank' }> = [
    { q: questions[0]!, strategy: 'correct' },
    { q: questions[1]!, strategy: 'wrong'   },
    { q: questions[2]!, strategy: 'correct' },
    { q: questions[3]!, strategy: 'blank'   },
  ];

  console.log('\n[2] Gửi đáp án:');
  for (const { q, strategy } of scenarios) {
    if (strategy === 'blank') {
      console.log(`    ⬜  Q${q.questionNumber} "${q.stem.slice(0, 40)}..." → BỎ TRỐNG`);
      continue; // không gọi API → blank
    }

    const correctChoice = q.choices.find((c) => c.isCorrect)!;
    const wrongChoice   = q.choices.find((c) => !c.isCorrect)!;
    const chosenChoice  = strategy === 'correct' ? correctChoice : wrongChoice;
    const icon          = strategy === 'correct' ? '✅' : '❌';

    await api('PUT', `/attempts/${attempt.id}/answers`, {
      questionId: q.id,
      choiceId:   chosenChoice.id,
    });

    console.log(`    ${icon}  Q${q.questionNumber} "${q.stem.slice(0, 40)}..." → ${chosenChoice.label}. ${chosenChoice.content}`);
  }

  // 4. Submit
  console.log('\n[3] Submitting...');
  const submitResult = await api('POST', `/attempts/${attempt.id}/submit`);

  // 5. Lấy lại result qua GET endpoint
  console.log('[4] GET /result...\n');
  const getResult = await api('GET', `/attempts/${attempt.id}/result`);

  // 6. In kết quả
  console.log('══════════════════════════════════════════════════');
  console.log('  KẾT QUẢ TOÀN BÀI');
  console.log('══════════════════════════════════════════════════');
  console.log(`  Tổng điểm      : ${getResult.totalScore}`);
  console.log(`  Listening scaled: ${getResult.listeningScaled}`);
  console.log(`  Reading scaled  : ${getResult.readingScaled}`);
  console.log(`  Listening raw   : ${getResult.listeningRaw}`);
  console.log(`  Reading raw     : ${getResult.readingRaw}`);
  console.log(`  Đúng/Sai/Trống  : ${label(getResult.correctCount, getResult.wrongCount, getResult.blankCount, questions.length)}`);

  console.log('\n  BREAKDOWN – SECTION');
  console.log('──────────────────────────────────────────────────');
  for (const s of getResult.breakdown.sections) {
    console.log(`  [${s.type}] ${s.title}`);
    console.log(`    ${label(s.correctCount, s.wrongCount, s.blankCount, s.totalQuestions)}`);
  }

  console.log('\n  BREAKDOWN – PART');
  console.log('──────────────────────────────────────────────────');
  for (const p of getResult.breakdown.parts) {
    console.log(`  ${p.title}`);
    console.log(`    ${label(p.correctCount, p.wrongCount, p.blankCount, p.totalQuestions)}`);
  }

  // 7. Kiểm tra kỳ vọng
  console.log('\n══════════════════════════════════════════════════');
  console.log('  KIỂM TRA KỲ VỌNG');
  console.log('══════════════════════════════════════════════════');
  const expected = { correct: 2, wrong: 1, blank: 1 };
  const pass =
    getResult.correctCount === expected.correct &&
    getResult.wrongCount   === expected.wrong   &&
    getResult.blankCount   === expected.blank;

  console.log(`  Kỳ vọng: correct=2 wrong=1 blank=1`);
  console.log(`  Thực tế: correct=${getResult.correctCount} wrong=${getResult.wrongCount} blank=${getResult.blankCount}`);
  console.log(`  Kết quả: ${pass ? '✅ PASS' : '❌ FAIL'}\n`);

  // Verify submit vs getResult trả về nhất quán
  const consistent =
    submitResult.correctCount === getResult.correctCount &&
    submitResult.wrongCount   === getResult.wrongCount;
  console.log(`  Submit vs GET nhất quán: ${consistent ? '✅ PASS' : '❌ FAIL'}\n`);

  await prisma.$disconnect();
}

run().catch((err) => {
  console.error('\n❌ Error:', err.message);
  process.exit(1);
});
