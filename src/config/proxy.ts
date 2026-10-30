import { Express } from 'express';

export function configureProxy(app: Express, env: NodeJS.ProcessEnv): void {
  const value = env.TRUST_PROXY_HOPS ?? (env.NODE_ENV === 'production' ? '1' : '0');
  if (!/^(0|[1-9]\d*)$/.test(value) || Number(value) > 10) {
    throw new Error('TRUST_PROXY_HOPS must be an integer between 0 and 10');
  }
  app.set('trust proxy', Number(value) === 0 ? false : Number(value));
}
