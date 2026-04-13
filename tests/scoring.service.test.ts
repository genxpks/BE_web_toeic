import { describe, it, expect } from 'vitest';
import { SectionType } from '@prisma/client';
import {
  calculateRawScore,
  toScaledScore,
  LISTENING_SCALE,
  READING_SCALE,
  SectionSnapshot,
} from '../src/services/scoring.service.js';


// ---------------------------------------------------------------------------
// Fixture helpers
// ---------------------------------------------------------------------------

function makeSection(
  id: string,
  type: SectionType,
  parts: { id: string; questions: { id: string; correctChoiceId: string }[] }[],
): SectionSnapshot {
  return {
    id,
    type,
    title: type === SectionType.LISTENING ? 'Listening' : 'Reading',
    parts: parts.map((p) => ({
      id: p.id,
      title: `Part ${p.id}`,
      questions: p.questions.map((q) => ({
        id: q.id,
        choices: [
          { id: 'wrong-A', isCorrect: false },
          { id: q.correctChoiceId, isCorrect: true },
        ],
      })),
    })),
  };
}

// ---------------------------------------------------------------------------
// Test suites
// ---------------------------------------------------------------------------

describe('calculateRawScore – overall', () => {
  it('tất cả đúng', () => {
    const sections: SectionSnapshot[] = [
      makeSection('s1', SectionType.LISTENING, [
        { id: 'p1', questions: [{ id: 'q1', correctChoiceId: 'c1' }] },
      ]),
      makeSection('s2', SectionType.READING, [
        { id: 'p2', questions: [{ id: 'q2', correctChoiceId: 'c2' }] },
      ]),
    ];

    const answers = new Map([
      ['q1', 'c1'], // đúng – listening
      ['q2', 'c2'], // đúng – reading
    ]);

    const { overall } = calculateRawScore(sections, answers);

    expect(overall.correctCount).toBe(2);
    expect(overall.wrongCount).toBe(0);
    expect(overall.blankCount).toBe(0);
    expect(overall.totalQuestions).toBe(2);
    expect(overall.listeningRaw).toBe(1);
    expect(overall.readingRaw).toBe(1);
  });

  it('tất cả sai', () => {
    const sections: SectionSnapshot[] = [
      makeSection('s1', SectionType.LISTENING, [
        { id: 'p1', questions: [{ id: 'q1', correctChoiceId: 'c1' }] },
      ]),
    ];

    const answers = new Map([['q1', 'wrong-A']]);

    const { overall } = calculateRawScore(sections, answers);

    expect(overall.correctCount).toBe(0);
    expect(overall.wrongCount).toBe(1);
    expect(overall.blankCount).toBe(0);
    expect(overall.listeningRaw).toBe(0);
  });

  it('tất cả bỏ trống (null)', () => {
    const sections: SectionSnapshot[] = [
      makeSection('s1', SectionType.READING, [
        { id: 'p1', questions: [{ id: 'q1', correctChoiceId: 'c1' }] },
      ]),
    ];

    const answers = new Map<string, string | null>([['q1', null]]);

    const { overall } = calculateRawScore(sections, answers);

    expect(overall.blankCount).toBe(1);
    expect(overall.correctCount).toBe(0);
    expect(overall.wrongCount).toBe(0);
  });

  it('câu chưa có trong map → bỏ trống (undefined)', () => {
    const sections: SectionSnapshot[] = [
      makeSection('s1', SectionType.READING, [
        { id: 'p1', questions: [{ id: 'q1', correctChoiceId: 'c1' }] },
      ]),
    ];

    // q1 không có trong map → undefined
    const answers = new Map<string, string | null>();

    const { overall } = calculateRawScore(sections, answers);

    expect(overall.blankCount).toBe(1);
  });

  it('hỗn hợp: đúng + sai + bỏ trống', () => {
    const sections: SectionSnapshot[] = [
      makeSection('s1', SectionType.LISTENING, [
        {
          id: 'p1',
          questions: [
            { id: 'q1', correctChoiceId: 'c1' }, // đúng
            { id: 'q2', correctChoiceId: 'c2' }, // sai
            { id: 'q3', correctChoiceId: 'c3' }, // bỏ trống
          ],
        },
      ]),
    ];

    const answers = new Map<string, string | null>([
      ['q1', 'c1'],       // đúng
      ['q2', 'wrong-A'],  // sai
      ['q3', null],       // bỏ trống
    ]);

    const { overall } = calculateRawScore(sections, answers);

    expect(overall.correctCount).toBe(1);
    expect(overall.wrongCount).toBe(1);
    expect(overall.blankCount).toBe(1);
    expect(overall.totalQuestions).toBe(3);
    expect(overall.listeningRaw).toBe(1);
  });
});

