import fs from 'fs';
import path from 'path';
import { eq, desc, and, gte } from 'drizzle-orm';
import { db } from '../db/client.js';
import { insights, lifelogs, syncMetadata } from '../db/schema.js';
import { getUserConfig } from './authService.js';

const DEFAULT_VAULT_PATH = '/root/Kenn/second-brain';
const DEFAULT_DAILY_FOLDER = 'Daily insight';
const DEFAULT_LIFELOG_FOLDER = 'Daily insight/Lifelogs';

interface ObsidianExportOptions {
  vaultPath?: string;
  dailyFolder?: string;
  lifelogFolder?: string;
  sinceDate?: string; // YYYY-MM-DD, only export from this date onward
  includeLifelogs?: boolean;
  force?: boolean; // re-export everything
}

interface ExportResult {
  success: boolean;
  message: string;
  insightsExported: number;
  lifelogsExported: number;
  errors: string[];
}

function ensureDir(dirPath: string) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

function sanitizeFilename(text: string): string {
  return text.replace(/[<>:"/\\|?*]/g, '-').trim();
}

function formatDateForFrontmatter(dateStr: string): string {
  return dateStr + 'T00:00:00';
}

export async function exportToObsidian(
  userId: number,
  options: ObsidianExportOptions = {}
): Promise<ExportResult> {
  const {
    vaultPath = DEFAULT_VAULT_PATH,
    dailyFolder = DEFAULT_DAILY_FOLDER,
    lifelogFolder = DEFAULT_LIFELOG_FOLDER,
    includeLifelogs = true,
    force = false
  } = options;

  const result: ExportResult = {
    success: true,
    message: '',
    insightsExported: 0,
    lifelogsExported: 0,
    errors: []
  };

  const config = await getUserConfig(userId);
  const timezone = config?.timezone ?? 'UTC';

  const dailyDir = path.join(vaultPath, dailyFolder);
  const lifelogDir = path.join(vaultPath, lifelogFolder);

  ensureDir(dailyDir);
  if (includeLifelogs) {
    ensureDir(lifelogDir);
  }

  try {
    // Determine cutoff date for incremental export
    let sinceDate: string | undefined = options.sinceDate;
    if (!force && !sinceDate) {
      const metaRows = await db
        .select({ lastObsidianExportAt: syncMetadata.lastSyncAt })
        .from(syncMetadata)
        .where(eq(syncMetadata.userId, userId))
        .limit(1);
      if (metaRows[0]?.lastObsidianExportAt) {
        const d = new Date(metaRows[0].lastObsidianExportAt);
        sinceDate = d.toISOString().split('T')[0];
      }
    }

    // Build insight query
    let insightCondition = eq(insights.userId, userId);
    if (sinceDate) {
      insightCondition = and(insightCondition, gte(insights.date, sinceDate))!;
    }

    const insightRows = await db
      .select()
      .from(insights)
      .where(insightCondition)
      .orderBy(desc(insights.date));

    for (const row of insightRows) {
      const fileName = `${row.date}.md`;
      const filePath = path.join(dailyDir, fileName);

      const frontmatter = [
        '---',
        `date: ${formatDateForFrontmatter(row.date)}`,
        `timezone: ${timezone}`,
        `source: Limitless AI`,
        `type: daily_insight`,
        `memento_id: ${row.id}`,
        `exported_at: ${new Date().toISOString()}`,
        '---',
        ''
      ].join('\n');

      const content = frontmatter + row.content;

      try {
        fs.writeFileSync(filePath, content, 'utf-8');
        result.insightsExported++;
      } catch (err: any) {
        result.errors.push(`Failed to write ${filePath}: ${err.message}`);
      }
    }

    // Export lifelogs if requested
    if (includeLifelogs) {
      let lifelogCondition = eq(lifelogs.userId, userId);
      if (sinceDate) {
        lifelogCondition = and(lifelogCondition, gte(lifelogs.date, sinceDate))!;
      }

      const lifelogRows = await db
        .select()
        .from(lifelogs)
        .where(lifelogCondition)
        .orderBy(desc(lifelogs.date));

      for (const row of lifelogRows) {
        const safeTitle = sanitizeFilename(row.title || 'Untitled');
        const fileName = `${row.date}_${safeTitle}.md`.replace(/_+/g, '_');
        const filePath = path.join(lifelogDir, fileName);

        const frontmatter = [
          '---',
          `date: ${row.startTime ? new Date(row.startTime).toISOString() : formatDateForFrontmatter(row.date)}`,
          `end_time: ${row.endTime ? new Date(row.endTime).toISOString() : ''}`,
          `timezone: ${timezone}`,
          `source: Limitless AI`,
          `type: lifelog`,
          `memento_id: ${row.id}`,
          `limitless_id: ${row.limitlessId}`,
          `segment_type: ${row.segmentType || 'general'}`,
          `exported_at: ${new Date().toISOString()}`,
          '---',
          ''
        ].join('\n');

        const sections = [
          row.title ? `# ${row.title}` : null,
          row.summary ? `## Summary\n\n${row.summary}` : null,
          row.markdownContent ? `## Transcript\n\n${row.markdownContent}` : null
        ].filter(Boolean).join('\n\n');

        const content = frontmatter + (sections || '');

        try {
          fs.writeFileSync(filePath, content, 'utf-8');
          result.lifelogsExported++;
        } catch (err: any) {
          result.errors.push(`Failed to write ${filePath}: ${err.message}`);
        }
      }
    }

    // Update sync metadata via select-then-update since userId isn't unique
    const existingMeta = await db
      .select({ id: syncMetadata.id })
      .from(syncMetadata)
      .where(eq(syncMetadata.userId, userId))
      .limit(1);

    if (existingMeta.length > 0) {
      await db
        .update(syncMetadata)
        .set({ lastSyncAt: new Date(), lastSyncStatus: 'success', errorMessage: null })
        .where(eq(syncMetadata.id, existingMeta[0].id));
    } else {
      await db.insert(syncMetadata).values({
        userId,
        lastSyncAt: new Date(),
        lastSyncStatus: 'success'
      });
    }

    result.message = `Exported ${result.insightsExported} insights${includeLifelogs ? ` and ${result.lifelogsExported} lifelogs` : ''} to Obsidian vault.`;
    if (result.errors.length > 0) {
      result.message += ` (${result.errors.length} errors)`;
    }

    return result;
  } catch (error: any) {
    result.success = false;
    result.message = `Export failed: ${error.message}`;
    result.errors.push(error.message);
    return result;
  }
}
