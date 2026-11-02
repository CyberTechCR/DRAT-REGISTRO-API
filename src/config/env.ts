import 'dotenv/config';

function parsePort(value: string | undefined) {
  const port = Number(value ?? 3000);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error('PORT debe ser un número entre 1 y 65535');
  }
  return port;
}

export const env = {
  nodeEnv: process.env.NODE_ENV ?? 'development',
  port: parsePort(process.env.PORT),
  databaseUrl: process.env.DATABASE_URL,
  databaseCheckEnabled: process.env.DATABASE_CHECK_ENABLED === 'true',
  jwtSecret: process.env.JWT_SECRET,
  jwtExpiresIn: process.env.JWT_EXPIRES_IN ?? '8h',
  corsOrigin: process.env.CORS_ORIGIN ?? 'http://localhost:5173',
  bunnyStorageZone: process.env.BUNNY_STORAGE_ZONE,
  bunnyStorageAccessKey: process.env.BUNNY_STORAGE_ACCESS_KEY,
  bunnyCdnHostname: process.env.BUNNY_CDN_HOSTNAME,
} as const;
