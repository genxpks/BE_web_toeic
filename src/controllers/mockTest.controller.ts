import { Request, Response } from 'express';
import { prisma } from '../config/prisma.js';
import { z } from 'zod';

const listSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(10),
  keyword: z.string().optional(),
  status: z.enum(['DRAFT', 'PUBLISHED', 'ARCHIVED']).optional(),
  sortBy: z.enum(['createdAt', 'title', 'updatedAt']).default('createdAt'),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
  dateFrom: z.coerce.date().optional(),
  dateTo: z.coerce.date().optional(),
  sectionType: z.enum(['LISTENING', 'READING']).optional(),
});

export async function listMockTests(req: Request, res: Response) {
  const query = listSchema.parse(req.query);

  const where: any = {
    ...(query.status ? { status: query.status } : {}),
    ...(query.keyword
      ? {
          OR: [
            { title: { contains: query.keyword } },
            { description: { contains: query.keyword } },
          ],
        }
      : {}),
    ...(query.dateFrom ? { createdAt: { gte: query.dateFrom } } : {}),
    ...(query.dateTo ? { createdAt: { lte: query.dateTo } } : {}),
    ...(query.sectionType
      ? {
          sections: {
            some: { type: query.sectionType },
          },
        }
      : {}),
  };

  const orderBy: any = {
    [query.sortBy]: query.sortOrder,
  };

  const [items, total] = await Promise.all([
    prisma.mockTest.findMany({
      where,
      skip: (query.page - 1) * query.limit,
      take: query.limit,
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

  res.json({
    data: mockTestsWithMeta,
    pagination: {
      page: query.page,
      limit: query.limit,
      total,
      totalPages: Math.ceil(total / query.limit),
    },
  });
}

export async function getMockTestDetail(req: Request, res: Response) {
  const id = req.params.id as string;

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
                  choices: true,
                  mediaAssets: true,
                },
              },
            },
          },
        },
      },
    },
  });

  if (!item) {
    throw new Error('Mock test not found');
  }

  res.json({ data: item });
}
