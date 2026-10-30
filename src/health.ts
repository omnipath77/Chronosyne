import { RedisHealth } from './redis';

export async function checkDependencies(
  checkDatabase: () => Promise<unknown>,
  checkRedis: () => Promise<RedisHealth>
) {
  const [databaseResult, redisResult] = await Promise.allSettled([
    Promise.resolve().then(checkDatabase),
    Promise.resolve().then(checkRedis),
  ]);
  const database = databaseResult.status === 'fulfilled' ? 'connected' : 'unreachable';
  const redis = redisResult.status === 'fulfilled' ? redisResult.value : 'unreachable';
  const healthy = database === 'connected' && redis !== 'unreachable';
  return {
    statusCode: healthy ? 200 : 503,
    body: {
      status: healthy ? 'healthy' : 'unhealthy',
      database,
      redis,
      timestamp: new Date().toISOString(),
    },
  };
}
