import { SectionType } from '@prisma/client';

// ---------------------------------------------------------------------------
// Types – mirroring Prisma shapes but kept framework-agnostic for testability
// ---------------------------------------------------------------------------

export interface ChoiceSnapshot {
  id: string;
  isCorrect: boolean;
}

export interface QuestionSnapshot {
  id: string;
  choices: ChoiceSnapshot[];
}

export interface PartSnapshot {
  id: string;
  title: string;
  questions: QuestionSnapshot[];
}

export interface SectionSnapshot {
  id: string;
  type: SectionType;
  title: string;
  parts: PartSnapshot[];
}

// ---------------------------------------------------------------------------
// Output types
// ---------------------------------------------------------------------------

export interface RawCounts {
  correctCount: number;
  wrongCount: number;
  blankCount: number;
  totalQuestions: number;
}

export interface SectionScore extends RawCounts {
  sectionId: string;
  type: SectionType;
  title: string;
}

export interface PartScore extends RawCounts {
  partId: string;
  sectionId: string;
  title: string;
}

export interface OverallScore extends RawCounts {
  listeningRaw: number;
  readingRaw: number;
  listeningBlank: number;
  readingBlank: number;
}

export interface ScoringResult {
  overall: OverallScore;
  sections: SectionScore[];
  parts: PartScore[];
}

export interface ScaledResult {
  listeningScaled: number;
  readingScaled: number;
  totalScore: number;
}

// ---------------------------------------------------------------------------
// Core engine
// ---------------------------------------------------------------------------

/**
 * Tính raw score (correct / wrong / blank) ở 3 cấp độ:
 *  - overall   : toàn bài + listening/reading raw
 *  - sections  : từng section
 *  - parts     : từng part
 *
 * @param sections   Dữ liệu bài thi (MockTest.sections với parts & choices)
 * @param answerMap  Map<questionId, choiceId | null | undefined>
 *                   null/undefined = bỏ trống
 */
export function calculateRawScore(
  sections: SectionSnapshot[],
  answerMap: Map<string, string | null | undefined>,
): ScoringResult {
  const overall: OverallScore = {
    correctCount: 0,
    wrongCount: 0,
    blankCount: 0,
    totalQuestions: 0,
    listeningRaw: 0,
    readingRaw: 0,
    listeningBlank: 0,
    readingBlank: 0,
  };

  const sectionScores: SectionScore[] = [];
  const partScores: PartScore[] = [];

  for (const section of sections) {
    const sectionAcc: SectionScore = {
      sectionId: section.id,
      type: section.type,
      title: section.title,
      correctCount: 0,
      wrongCount: 0,
      blankCount: 0,
      totalQuestions: 0,
    };

    for (const part of section.parts) {
      const partAcc: PartScore = {
        partId: part.id,
        sectionId: section.id,
        title: part.title,
        correctCount: 0,
        wrongCount: 0,
        blankCount: 0,
        totalQuestions: 0,
      };

      for (const question of part.questions) {
        partAcc.totalQuestions += 1;

        const selectedChoiceId = answerMap.get(question.id);

        // ── Bỏ trống ──────────────────────────────────────────────────────
        if (selectedChoiceId == null) {
          partAcc.blankCount += 1;
          if (section.type === SectionType.LISTENING) {
            overall.listeningBlank += 1;
          } else {
            overall.readingBlank += 1;
          }
          continue;
        }

        // ── Tìm đáp án đúng ───────────────────────────────────────────────
        const correctChoice = question.choices.find((c) => c.isCorrect);

        if (correctChoice?.id === selectedChoiceId) {
          // Đúng
          partAcc.correctCount += 1;
          if (section.type === SectionType.LISTENING) {
            overall.listeningRaw += 1;
          } else {
            overall.readingRaw += 1;
          }
        } else {
          // Sai
          partAcc.wrongCount += 1;
        }
      }

      // Cộng vào section
      sectionAcc.correctCount += partAcc.correctCount;
      sectionAcc.wrongCount += partAcc.wrongCount;
      sectionAcc.blankCount += partAcc.blankCount;
      sectionAcc.totalQuestions += partAcc.totalQuestions;

      partScores.push(partAcc);
    }

    // Cộng vào overall
    overall.correctCount += sectionAcc.correctCount;
    overall.wrongCount += sectionAcc.wrongCount;
    overall.blankCount += sectionAcc.blankCount;
    overall.totalQuestions += sectionAcc.totalQuestions;

    sectionScores.push(sectionAcc);
  }

  return {
    overall,
    sections: sectionScores,
    parts: partScores,
  };
}

