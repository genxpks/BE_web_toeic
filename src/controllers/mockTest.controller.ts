import { Request, Response } from 'express';
import { prisma } from '../config/prisma.js';
import { z } from 'zod';

const listSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(10),
  keyword: z.string().optional(),
  status: z.enum(['DRAFT', 'PUBLISHED', 'ARCHIVED']).optional(),
});

export async function listMockTests(req: Request, res: Response) {
  const query = listSchema.parse(req.query);
  const where = {
    ...(query.status ? { status: query.status } : {}),
    ...(query.keyword
      ? {
          OR: [
            { title: { contains: query.keyword } },
            { description: { contains: query.keyword } },
          ],
        }
      : {}),
  };

  const [items, total] = await Promise.all([
    prisma.mockTest.findMany({
      where,
      skip: (query.page - 1) * query.limit,
      take: query.limit,
      orderBy: { createdAt: 'desc' },
    }),
    prisma.mockTest.count({ where }),
  ]);

  res.json({
    data: items,
    pagination: {
      page: query.page,
      limit: query.limit,
      total,
      totalPages: Math.ceil(total / query.limit),
    },
  });
}

export async function getMockTestDetail(req: Request, res: Response) {
  const { id } = req.params;

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
