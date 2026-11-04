import ViteExpress from 'vite-express';
import cron from 'node-cron';
import app from './app.js';
import { APP_PORT, SYNC_INTERVAL_MINUTES } from './config.js';
import { runScheduledSync } from './jobs/syncJob.js';
import { readWakeCommandBridgeSettings, runWakeCommandPolling } from './services/wakeCommandRuntime.js';

const isProduction = process.env.NODE_ENV === 'production';

ViteExpress.config({
  mode: isProduction ? 'production' : 'development',
  viteConfigFile: 'frontend/vite.config.ts',
  inlineViteConfig: {
    root: 'frontend'
  }
});

cron.schedule(`*/${SYNC_INTERVAL_MINUTES} * * * *`, () => {
  void runScheduledSync();
});

try {
  const wakeBridge = readWakeCommandBridgeSettings(process.env);
  if (wakeBridge.enabled) {
    const poll = () => {
      void runWakeCommandPolling().catch((error: unknown) => {
        const message = error instanceof Error ? error.message : 'unknown error';
        console.error(`Wake command polling failed: ${message}`);
      });
    };
    // The scheduler wakes once a minute. The saved in-app preference controls
    // the effective cadence without requiring a container restart.
    cron.schedule('* * * * *', poll);
    poll(); // bootstrap history immediately; it intentionally does not dispatch it.
    console.log('Wake command bridge enabled; checking in-app polling preferences every minute.');
  }
} catch (error) {
  const message = error instanceof Error ? error.message : 'unknown error';
  console.error(`Wake command bridge disabled because its configuration is invalid: ${message}`);
}

ViteExpress.listen(app, APP_PORT, () => {
  console.log(`🚀 Memento server listening on http://localhost:${APP_PORT}`);
});
