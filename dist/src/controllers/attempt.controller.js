import { AttemptStatus, TestStatus } from '@prisma/client';
import { z } from 'zod';
import { prisma } from '../config/prisma.js';
const startSchema = z.object({
    userId: z.string().min(1),
    mockTestId: z.string().min(1),
    forceRestart: z.boolean().optional().default(false),
});
const saveAnswerSchema = z.object({
    questionId: z.string().min(1),
    choiceId: z.string().min(1).nullable().optional(),
    remainingTimeSec: z.number().int().min(0).optional(),
});
const resumeQuerySchema = z.object({
    userId: z.string().min(1),
    mockTestId: z.string().min(1),
});
function buildResultFromAttempt(attempt) {
    const questions = attempt.mockTest.sections.flatMap((section) => section.parts.flatMap((part) => part.questions.map((question) => ({
        ...question,
        sectionType: section.type,
    }))));
    const answersByQuestionId = new Map(attempt.answers.map((item) => [item.questionId, item.choiceId]));
    let listeningRaw = 0;
    let readingRaw = 0;
    let correctCount = 0;
    let blankCount = 0;
    for (const question of questions) {
        const selected = answersByQuestionId.get(question.id);
        if (!selected) {
            blankCount += 1;
            continue;
        }
        const correctChoice = question.choices.find((choice) => choice.isCorrect);
        if (correctChoice?.id === selected) {
            correctCount += 1;
            if (question.sectionType === 'LISTENING')
                listeningRaw += 1;
            else
                readingRaw += 1;
        }
    }
    const wrongCount = questions.length - correctCount - blankCount;
    const listeningScaled = Math.min(495, listeningRaw * 5);
    const readingScaled = Math.min(495, readingRaw * 5);
    const totalScore = listeningScaled + readingScaled;
    return {
        listeningRaw,
        readingRaw,
        listeningScaled,
        readingScaled,
        totalScore,
        correctCount,
        wrongCount,
        blankCount,
    };
}
export async function startAttempt(req, res) {
    const body = startSchema.parse(req.body);
    const [user, mockTest] = await Promise.all([
        prisma.user.findUnique({ where: { id: body.userId } }),
        prisma.mockTest.findUnique({ where: { id: body.mockTestId } }),
    ]);
    if (!user)
        throw new Error('User not found');
    if (!mockTest)
        throw new Error('Mock test not found');
    if (mockTest.status !== TestStatus.PUBLISHED)
        throw new Error('Mock test is not published');
    const existingAttempt = await prisma.attempt.findFirst({
        where: {
            userId: body.userId,
            mockTestId: body.mockTestId,
            status: AttemptStatus.IN_PROGRESS,
        },
        orderBy: { updatedAt: 'desc' },
        include: {
            answers: true,
        },
    });
    if (existingAttempt && !body.forceRestart) {
        return res.status(200).json({
            data: existingAttempt,
            meta: {
                resumed: true,
            },
        });
    }
    if (existingAttempt && body.forceRestart) {
        await prisma.attempt.update({
            where: { id: existingAttempt.id },
            data: {
                status: AttemptStatus.EXPIRED,
                remainingTimeSec: 0,
                lastActivityAt: new Date(),
            },
        });
    }
    const attempt = await prisma.attempt.create({
        data: {
            userId: body.userId,
            mockTestId: body.mockTestId,
            remainingTimeSec: mockTest.durationSec,
            lastActivityAt: new Date(),
        },
        include: {
            answers: true,
        },
    });
    res.status(201).json({
        data: attempt,
        meta: {
            resumed: false,
        },
    });
}
export async function saveAnswer(req, res) {
    const { attemptId } = req.params;
    const body = saveAnswerSchema.parse(req.body);
    const attempt = await prisma.attempt.findUnique({
        where: { id: attemptId },
        include: {
            mockTest: {
                include: {
                    sections: {
                        include: {
                            parts: {
                                include: {
                                    questions: {
                                        select: { id: true },
                                    },
                                },
                            },
                        },
                    },
                },
            },
        },
    });
    if (!attempt)
        throw new Error('Attempt not found');
    if (attempt.status !== AttemptStatus.IN_PROGRESS)
        throw new Error('Attempt is not active');
    const questionIds = new Set(attempt.mockTest.sections.flatMap((section) => section.parts.flatMap((part) => part.questions.map((question) => question.id))));
    if (!questionIds.has(body.questionId)) {
        throw new Error('Question does not belong to this mock test');
    }
    if (body.choiceId) {
        const choice = await prisma.choice.findUnique({
            where: { id: body.choiceId },
            select: { id: true, questionId: true },
        });
        if (!choice || choice.questionId !== body.questionId) {
            throw new Error('Choice does not belong to the provided question');
        }
    }
    const now = new Date();
    const answer = await prisma.attemptAnswer.upsert({
        where: {
            attemptId_questionId: {
                attemptId,
                questionId: body.questionId,
            },
        },
        create: {
            attemptId,
            questionId: body.questionId,
            choiceId: body.choiceId ?? null,
            answeredAt: now,
        },
        update: {
            choiceId: body.choiceId ?? null,
            answeredAt: now,
        },
        include: {
            choice: {
                select: {
                    id: true,
                    label: true,
                    content: true,
                },
            },
        },
    });
    const nextRemainingTime = typeof body.remainingTimeSec === 'number' ? Math.min(attempt.remainingTimeSec, body.remainingTimeSec) : undefined;
    await prisma.attempt.update({
        where: { id: attemptId },
        data: {
            lastActivityAt: now,
            ...(typeof nextRemainingTime === 'number' ? { remainingTimeSec: nextRemainingTime } : {}),
        },
    });
    res.json({
        data: answer,
        meta: {
            savedAt: now.toISOString(),
        },
    });
}
export async function getAttemptSnapshot(req, res) {
    const { attemptId } = req.params;
    const attempt = await prisma.attempt.findUnique({
        where: { id: attemptId },
        include: {
            answers: {
                include: {
                    choice: {
                        select: {
                            id: true,
                            label: true,
                            content: true,
                        },
                    },
                },
                orderBy: { answeredAt: 'asc' },
            },
            mockTest: {
                include: {
                    sections: {
                        orderBy: { orderNo: 'asc' },
                        include: {
                            parts: {
                                orderBy: { orderNo: 'asc' },
                                include: {
                                    questions: {
                                        orderBy: { orderNo: 'asc' },
                                        select: {
                                            id: true,
                                            questionNumber: true,
                                        },
                                    },
                                },
                            },
                        },
                    },
                },
            },
            result: true,
        },
    });
    if (!attempt)
        throw new Error('Attempt not found');
    res.json({ data: attempt });
}
export async function getInProgressAttempt(req, res) {
    const query = resumeQuerySchema.parse(req.query);
    const attempt = await prisma.attempt.findFirst({
        where: {
            userId: query.userId,
            mockTestId: query.mockTestId,
            status: AttemptStatus.IN_PROGRESS,
        },
        orderBy: { updatedAt: 'desc' },
        include: {
            answers: {
                include: {
                    choice: {
                        select: {
                            id: true,
                            label: true,
                            content: true,
                        },
                    },
                },
                orderBy: { answeredAt: 'asc' },
            },
            mockTest: {
                include: {
                    sections: {
                        orderBy: { orderNo: 'asc' },
                        include: {
                            parts: {
                                orderBy: { orderNo: 'asc' },
                                include: {
                                    questions: {
                                        orderBy: { orderNo: 'asc' },
                                        select: {
                                            id: true,
                                            questionNumber: true,
                                        },
                                    },
                                },
                            },
                        },
                    },
                },
            },
        },
    });
    if (!attempt) {
        return res.status(404).json({
            message: 'No in-progress attempt found',
        });
    }
    res.json({ data: attempt });
}
export async function submitAttempt(req, res) {
    const { attemptId } = req.params;
    const attempt = await prisma.attempt.findUnique({
        where: { id: attemptId },
        include: {
            answers: true,
            result: true,
            mockTest: {
                include: {
                    sections: {
                        include: {
                            parts: {
                                include: {
                                    questions: {
                                        include: { choices: true },
                                    },
                                },
                            },
                        },
                    },
                },
            },
        },
    });
    if (!attempt)
        throw new Error('Attempt not found');
    if (attempt.result) {
        return res.json({
            data: attempt.result,
            meta: {
                alreadySubmitted: true,
            },
        });
    }
    if (attempt.status !== AttemptStatus.IN_PROGRESS) {
        throw new Error('Attempt already finished');
    }
    const scoring = buildResultFromAttempt(attempt);
    const result = await prisma.$transaction(async (tx) => {
        await tx.attempt.update({
            where: { id: attemptId },
            data: {
                status: AttemptStatus.SUBMITTED,
                submittedAt: new Date(),
                remainingTimeSec: 0,
                lastActivityAt: new Date(),
            },
        });
        return tx.result.create({
            data: {
                userId: attempt.userId,
                attemptId,
                ...scoring,
            },
        });
    });
    res.json({
        data: result,
        meta: {
            alreadySubmitted: false,
        },
    });
}
