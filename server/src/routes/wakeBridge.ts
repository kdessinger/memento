import express from 'express';
import { z } from 'zod';
import { requireAuth } from '../middlewares/authMiddleware.js';
import {
  MAX_WAKE_WORD_LENGTH,
  DEFAULT_WAKE_WORD
} from '../services/commandBridgeService.js';
import {
  MAX_WAKE_BRIDGE_INTERVAL_MINUTES,
  MAX_WAKE_BRIDGE_LIFELOGS_PER_PULL,
  MIN_WAKE_BRIDGE_INTERVAL_MINUTES,
  getWakeBridgePreferences,
  saveWakeBridgePreferences
} from '../services/wakeBridgePreferences.js';

const router = express.Router();

const updateSchema = z.object({
  enabled: z.boolean(),
  wakeWord: z.string().trim().min(1).max(MAX_WAKE_WORD_LENGTH).regex(/^[A-Za-z][A-Za-z -]*[A-Za-z]$|^[A-Za-z]$/, 'Wake word may contain letters, spaces, and hyphens only.'),
  pollIntervalMinutes: z.number().int().min(MIN_WAKE_BRIDGE_INTERVAL_MINUTES).max(MAX_WAKE_BRIDGE_INTERVAL_MINUTES),
  maxLifelogsPerPull: z.number().int().min(1).max(MAX_WAKE_BRIDGE_LIFELOGS_PER_PULL)
});

function requireAdmin(req: express.Request, res: express.Response): boolean {
  if (!req.user?.isAdmin) {
    res.status(403).json({ message: 'Administrator access is required.' });
    return false;
  }
  return true;
}

router.get('/preferences', requireAuth, async (req, res) => {
  if (!requireAdmin(req, res)) return;
  return res.json({
    preferences: await getWakeBridgePreferences(),
    limits: {
      minPollIntervalMinutes: MIN_WAKE_BRIDGE_INTERVAL_MINUTES,
      maxPollIntervalMinutes: MAX_WAKE_BRIDGE_INTERVAL_MINUTES,
      maxWakeWordLength: MAX_WAKE_WORD_LENGTH,
      defaultWakeWord: DEFAULT_WAKE_WORD,
      maxLifelogsPerPull: MAX_WAKE_BRIDGE_LIFELOGS_PER_PULL
    }
  });
});

router.put('/preferences', requireAuth, async (req, res) => {
  if (!requireAdmin(req, res)) return;
  const parsed = updateSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ message: 'Invalid wake bridge settings.', issues: parsed.error.flatten() });
  }
  return res.json({ preferences: await saveWakeBridgePreferences(parsed.data) });
});

export default router;
