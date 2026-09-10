import { config } from './config.js';
import { createApp } from './app.js';
import { getDb } from './db/index.js';
import { ensureSeedData } from './db/seed.js';

getDb();
ensureSeedData({ quiet: true });

createApp().listen(config.port, () => {
  console.log(`Guardians LMS API listening on http://localhost:${config.port}`);
  console.log(`  environment   : ${config.env}`);
  console.log(`  database      : ${config.databaseFile}`);
  console.log(`  drive provider: ${config.drive.provider}`);
});
