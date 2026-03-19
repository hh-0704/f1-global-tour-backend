export default () => ({
  port: parseInt(process.env.PORT ?? '4000', 10),
  nodeEnv: process.env.NODE_ENV ?? 'development',

  // OpenF1 API Configuration
  openf1: {
    baseUrl: process.env.OPENF1_API_BASE_URL ?? 'https://api.openf1.org/v1',
  },

  // CORS Configuration
  cors: {
    origin: process.env.CORS_ORIGIN ?? 'http://localhost:3000',
  },

  // Rate Limiting
  rateLimit: {
    ttl: parseInt(process.env.RATE_LIMIT_TTL ?? '60', 10),
    limit: parseInt(process.env.RATE_LIMIT_LIMIT ?? '100', 10),
  },
});
