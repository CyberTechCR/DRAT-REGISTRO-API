import cors from 'cors';
import express from 'express';
import helmet from 'helmet';

import { checkDatabase } from './config/database.js';
import { env } from './config/env.js';
import { errorHandler, notFound } from './middleware/errorHandler.js';
import { apiRouter } from './routes/index.js';

export const app = express();

app.disable('x-powered-by');
app.use(helmet());
app.use(cors({ origin: env.corsOrigin }));
app.use(express.json({ limit: '12mb' }));

app.get('/health', async (_req, res) => {
  const databaseStatus = await checkDatabase();
  res.json({
    status: 'ok',
    service: 'sicaf-api',
    timestamp: new Date().toISOString(),
    database: databaseStatus,
  });
});

app.use('/api/v1', apiRouter);
app.use(notFound);
app.use(errorHandler);