// ---------------------------------------------------------------------------
// Scaled score conversion (Raw 0–100 → Scaled 5–495)
// ---------------------------------------------------------------------------
//
// Bảng xấp xỉ được nội suy tuyến tính từ các điểm neo lấy theo
// ETS Official TOEIC Practice materials (không có bảng chính thức công khai).
//
// Listening anchor points:
//   raw:    0   10   20   30   40   50   60   70   80   90  100
//   scaled: 5   55  110  165  220  265  310  355  395  440  495
//
// Reading anchor points:
//   raw:    0   10   20   30   40   50   60   70   80   90  100
//   scaled: 5   30   65  105  150  200  250  300  350  400  495
// ---------------------------------------------------------------------------

/**
 * Lookup table: TOEIC Listening raw score (index) → scaled score.
 * 101 phần tử, index = raw 0…100, giá trị = scaled 5…495.
 */
// prettier-ignore
export const LISTENING_SCALE: readonly number[] = [
    5,  10,  15,  20,  25,  30,  35,  40,  45,  50,  // raw  0-9
   55,  61,  66,  72,  77,  83,  88,  94,  99, 105,  // raw 10-19
  110, 116, 121, 127, 132, 138, 143, 149, 154, 160,  // raw 20-29
  165, 171, 176, 182, 187, 193, 198, 204, 209, 215,  // raw 30-39
  220, 225, 229, 234, 238, 243, 247, 252, 256, 261,  // raw 40-49
  265, 270, 274, 279, 283, 288, 292, 297, 301, 306,  // raw 50-59
  310, 315, 319, 324, 328, 333, 337, 342, 346, 351,  // raw 60-69
  355, 359, 363, 367, 371, 375, 379, 383, 387, 391,  // raw 70-79
  395, 400, 404, 409, 413, 418, 422, 427, 431, 436,  // raw 80-89
  440, 446, 451, 457, 462, 468, 473, 479, 484, 490,  // raw 90-99
  495,                                                // raw 100
];

/**
 * Lookup table: TOEIC Reading raw score (index) → scaled score.
 * 101 phần tử, index = raw 0…100, giá trị = scaled 5…495.
 */
// prettier-ignore
export const READING_SCALE: readonly number[] = [
    5,   8,  10,  13,  15,  18,  20,  23,  25,  28,  // raw  0-9
   30,  34,  37,  41,  44,  48,  51,  55,  58,  62,  // raw 10-19
   65,  69,  73,  77,  81,  85,  89,  93,  97, 101,  // raw 20-29
  105, 110, 114, 119, 123, 128, 132, 137, 141, 146,  // raw 30-39
  150, 155, 160, 165, 170, 175, 180, 185, 190, 195,  // raw 40-49
  200, 205, 210, 215, 220, 225, 230, 235, 240, 245,  // raw 50-59
  250, 255, 260, 265, 270, 275, 280, 285, 290, 295,  // raw 60-69
  300, 305, 310, 315, 320, 325, 330, 335, 340, 345,  // raw 70-79
  350, 355, 360, 365, 370, 375, 380, 385, 390, 395,  // raw 80-89
  400, 410, 419, 429, 438, 448, 457, 467, 476, 486,  // raw 90-99
  495,                                                // raw 100
];

/**
 * Quy đổi raw score sang TOEIC scaled score.
 *
 * @param listeningRaw  Số câu đúng phần Listening (0–100)
 * @param readingRaw    Số câu đúng phần Reading   (0–100)
 * @returns             listeningScaled, readingScaled, và tổng totalScore
 */
export function toScaledScore(listeningRaw: number, readingRaw: number): ScaledResult {
  const safeL = Math.max(0, Math.min(100, Math.round(listeningRaw)));
  const safeR = Math.max(0, Math.min(100, Math.round(readingRaw)));

  const listeningScaled = LISTENING_SCALE[safeL]!;
  const readingScaled   = READING_SCALE[safeR]!;
  const totalScore      = listeningScaled + readingScaled;

  return { listeningScaled, readingScaled, totalScore };
}
