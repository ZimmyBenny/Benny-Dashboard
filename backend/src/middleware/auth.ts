import jwt from 'jsonwebtoken';
import type { Request, Response, NextFunction } from 'express';

export interface AuthenticatedRequest extends Request {
  user?: jwt.JwtPayload;
}

export function verifyToken(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): void {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Unauthorized', code: 'MISSING_TOKEN' });
    return;
  }

  const token = authHeader.slice(7);

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET as string, {
      algorithms: ['HS256'],
    }) as jwt.JwtPayload;
    req.user = payload;
    next();
  } catch {
    res.status(401).json({ error: 'Unauthorized', code: 'INVALID_TOKEN' });
  }
}
