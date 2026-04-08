import rateLimit from 'express-rate-limit';

// Login rate limiter — applied per-route on POST /api/auth/login ONLY.
// Using express-rate-limit v8 API:
//   - `limit` (not `max`) — `max` was removed in v7
//   - `standardHeaders: 'draft-7'` (not boolean `true`) — boolean form removed in v7
//   - `legacyHeaders: false` — suppress deprecated X-RateLimit-* headers
// T-02.2-04: brute-force mitigation — 10 attempts per IP per 15-minute window.
// T-02.2-05: NOT applied globally via app.use() — only on the /login route.
export const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: 'Too many login attempts. Try again in 15 minutes.', code: 'RATE_LIMITED' },
});