describe('calculateRawScore – breakdown section', () => {
  it('phân biệt đúng sai theo từng section', () => {
    const sections: SectionSnapshot[] = [
      makeSection('s-listen', SectionType.LISTENING, [
        { id: 'p1', questions: [{ id: 'q1', correctChoiceId: 'c1' }] },
      ]),
      makeSection('s-read', SectionType.READING, [
        { id: 'p2', questions: [{ id: 'q2', correctChoiceId: 'c2' }] },
      ]),
    ];

    const answers = new Map([
      ['q1', 'c1'],       // đúng – listening
      ['q2', 'wrong-A'],  // sai  – reading
    ]);

    const { sections: sectionScores } = calculateRawScore(sections, answers);

    const listening = sectionScores.find((s) => s.sectionId === 's-listen')!;
    expect(listening.correctCount).toBe(1);
    expect(listening.wrongCount).toBe(0);

    const reading = sectionScores.find((s) => s.sectionId === 's-read')!;
    expect(reading.correctCount).toBe(0);
    expect(reading.wrongCount).toBe(1);
  });
});

describe('calculateRawScore – breakdown part', () => {
  it('mỗi part được tính riêng biệt', () => {
    const sections: SectionSnapshot[] = [
      makeSection('s1', SectionType.READING, [
        { id: 'p1', questions: [{ id: 'q1', correctChoiceId: 'c1' }] }, // đúng
        { id: 'p2', questions: [{ id: 'q2', correctChoiceId: 'c2' }] }, // bỏ trống
      ]),
    ];

    const answers = new Map<string, string | null>([
      ['q1', 'c1'],
      ['q2', null],
    ]);

    const { parts } = calculateRawScore(sections, answers);

    const part1 = parts.find((p) => p.partId === 'p1')!;
    expect(part1.correctCount).toBe(1);
    expect(part1.blankCount).toBe(0);

    const part2 = parts.find((p) => p.partId === 'p2')!;
    expect(part2.correctCount).toBe(0);
    expect(part2.blankCount).toBe(1);
  });

  it('totalQuestions của part = số câu trong part', () => {
    const sections: SectionSnapshot[] = [
      makeSection('s1', SectionType.LISTENING, [
        {
          id: 'p1',
          questions: [
            { id: 'q1', correctChoiceId: 'c1' },
            { id: 'q2', correctChoiceId: 'c2' },
            { id: 'q3', correctChoiceId: 'c3' },
          ],
        },
      ]),
    ];

    const { parts } = calculateRawScore(sections, new Map());

    expect(parts[0]!.totalQuestions).toBe(3);
  });
});

