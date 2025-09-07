export default () => ({
    port: parseInt(process.env.PORT ?? '4000', 10),
    nodeEnv: process.env.NODE_ENV ?? 'development',

    // OpenF1 API Configuration
    openf1: {
        baseUrl: process.env.OPENF1_API_BASE_URL ?? 'https://api.openf1.org/v1',
    },

    // Database Configuration
    database: {
        url: process.env.DATABASE_URL ?? 'postgresql://user:password@localhost:5432/f1db',
    },

    // Redis Configuration
    redis: {
        host: process.env.REDIS_HOST ?? 'localhost',
        port: parseInt(process.env.REDIS_PORT ?? '6379', 10), // ⚡ 여기는 REDIS_PORT 써야 함
        password: process.env.REDIS_PASSWORD ?? '',
    },

    // CORS Configuration
    cors: {
        origin: process.env.CORS_ORIGIN ?? 'http://localhost:3000',
    },

    // Cache Configuration
    cache: {
        ttl: parseInt(process.env.CACHE_TTL ?? '300', 10),
        maxItems: parseInt(process.env.CACHE_MAX_ITEMS ?? '1000', 10),
    },

    // Rate Limiting
    rateLimit: {
        ttl: parseInt(process.env.RATE_LIMIT_TTL ?? '60', 10),
        limit: parseInt(process.env.RATE_LIMIT_LIMIT ?? '100', 10),
    },
});
