import { NextFunction, Request, Response } from 'express';

export const asyncHandler = <
  P = Record<string, any>,
  ResBody = any,
  ReqBody = any,
  ReqQuery = any,
>(
  fn: (req: Request<P, ResBody, ReqBody, ReqQuery>, res: Response<ResBody>, next: NextFunction) => Promise<unknown>,
) => {
  return (req: Request<P, ResBody, ReqBody, ReqQuery>, res: Response<ResBody>, next: NextFunction) => {
    fn(req, res, next).catch(next);
  };
};
