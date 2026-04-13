import { prisma } from '../config/prisma.js';
import { AttemptStatus } from '@prisma/client';

export interface ListMockTestsParams {
  page: number;
  limit: number;
  keyword?: string;
  status?: 'DRAFT' | 'PUBLISHED' | 'ARCHIVED';
  sortBy: 'createdAt' | 'title' | 'updatedAt';
  sortOrder: 'asc' | 'desc';
  dateFrom?: Date;
  dateTo?: Date;
  sectionType?: 'LISTENING' | 'READING';
}

export interface MockTestMetadata {
  sectionsCount: number;
  partsCount: number;
  questionsCount: number;
  attemptsCount: number;
  avgScore: number | null;
}

export interface MockTestListItem {
  id: string;
  slug: string;
  title: string | null;
  description: string | null;
  status: string;
  totalQuestions: number;
  durationSec: number;
  createdAt: Date;
  updatedAt: Date;
  metadata: MockTestMetadata;
}

export interface MockTestSection {
  id: string;
  type: string;
  title: string;
  orderNo: number;
  durationSec: number | null;
  instruction: string | null;
  parts: {
    id: string;
    title: string;
    orderNo: number;
    instruction: string | null;
    questionsCount: number;
  }[];
}

export interface ResumeInfo {
  attemptId: string;
  remainingTimeSec: number;
  answeredCount: number;
  totalQuestions: number;
}

export interface MockTestDetail {
  id: string;
  slug: string;
  title: string | null;
  description: string | null;
  status: string;
  totalQuestions: number;
  durationSec: number;
  createdAt: Date;
  updatedAt: Date;
  sections: MockTestSection[];
  summary: {
    totalSections: number;
    totalParts: number;
    totalQuestions: number;
  };
  resumeInfo?: ResumeInfo;
}

export async function listMockTests(params: ListMockTestsParams) {
  const { page, limit, keyword, status, sortBy, sortOrder, dateFrom, dateTo, sectionType } = params;

  const where: any = {
    ...(status ? { status } : {}),
    ...(keyword
      ? {
          OR: [
            { title: { contains: keyword } },
            { description: { contains: keyword } },
          ],
        }
      : {}),
    ...(dateFrom ? { createdAt: { gte: dateFrom } } : {}),
    ...(dateTo ? { createdAt: { lte: dateTo } } : {}),
    ...(sectionType
      ? {
          sections: {
            some: { type: sectionType },
          },
        }
      : {}),
  };

  const orderBy: any = {
    [sortBy]: sortOrder,
  };

  const [items, total] = await Promise.all([
    prisma.mockTest.findMany({
      where,
      skip: (page - 1) * limit,
      take: limit,
      orderBy,
      include: {
        sections: {
          select: { id: true, type: true },
        },
        _count: {
          select: { attempts: true },
        },
      },
    }),
    prisma.mockTest.count({ where }),
  ]);

  const mockTestsWithMeta = await Promise.all(
    items.map(async (item) => {
      const questionsCount = await prisma.question.count({
        where: {
          part: {
            section: {
              mockTestId: item.id,
            },
          },
        },
      });

      const partsCount = await prisma.part.count({
        where: {
          section: {
            mockTestId: item.id,
          },
        },
      });

      const avgScore = await prisma.result.aggregate({
        where: { attempt: { mockTestId: item.id } },
        _avg: { totalScore: true },
      });

      return {
        id: item.id,
        slug: item.slug,
        title: item.title,
        description: item.description,
        status: item.status,
        totalQuestions: item.totalQuestions,
        durationSec: item.durationSec,
        createdAt: item.createdAt,
        updatedAt: item.updatedAt,
        metadata: {
          sectionsCount: item.sections.length,
          partsCount,
          questionsCount,
          attemptsCount: item._count.attempts,
          avgScore: avgScore._avg.totalScore ? Math.round(avgScore._avg.totalScore) : null,
        },
      };
    })
  );

  return {
    data: mockTestsWithMeta,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  };
}

export async function getMockTestDetail(id: string, userId?: string): Promise<MockTestDetail> {
  const item = await prisma.mockTest.findUnique({
    where: { id },
    include: {
      sections: {
        orderBy: { orderNo: 'asc' },
        include: {
          parts: {
            orderBy: { orderNo: 'asc' },
            include: {
              _count: { select: { questions: true } },
            },
          },
        },
      },
    },
  });

  if (!item) {
    throw new Error('Mock test not found');
  }

  let resumeInfo: ResumeInfo | undefined = undefined;
  if (userId) {
    const attempt = await prisma.attempt.findFirst({
      where: {
        userId,
        mockTestId: id,
        status: AttemptStatus.IN_PROGRESS,
      },
      include: {
        _count: { select: { answers: true } },
      },
    });

    if (attempt) {
      resumeInfo = {
        attemptId: attempt.id,
        remainingTimeSec: attempt.remainingTimeSec,
        answeredCount: attempt._count.answers,
        totalQuestions: item.totalQuestions,
      };
    }
  }

  const sections: MockTestSection[] = item.sections.map((section) => ({
    id: section.id,
    type: section.type,
    title: section.title,
    orderNo: section.orderNo,
    durationSec: section.durationSec,
    instruction: section.instruction,
    parts: section.parts.map((part) => ({
      id: part.id,
      title: part.title,
      orderNo: part.orderNo,
      instruction: part.instruction,
      questionsCount: part._count.questions,
    })),
  }));

  return {
    id: item.id,
    slug: item.slug,
    title: item.title,
    description: item.description,
    status: item.status,
    totalQuestions: item.totalQuestions,
    durationSec: item.durationSec,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
    sections,
    summary: {
      totalSections: item.sections.length,
      totalParts: item.sections.reduce((acc, s) => acc + s.parts.length, 0),
      totalQuestions: item.totalQuestions,
    },
    ...(resumeInfo && { resumeInfo }),
  };
}