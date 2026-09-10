import cors from 'cors';
import express from 'express';
import { config } from './config.js';
import { seedRewards } from './services/gamification.js';
import { errorHandler, notFoundHandler } from './middleware/errorHandler.js';
import { assignmentsRouter } from './routes/assignments.js';
import { authRouter } from './routes/auth.js';
import { coursesRouter } from './routes/courses.js';
import { driveRouter } from './routes/drive.js';
import { groupsRouter } from './routes/groups.js';
import { learningRouter } from './routes/learning.js';
import { meRouter } from './routes/me.js';
import { notificationsRouter } from './routes/notifications.js';
import { quizzesRouter } from './routes/quizzes.js';
import { reportsRouter } from './routes/reports.js';
import { usersRouter } from './routes/users.js';
import { zonesRouter } from './routes/zones.js';

export function createApp() {
  seedRewards();

  const app = express();
  app.use(cors());
  app.use(express.json({ limit: '1mb' }));

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true, env: config.env, driveProvider: config.drive.provider, time: new Date().toISOString() });
  });

  app.use('/api/auth', authRouter);
  app.use('/api/zones', zonesRouter);
  app.use('/api/users', usersRouter);
  app.use('/api/groups', groupsRouter);
  app.use('/api/drive', driveRouter);
  app.use('/api/courses', coursesRouter);
  app.use('/api/assignments', assignmentsRouter);
  app.use('/api/quizzes', quizzesRouter);
  app.use('/api/learning', learningRouter);
  app.use('/api/me', meRouter);
  app.use('/api/notifications', notificationsRouter);
  app.use('/api/reports', reportsRouter);

  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}