describe('calculateRawScore – listeningBlank / readingBlank', () => {
  it('bỏ trống câu Listening → listeningBlank tăng, readingBlank không đổi', () => {
    const sections: SectionSnapshot[] = [
      makeSection('s1', SectionType.LISTENING, [
        { id: 'p1', questions: [{ id: 'q1', correctChoiceId: 'c1' }] },
      ]),
    ];

    const answers = new Map<string, string | null>([['q1', null]]);
    const { overall } = calculateRawScore(sections, answers);

    expect(overall.listeningBlank).toBe(1);
    expect(overall.readingBlank).toBe(0);
    expect(overall.blankCount).toBe(1);
  });

  it('bỏ trống câu Reading → readingBlank tăng, listeningBlank không đổi', () => {
    const sections: SectionSnapshot[] = [
      makeSection('s1', SectionType.READING, [
        { id: 'p1', questions: [{ id: 'q1', correctChoiceId: 'c1' }] },
      ]),
    ];

    const answers = new Map<string, string | null>([['q1', null]]);
    const { overall } = calculateRawScore(sections, answers);

    expect(overall.readingBlank).toBe(1);
    expect(overall.listeningBlank).toBe(0);
    expect(overall.blankCount).toBe(1);
  });

  it('listeningBlank + readingBlank = blankCount (khi có cả hai)', () => {
    const sections: SectionSnapshot[] = [
      makeSection('s1', SectionType.LISTENING, [
        { id: 'p1', questions: [{ id: 'q1', correctChoiceId: 'c1' }, { id: 'q2', correctChoiceId: 'c2' }] },
      ]),
      makeSection('s2', SectionType.READING, [
        { id: 'p2', questions: [{ id: 'q3', correctChoiceId: 'c3' }] },
      ]),
    ];

    const answers = new Map<string, string | null>([
      ['q1', null], // listening blank
      ['q2', 'c2'], // listening đúng
      ['q3', null], // reading blank
    ]);

    const { overall } = calculateRawScore(sections, answers);

    expect(overall.listeningBlank).toBe(1);
    expect(overall.readingBlank).toBe(1);
    expect(overall.blankCount).toBe(overall.listeningBlank + overall.readingBlank);
  });

  it('không bỏ trống câu nào → cả hai bằng 0', () => {
    const sections: SectionSnapshot[] = [
      makeSection('s1', SectionType.LISTENING, [
        { id: 'p1', questions: [{ id: 'q1', correctChoiceId: 'c1' }] },
      ]),
      makeSection('s2', SectionType.READING, [
        { id: 'p2', questions: [{ id: 'q2', correctChoiceId: 'c2' }] },
      ]),
    ];

    const answers = new Map([['q1', 'c1'], ['q2', 'c2']]);
    const { overall } = calculateRawScore(sections, answers);

    expect(overall.listeningBlank).toBe(0);
    expect(overall.readingBlank).toBe(0);
  });
});

