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

  // positions 다운샘플 목표 주파수(Hz). 직선은 이 주기로 솎고, 코너는 보존.
  positions: {
    downsampleHz: parseInt(process.env.DOWNSAMPLE_HZ ?? '4', 10),
  },
});
