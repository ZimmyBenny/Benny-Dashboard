import { Request, Response, NextFunction } from 'express';

export interface ApiError extends Error {
  status?: number;
  code?: string;
}

export function errorHandler(
  err: ApiError,
  req: Request,
  res: Response,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  next: NextFunction
): void {
  const status = err.status ?? 500;
  const message = err.message ?? 'Internal Server Error';
  const code = err.code ?? 'INTERNAL_ERROR';

  console.error(`[${new Date().toISOString()}] ${status} ${req.method} ${req.path} — ${message}`);

  res.status(status).json({ "error": message, "code": code });
}
