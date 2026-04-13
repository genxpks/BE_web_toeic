import { Request, Response } from 'express';
import { z } from 'zod';
import * as mockTestService from '../services/mockTest.service.js';

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

  const result = await mockTestService.listMockTests({
    page: query.page,
    limit: query.limit,
    keyword: query.keyword,
    status: query.status,
    sortBy: query.sortBy,
    sortOrder: query.sortOrder,
    dateFrom: query.dateFrom,
    dateTo: query.dateTo,
    sectionType: query.sectionType,
  });

  res.json(result);
}

export async function getMockTestDetail(req: Request, res: Response) {
  const id = req.params.id as string;
  const userId = req.query.userId as string | undefined;

  const result = await mockTestService.getMockTestDetail(id, userId);

  res.json({ data: result });
}