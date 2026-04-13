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
}

export interface ScoringResult {
  overall: OverallScore;
  sections: SectionScore[];
  parts: PartScore[];
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
