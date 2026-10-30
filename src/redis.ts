import { createClient } from 'redis';

export type RedisHealth = 'connected' | 'not_configured' | 'unreachable';
type ConnectionLogger = {
  info(message: string): unknown;
  warn(message: string): unknown;
};

export function createRedisManager(url: string | undefined, log: ConnectionLogger) {
  // Do not silently connect to localhost when Redis is not configured.
  const client = url ? createClient({
    url,
    disableOfflineQueue: true,
    socket: {
      connectTimeout: 3000,
      reconnectStrategy: (retries: number) => Math.min(250 * (retries + 1), 5000),
    },
  }) : undefined;

  // Never log the URL or raw connection errors: they can contain credentials.
  client?.on('error', () => log.warn('Redis connection error; dependency health is degraded'));
  client?.on('ready', () => log.info('Redis connection ready'));
  client?.on('reconnecting', () => log.warn('Redis reconnecting'));

  return {
    async start(): Promise<void> {
      if (!client) {
        log.warn('Redis is not configured; Redis-dependent features are disabled');
        return;
      }
      try {
        await client.connect();
      } catch {
        log.warn('Redis connection could not be established');
      }
    },
    async health(timeoutMs = 1000): Promise<RedisHealth> {
      if (!client) return 'not_configured';
      if (!client.isReady) return 'unreachable';

      let timer: NodeJS.Timeout | undefined;
      try {
        const reply = await Promise.race([
          client.ping(),
          new Promise<never>((_resolve, reject) => {
            timer = setTimeout(() => reject(new Error('Redis ping timed out')), timeoutMs);
          }),
        ]);
        return reply === 'PONG' ? 'connected' : 'unreachable';
      } catch {
        return 'unreachable';
      } finally {
        if (timer) clearTimeout(timer);
      }
    },
    stop(): void {
      // Disconnect promptly, including an in-progress reconnect, during shutdown.
      if (client?.isOpen) client.destroy();
    },
  };
}
