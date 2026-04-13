import { describe, it, expect } from 'vitest';
import { SectionType } from '@prisma/client';
import { calculateRawScore, SectionSnapshot } from '../src/services/scoring.service.js';

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

describe('calculateRawScore – bài thi rỗng', () => {
  it('không có section → overall về 0', () => {
    const { overall, sections, parts } = calculateRawScore([], new Map());

    expect(overall.totalQuestions).toBe(0);
    expect(overall.correctCount).toBe(0);
    expect(sections).toHaveLength(0);
    expect(parts).toHaveLength(0);
  });
});
