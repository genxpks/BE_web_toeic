import { NextFunction, Request, Response } from 'express';
import { StatusCodes } from 'http-status-codes';
import { ZodError } from 'zod';

export function errorMiddleware(err: unknown, _req: Request, res: Response, _next: NextFunction) {
  if (err instanceof ZodError) {
    return res.status(StatusCodes.BAD_REQUEST).json({
      message: 'Validation error',
      errors: err.flatten(),
    });
  }

  if (err instanceof Error) {
    return res.status(StatusCodes.BAD_REQUEST).json({
      message: err.message,
    });
  }

  return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
    message: 'Internal server error',
  });
}
