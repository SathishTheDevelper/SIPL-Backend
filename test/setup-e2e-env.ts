process.env.NODE_ENV = 'test';
process.env.REDIS_MODE = 'memory';
process.env.JWT_ACCESS_SECRET = 'test-access-secret-16chars';
process.env.JWT_REFRESH_SECRET = 'test-refresh-secret-16ch';
process.env.JWT_ACCESS_EXPIRES_IN = '15m';
process.env.JWT_REFRESH_EXPIRES_IN = '7d';
process.env.API_PREFIX = 'api/v1';
process.env.SWAGGER_ENABLED = 'false';
process.env.BCRYPT_ROUNDS = '4';
process.env.THROTTLE_LIMIT = '10000';
process.env.THROTTLE_LOGIN_LIMIT = '1000';
process.env.LOG_LEVEL = 'silent';
if (!process.env.MONGODB_URI) {
  process.env.MONGODB_URI = 'mongodb://127.0.0.1:27017/sipl_e2e_placeholder';
}