describe('calculateRawScore – bài thi rỗng', () => {
  it('không có section → overall về 0', () => {
    const { overall, sections, parts } = calculateRawScore([], new Map());

    expect(overall.totalQuestions).toBe(0);
    expect(overall.correctCount).toBe(0);
    expect(sections).toHaveLength(0);
    expect(parts).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// toScaledScore – bảng quy đổi scaled score
// ---------------------------------------------------------------------------

describe('toScaledScore – biên', () => {
  it('raw = 0 → scaled = 5 (điểm tối thiểu TOEIC)', () => {
    const { listeningScaled, readingScaled, totalScore } = toScaledScore(0, 0);
    expect(listeningScaled).toBe(5);
    expect(readingScaled).toBe(5);
    expect(totalScore).toBe(10);
  });

  it('raw = 100 → scaled = 495 (điểm tối đa)', () => {
    const { listeningScaled, readingScaled, totalScore } = toScaledScore(100, 100);
    expect(listeningScaled).toBe(495);
    expect(readingScaled).toBe(495);
    expect(totalScore).toBe(990);
  });

  it('totalScore = listeningScaled + readingScaled', () => {
    const { listeningScaled, readingScaled, totalScore } = toScaledScore(60, 40);
    expect(totalScore).toBe(listeningScaled + readingScaled);
  });
});

describe('toScaledScore – điểm neo (anchor points)', () => {
  it('Listening: các điểm neo khớp lookup table', () => {
    const anchors: [number, number][] = [
      [0, 5], [10, 55], [20, 110], [30, 165], [40, 220],
      [50, 265], [60, 310], [70, 355], [80, 395], [90, 440], [100, 495],
    ];
    for (const [raw, expected] of anchors) {
      expect(LISTENING_SCALE[raw], `Listening raw=${raw}`).toBe(expected);
    }
  });

  it('Reading: các điểm neo khớp lookup table', () => {
    const anchors: [number, number][] = [
      [0, 5], [10, 30], [20, 65], [30, 105], [40, 150],
      [50, 200], [60, 250], [70, 300], [80, 350], [90, 400], [100, 495],
    ];
    for (const [raw, expected] of anchors) {
      expect(READING_SCALE[raw], `Reading raw=${raw}`).toBe(expected);
    }
  });

  it('Listening raw=50 → 265, Reading raw=50 → 200', () => {
    const { listeningScaled, readingScaled } = toScaledScore(50, 50);
    expect(listeningScaled).toBe(265);
    expect(readingScaled).toBe(200);
  });
});

describe('toScaledScore – clamp ngoài biên', () => {
  it('raw > 100 → clamp về 495', () => {
    const { listeningScaled, readingScaled } = toScaledScore(150, 999);
    expect(listeningScaled).toBe(495);
    expect(readingScaled).toBe(495);
  });

  it('raw < 0 → clamp về 5', () => {
    const { listeningScaled, readingScaled } = toScaledScore(-5, -1);
    expect(listeningScaled).toBe(5);
    expect(readingScaled).toBe(5);
  });
});

describe('toScaledScore – lookup tables có đúng 101 phần tử', () => {
  it('LISTENING_SCALE có 101 phần tử', () => {
    expect(LISTENING_SCALE).toHaveLength(101);
  });

  it('READING_SCALE có 101 phần tử', () => {
    expect(READING_SCALE).toHaveLength(101);
  });

  it('LISTENING_SCALE tăng đơn điệu (mỗi bước ≥ 0)', () => {
    for (let i = 1; i < LISTENING_SCALE.length; i++) {
      expect(LISTENING_SCALE[i]! >= LISTENING_SCALE[i - 1]!).toBe(true);
    }
  });

  it('READING_SCALE tăng đơn điệu (mỗi bước ≥ 0)', () => {
    for (let i = 1; i < READING_SCALE.length; i++) {
      expect(READING_SCALE[i]! >= READING_SCALE[i - 1]!).toBe(true);
    }
  });
});

// ---------------------------------------------------------------------------
// KỊCH BẢN THỰC TẾ
//
// Bối cảnh: Thí sinh làm bài TOEIC gồm 2 section:
//   - Listening: 4 câu (Part 1 và Part 2, mỗi part 2 câu)
//   - Reading  : 4 câu (Part 5, 4 câu)
//
// Kết quả làm bài:
//   Listening
//     Part 1 – Q1: đúng  | Q2: sai
//     Part 2 – Q3: đúng  | Q4: bỏ trống
//   Reading
//     Part 5 – Q5: đúng  | Q6: đúng | Q7: sai | Q8: bỏ trống
//
// Kỳ vọng calculateRawScore():
//   overall.correctCount  = 4  (Q1, Q3, Q5, Q6)
//   overall.wrongCount    = 2  (Q2, Q7)
//   overall.blankCount    = 2  (Q4, Q8)
//   overall.listeningRaw  = 2  (Q1, Q3 đúng trong Listening)
//   overall.readingRaw    = 2  (Q5, Q6 đúng trong Reading)
//   overall.listeningBlank= 1  (Q4)
//   overall.readingBlank  = 1  (Q8)
//
// Kỳ vọng toScaledScore(listeningRaw=2, readingRaw=2):
//   listeningScaled = LISTENING_SCALE[2] = 15
//   readingScaled   = READING_SCALE[2]   = 10
//   totalScore      = 15 + 10            = 25
// ---------------------------------------------------------------------------

describe('KỊCH BẢN THỰC TẾ – thí sinh làm bài TOEIC 8 câu', () => {
  //
  // ── Dựng dữ liệu đề thi ────────────────────────────────────────────────
  //
  // Mỗi question có 2 lựa chọn:
  //   { id: 'qN-correct', isCorrect: true  }  ← đáp án đúng
  //   { id: 'qN-wrong',   isCorrect: false }  ← đáp án sai
  //
  const sections: SectionSnapshot[] = [
    {
      id: 'sec-listening',
      type: SectionType.LISTENING,
      title: 'Listening',
      parts: [
        {
          id: 'part-1',
          title: 'Part 1 – Photographs',
          questions: [
            { id: 'q1', choices: [{ id: 'q1-correct', isCorrect: true }, { id: 'q1-wrong', isCorrect: false }] },
            { id: 'q2', choices: [{ id: 'q2-correct', isCorrect: true }, { id: 'q2-wrong', isCorrect: false }] },
          ],
        },
        {
          id: 'part-2',
          title: 'Part 2 – Question-Response',
          questions: [
            { id: 'q3', choices: [{ id: 'q3-correct', isCorrect: true }, { id: 'q3-wrong', isCorrect: false }] },
            { id: 'q4', choices: [{ id: 'q4-correct', isCorrect: true }, { id: 'q4-wrong', isCorrect: false }] },
          ],
        },
      ],
    },
    {
      id: 'sec-reading',
      type: SectionType.READING,
      title: 'Reading',
      parts: [
        {
          id: 'part-5',
          title: 'Part 5 – Incomplete Sentences',
          questions: [
            { id: 'q5', choices: [{ id: 'q5-correct', isCorrect: true }, { id: 'q5-wrong', isCorrect: false }] },
            { id: 'q6', choices: [{ id: 'q6-correct', isCorrect: true }, { id: 'q6-wrong', isCorrect: false }] },
            { id: 'q7', choices: [{ id: 'q7-correct', isCorrect: true }, { id: 'q7-wrong', isCorrect: false }] },
            { id: 'q8', choices: [{ id: 'q8-correct', isCorrect: true }, { id: 'q8-wrong', isCorrect: false }] },
          ],
        },
      ],
    },
  ];

  //
  // ── Dựng đáp án thí sinh ───────────────────────────────────────────────
  //
  // Listening
  //   Q1 → chọn đúng   (q1-correct)
  //   Q2 → chọn sai    (q2-wrong)
  //   Q3 → chọn đúng   (q3-correct)
  //   Q4 → null        (bỏ trống)
  //
  // Reading
  //   Q5 → chọn đúng   (q5-correct)
  //   Q6 → chọn đúng   (q6-correct)
  //   Q7 → chọn sai    (q7-wrong)
  //   Q8 → null        (bỏ trống)
  //
  const answerMap = new Map<string, string | null>([
    ['q1', 'q1-correct'],   // Listening – ĐÚNG
    ['q2', 'q2-wrong'],     // Listening – SAI
    ['q3', 'q3-correct'],   // Listening – ĐÚNG
    ['q4', null],           // Listening – BỎ TRỐNG
    ['q5', 'q5-correct'],   // Reading   – ĐÚNG
    ['q6', 'q6-correct'],   // Reading   – ĐÚNG
    ['q7', 'q7-wrong'],     // Reading   – SAI
    // q8 không có trong map → undefined → BỎ TRỐNG
  ]);

  it('calculateRawScore – overall: 4 đúng, 2 sai, 2 bỏ trống', () => {
    //
    // ĐẦU VÀO:
    //   sections: 2 section (Listening 4 câu, Reading 4 câu)
    //   answerMap: Q1✅ Q2❌ Q3✅ Q4⬜ Q5✅ Q6✅ Q7❌ Q8⬜
    //
    // ĐẦU RA KỲ VỌNG:
    //   correctCount = 4   (Q1, Q3, Q5, Q6)
    //   wrongCount   = 2   (Q2, Q7)
    //   blankCount   = 2   (Q4, Q8)
    //   totalQuestions = 8
    //
    const { overall } = calculateRawScore(sections, answerMap);

    expect(overall.correctCount).toBe(4);
    expect(overall.wrongCount).toBe(2);
    expect(overall.blankCount).toBe(2);
    expect(overall.totalQuestions).toBe(8);
  });

  it('calculateRawScore – raw score theo section: Listening=2, Reading=2', () => {
    //
    // ĐẦU VÀO: (giống trên)
    //
    // ĐẦU RA KỲ VỌNG:
    //   listeningRaw  = 2   (Q1, Q3 đúng trong Listening)
    //   readingRaw    = 2   (Q5, Q6 đúng trong Reading)
    //   listeningBlank= 1   (Q4 bỏ trống trong Listening)
    //   readingBlank  = 1   (Q8 bỏ trống trong Reading)
    //
    const { overall } = calculateRawScore(sections, answerMap);

    expect(overall.listeningRaw).toBe(2);
    expect(overall.readingRaw).toBe(2);
    expect(overall.listeningBlank).toBe(1);
    expect(overall.readingBlank).toBe(1);
  });

  it('calculateRawScore – section breakdown: mỗi section đúng/sai/bỏ trống', () => {
    //
    // ĐẦU VÀO: (giống trên)
    //
    // ĐẦU RA KỲ VỌNG:
    //   Listening section: correct=2, wrong=1, blank=1
    //   Reading  section: correct=2, wrong=1, blank=1
    //
    const { sections: sectionScores } = calculateRawScore(sections, answerMap);

    const listening = sectionScores.find((s) => s.sectionId === 'sec-listening')!;
    expect(listening.correctCount).toBe(2);
    expect(listening.wrongCount).toBe(1);
    expect(listening.blankCount).toBe(1);

    const reading = sectionScores.find((s) => s.sectionId === 'sec-reading')!;
    expect(reading.correctCount).toBe(2);
    expect(reading.wrongCount).toBe(1);
    expect(reading.blankCount).toBe(1);
  });

  it('calculateRawScore – part breakdown: từng part được tính độc lập', () => {
    //
    // ĐẦU VÀO: (giống trên)
    //
    // ĐẦU RA KỲ VỌNG:
    //   Part 1 (Q1✅ Q2❌): correct=1, wrong=1, blank=0, total=2
    //   Part 2 (Q3✅ Q4⬜): correct=1, wrong=0, blank=1, total=2
    //   Part 5 (Q5✅ Q6✅ Q7❌ Q8⬜): correct=2, wrong=1, blank=1, total=4
    //
    const { parts } = calculateRawScore(sections, answerMap);

    const part1 = parts.find((p) => p.partId === 'part-1')!;
    expect(part1.correctCount).toBe(1);
    expect(part1.wrongCount).toBe(1);
    expect(part1.blankCount).toBe(0);
    expect(part1.totalQuestions).toBe(2);

    const part2 = parts.find((p) => p.partId === 'part-2')!;
    expect(part2.correctCount).toBe(1);
    expect(part2.wrongCount).toBe(0);
    expect(part2.blankCount).toBe(1);
    expect(part2.totalQuestions).toBe(2);

    const part5 = parts.find((p) => p.partId === 'part-5')!;
    expect(part5.correctCount).toBe(2);
    expect(part5.wrongCount).toBe(1);
    expect(part5.blankCount).toBe(1);
    expect(part5.totalQuestions).toBe(4);
  });

  it('toScaledScore – quy đổi raw=2/2 ra điểm TOEIC scaled', () => {
    //
    // ĐẦU VÀO:
    //   listeningRaw = 2  (số câu đúng Listening)
    //   readingRaw   = 2  (số câu đúng Reading)
    //
    // ĐẦU RA KỲ VỌNG:
    //   listeningScaled = LISTENING_SCALE[2] = 15
    //   readingScaled   = READING_SCALE[2]   = 10
    //   totalScore      = 15 + 10            = 25
    //
    const { listeningScaled, readingScaled, totalScore } = toScaledScore(2, 2);

    expect(listeningScaled).toBe(LISTENING_SCALE[2]);   // 15
    expect(readingScaled).toBe(READING_SCALE[2]);       // 10
    expect(totalScore).toBe(25);
  });

  it('KỊCH BẢN ĐẦY ĐỦ – từ raw score đến tổng điểm TOEIC', () => {
    //
    // Mô phỏng đúng flow của submitAttempt():
    //   1. calculateRawScore() → lấy listeningRaw, readingRaw
    //   2. toScaledScore()     → quy đổi sang điểm TOEIC
    //
    // ĐẦU VÀO: bài thi 8 câu như kịch bản trên
    //
    // ĐẦU RA KỲ VỌNG:
    //   listeningRaw    = 2   → listeningScaled = 15
    //   readingRaw      = 2   → readingScaled   = 10
    //   totalScore      = 25
    //   correctCount    = 4
    //   wrongCount      = 2
    //   blankCount      = 2
    //
    const { overall } = calculateRawScore(sections, answerMap);
    const scaled = toScaledScore(overall.listeningRaw, overall.readingRaw);

    // Raw counts
    expect(overall.correctCount).toBe(4);
    expect(overall.wrongCount).toBe(2);
    expect(overall.blankCount).toBe(2);

    // Scaled scores
    expect(scaled.listeningScaled).toBe(15);
    expect(scaled.readingScaled).toBe(10);
    expect(scaled.totalScore).toBe(25);
  });
});
