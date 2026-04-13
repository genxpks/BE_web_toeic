import { Prisma, SectionType, TestStatus } from '@prisma/client';
import { Request, Response } from 'express';
import { z } from 'zod';
import { prisma } from '../config/prisma.js';

const listSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(10),
  keyword: z.string().trim().min(1).optional(),
  status: z.nativeEnum(TestStatus).default(TestStatus.PUBLISHED),
  sectionType: z.nativeEnum(SectionType).optional(),
  sortBy: z.enum(['newest', 'oldest', 'title', 'duration']).default('newest'),
  userId: z.string().trim().min(1).optional(),
});

const detailSchema = z.object({
  userId: z.string().trim().min(1).optional(),
});

type MockTestParams = {
  id: string;
};

type MockTestListItem = Prisma.MockTestGetPayload<{
  include: {
    sections: {
      select: {
        id: true;
        type: true;
        title: true;
        orderNo: true;
        parts: {
          select: {
            id: true;
            questions: {
              select: {
                id: true;
              };
            };
          };
        };
      };
    };
    attempts: {
      select: {
        id: true;
        status: true;
        remainingTimeSec: true;
        updatedAt: true;
      };
    };
  };
}>;

const orderByMap: Record<z.infer<typeof listSchema>['sortBy'], Prisma.MockTestOrderByWithRelationInput> = {
  newest: { createdAt: 'desc' },
  oldest: { createdAt: 'asc' },
  title: { title: 'asc' },
  duration: { durationSec: 'asc' },
};

export async function listMockTests(req: Request, res: Response) {
  const query = listSchema.parse(req.query);

  const where: Prisma.MockTestWhereInput = {
    status: query.status,
    ...(query.keyword
      ? {
          OR: [
            { title: { contains: query.keyword } },
            { description: { contains: query.keyword } },
          ],
        }
      : {}),
    ...(query.sectionType
      ? {
          sections: {
            some: { type: query.sectionType },
          },
        }
      : {}),
  };

  const [items, total] = await Promise.all([
    prisma.mockTest.findMany({
      where,
      skip: (query.page - 1) * query.limit,
      take: query.limit,
      orderBy: orderByMap[query.sortBy],
      include: {
        sections: {
          select: {
            id: true,
            type: true,
            title: true,
            orderNo: true,
            parts: {
              select: {
                id: true,
                questions: {
                  select: { id: true },
                },
              },
            },
          },
          orderBy: { orderNo: 'asc' },
        },
        attempts: {
          where: {
            userId: query.userId ?? '__no_user__',
            status: 'IN_PROGRESS',
          },
          orderBy: { updatedAt: 'desc' },
          take: 1,
          select: {
            id: true,
            status: true,
            remainingTimeSec: true,
            updatedAt: true,
          },
        },
      },
    }) as Promise<MockTestListItem[]>,
    prisma.mockTest.count({ where }),
  ]);

  const data = (items as MockTestListItem[]).map((item) => {
    const totalParts = item.sections.reduce((sum, section) => sum + section.parts.length, 0);
    const totalQuestions = item.sections.reduce(
      (sum, section) => sum + section.parts.reduce((partSum, part) => partSum + part.questions.length, 0),
      0,
    );

    return {
      id: item.id,
      slug: item.slug,
      title: item.title,
      description: item.description,
      status: item.status,
      durationSec: item.durationSec,
      totalQuestions: item.totalQuestions || totalQuestions,
      createdAt: item.createdAt,
      updatedAt: item.updatedAt,
      metadata: {
        totalSections: item.sections.length,
        totalParts,
        sectionTypes: item.sections.map((section) => section.type),
      },
      resumeAttempt: item.attempts[0] ?? null,
    };
  });

  res.json({
    data,
    filters: {
      status: query.status,
      sectionType: query.sectionType ?? null,
      keyword: query.keyword ?? null,
      sortBy: query.sortBy,
    },
    pagination: {
      page: query.page,
      limit: query.limit,
      total,
      totalPages: Math.ceil(total / query.limit),
    },
  });
}

export async function getMockTestDetail(req: Request<MockTestParams>, res: Response) {
  const { id } = req.params;
  const query = detailSchema.parse(req.query);

  const item = await prisma.mockTest.findUnique({
    where: { id },
    include: {
      sections: {
        orderBy: { orderNo: 'asc' },
        include: {
          mediaAssets: true,
          parts: {
            orderBy: { orderNo: 'asc' },
            include: {
              mediaAssets: true,
              questions: {
                orderBy: { orderNo: 'asc' },
                include: {
                  choices: {
                    orderBy: { label: 'asc' },
                    select: {
                      id: true,
                      label: true,
                      content: true,
                    },
                  },
                  mediaAssets: true,
                },
              },
            },
          },
        },
      },
      attempts: {
        where: {
          userId: query.userId ?? '__no_user__',
          status: 'IN_PROGRESS',
        },
        orderBy: { updatedAt: 'desc' },
        take: 1,
        include: {
          answers: true,
        },
      },
    },
  });

  if (!item) {
    throw new Error('Mock test not found');
  }

  if (item.status !== TestStatus.PUBLISHED) {
    throw new Error('Mock test is not published');
  }

  const totalParts = item.sections.reduce((sum, section) => sum + section.parts.length, 0);
  const totalQuestions = item.sections.reduce(
    (sum, section) => sum + section.parts.reduce((partSum, part) => partSum + part.questions.length, 0),
    0,
  );

  const safeData = {
    id: item.id,
    slug: item.slug,
    title: item.title,
    description: item.description,
    totalQuestions: item.totalQuestions,
    durationSec: item.durationSec,
    status: item.status,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
    sections: item.sections.map((section) => ({
      id: section.id,
      mockTestId: section.mockTestId,
      type: section.type,
      title: section.title,
      orderNo: section.orderNo,
      durationSec: section.durationSec,
      instruction: section.instruction,
      mediaAssets: section.mediaAssets,
      parts: section.parts.map((part) => ({
        id: part.id,
        sectionId: part.sectionId,
        title: part.title,
        orderNo: part.orderNo,
        instruction: part.instruction,
        mediaAssets: part.mediaAssets,
        questions: part.questions.map((question) => ({
          id: question.id,
          partId: question.partId,
          orderNo: question.orderNo,
          questionNumber: question.questionNumber,
          stem: question.stem,
          explanation: question.explanation,
          choices: question.choices.map((choice) => ({
            id: choice.id,
            label: choice.label,
            content: choice.content,
          })),
          mediaAssets: question.mediaAssets,
        })),
      })),
    })),
    attempts: [],
    metadata: {
      totalSections: item.sections.length,
      totalParts,
      totalQuestions,
    },
    resumeAttempt: item.attempts[0] ?? null,
  };

  res.json({ data: safeData });
}
