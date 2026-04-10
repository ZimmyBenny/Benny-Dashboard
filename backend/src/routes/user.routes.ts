import { Router, type Request, type Response } from 'express';
import bcryptjs from 'bcryptjs';
import db from '../db/connection';

const router = Router();

// POST /api/user/change-password
// GESCHUETZT — liegt unter /api (verifyToken greift via app.use('/api', verifyToken))
router.post('/change-password', async (req: Request, res: Response) => {
  const { oldPassword, newPassword } = req.body as { oldPassword?: string; newPassword?: string };

  // Validierung
  if (!oldPassword || !newPassword) {
    res.status(400).json({ error: 'Altes und neues Passwort erforderlich' });
    return;
  }
  if (newPassword.length < 8) {
    res.status(400).json({ error: 'Neues Passwort muss mindestens 8 Zeichen haben' });
    return;
  }

  // User laden (Single-User-App: id = 1)
  const user = db
    .prepare('SELECT password_hash FROM user WHERE id = 1')
    .get() as { password_hash: string } | undefined;

  if (!user) {
    res.status(500).json({ error: 'User nicht gefunden' });
    return;
  }

  // Altes Passwort verifizieren (per Locked Decision 10)
  const valid = await bcryptjs.compare(oldPassword, user.password_hash);
  if (!valid) {
    res.status(401).json({ error: 'Aktuelles Passwort ist falsch' });
    return;
  }

  // Neues Passwort hashen und speichern
  const newHash = await bcryptjs.hash(newPassword, 12);
  db.prepare('UPDATE user SET password_hash = ? WHERE id = 1').run(newHash);

  res.json({ message: 'Passwort erfolgreich geaendert' });
});

export default router;
