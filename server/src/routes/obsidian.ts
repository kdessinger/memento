import express from 'express';
import { z } from 'zod';
import { requireAuth } from '../middlewares/authMiddleware.js';
import { exportToObsidian } from '../services/obsidianExportService.js';

const router = express.Router();
router.use(requireAuth);

const exportSchema = z.object({
  vaultPath: z.string().optional(),
  dailyFolder: z.string().optional(),
  lifelogFolder: z.string().optional(),
  sinceDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  includeLifelogs: z.coerce.boolean().optional().default(true),
  force: z.coerce.boolean().optional().default(false)
});

router.post('/export', async (req, res) => {
  try {
    const parse = exportSchema.safeParse(req.body);
    if (!parse.success) {
      return res.status(400).json({
        success: false,
        message: 'Invalid payload',
        issues: parse.error.flatten()
      });
    }

    const result = await exportToObsidian(req.user!.userId, parse.data);
    res.json(result);
  } catch (error: any) {
    console.error('Obsidian export error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Export failed'
    });
  }
});

export default router;
