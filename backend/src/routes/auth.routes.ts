import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import db from '../db/connection';
import { loginLimiter } from '../middleware/rateLimiter';

const router = Router();

interface UserRow { id: number; username: string; password_hash: string; }

// POST /api/auth/login
// Rate-limited: 10 req / 15 min per IP (T-02.2-04).
// Returns 200 + { token } on success, 401 on any credential failure.
// T-02.2-01: bcrypt.compare for constant-time password verification.
// T-02.2-02: explicit algorithm: 'HS256' — prevents alg:none attack.
// T-02.2-03: identical 401 body for missing user and wrong password — prevents username enumeration.
// T-02.2-06: expiresIn: '7d' hardcoded — no path to mint a non-expiring token.
// T-02.2-08: password and hash are never logged.
router.post('/login', loginLimiter, async (req, res) => {
  const { username, password } = (req.body ?? {}) as { username?: string; password?: string };

  if (typeof username !== 'string' || typeof password !== 'string' || !username || !password) {
    res.status(400).json({ error: 'username and password are required', code: 'BAD_REQUEST' });
    return;
  }

  const user = db
    .prepare('SELECT id, username, password_hash FROM user WHERE id = 1')
    .get() as UserRow | undefined;

  // Always run bcrypt.compare even when user is missing to keep timing uniform enough,
  // and always return the same 401 message to prevent username enumeration (OWASP).
  const dummyHash = '$2b$12$CwTycUXWue0Thq9StjUM0uJ8.m8yq9W/xWc9Cg3aB8fQaN8g6q6Dq';
  const hashToCompare = user?.password_hash ?? dummyHash;
  const passwordOk = await bcrypt.compare(password, hashToCompare);

  if (!user || user.username !== username || !passwordOk) {
    res.status(401).json({ error: 'Invalid credentials', code: 'AUTH_FAILED' });
    return;
  }

  const token = jwt.sign(
    { sub: user.id, username: user.username },
    process.env.JWT_SECRET as string,
    { algorithm: 'HS256', expiresIn: '7d' }
  );

  res.status(200).json({ token });
});

// POST /api/auth/logout
// Server-side no-op by design — JWT is stateless.
// Client clears the Zustand authStore (Plan 2.4).
router.post('/logout', (_req, res) => {
  res.status(200).json({ message: 'Logged out' });
});

export default router;
