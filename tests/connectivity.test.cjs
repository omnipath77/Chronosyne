const { test } = require('node:test');
const assert = require('node:assert/strict');
const net = require('node:net');
const { once } = require('node:events');
const { PassThrough } = require('node:stream');
const express = require('express');
const rateLimit = require('express-rate-limit').default;
const winston = require('winston');
const { configureProxy } = require('../dist/config/proxy');
const { createRedisManager } = require('../dist/redis');
const { checkDependencies } = require('../dist/health');
const { createLogger } = require('../dist/logger');

const silentLog = { info() {}, warn() {} };

async function listen(server) {
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  return server.address().port;
}

async function stop(server) {
  server.closeAllConnections?.();
  await new Promise(resolve => server.close(resolve));
}

test('production proxy trust separates rate limits and uses nearest forwarded IP', async () => {
  const app = express();
  configureProxy(app, { NODE_ENV: 'production' });
  app.use(rateLimit({ windowMs: 60000, limit: 1 }));
  app.get('/', (req, res) => res.json({ ip: req.ip }));
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const url = `http://127.0.0.1:${server.address().port}/`;
  try {
    const first = await fetch(url, { headers: { 'X-Forwarded-For': '198.51.100.1' } });
    assert.equal(first.status, 200);
    assert.equal((await first.json()).ip, '198.51.100.1');
    assert.equal((await fetch(url, { headers: { 'X-Forwarded-For': '198.51.100.1' } })).status, 429);
    const second = await fetch(url, {
      headers: { 'X-Forwarded-For': '203.0.113.99, 198.51.100.2' },
    });
    assert.equal(second.status, 200);
    assert.equal((await second.json()).ip, '198.51.100.2');
  } finally {
    await stop(server);
  }
});

test('proxy trust defaults off outside production and rejects unsafe settings', () => {
  const app = express();
  configureProxy(app, {});
  assert.equal(app.get('trust proxy'), false);
  configureProxy(app, { NODE_ENV: 'production', TRUST_PROXY_HOPS: '0' });
  assert.equal(app.get('trust proxy'), false);
  for (const value of ['true', '-1', '1.5', '11', '1x', '']) {
    assert.throws(() => configureProxy(app, { TRUST_PROXY_HOPS: value }), /TRUST_PROXY_HOPS/);
  }
});

test('unconfigured Redis is explicit and does not connect', async () => {
  const redis = createRedisManager(undefined, silentLog);
  await redis.start();
  assert.equal(await redis.health(), 'not_configured');
  redis.stop();
});

// Minimal RESP fixture: parse complete bulk-string commands and answer without
// storing keys. This exercises the real Redis client, not a mocked ping method.
async function redisFixture() {
  const sockets = new Set();
  const commands = [];
  let answerPing = true;
  const server = net.createServer(socket => {
    sockets.add(socket);
    socket.on('close', () => sockets.delete(socket));
    let buffer = Buffer.alloc(0);
    socket.on('data', chunk => {
      buffer = Buffer.concat([buffer, chunk]);
      while (buffer.length) {
        const headerEnd = buffer.indexOf('\r\n');
        if (headerEnd < 0) return;
        const count = Number(buffer.subarray(1, headerEnd).toString());
        let cursor = headerEnd + 2;
        const args = [];
        for (let i = 0; i < count; i++) {
          const lengthEnd = buffer.indexOf('\r\n', cursor);
          if (lengthEnd < 0) return;
          const length = Number(buffer.subarray(cursor + 1, lengthEnd).toString());
          cursor = lengthEnd + 2;
          if (buffer.length < cursor + length + 2) return;
          args.push(buffer.subarray(cursor, cursor + length).toString());
          cursor += length + 2;
        }
        buffer = buffer.subarray(cursor);
        const command = args[0].toUpperCase();
        commands.push(command);
        if (command === 'PING') {
          if (answerPing) socket.write('+PONG\r\n');
        } else {
          socket.write('+OK\r\n');
        }
      }
    });
  });
  const port = await listen(server);
  return {
    url: `redis://127.0.0.1:${port}`,
    commands,
    silencePing() { answerPing = false; },
    async close() {
      for (const socket of sockets) socket.destroy();
      await stop(server);
    },
  };
}

test('real Redis client connects, pings, times out, and disconnects without data writes', async () => {
  const fixture = await redisFixture();
  const redis = createRedisManager(fixture.url, silentLog);
  try {
    await redis.start();
    assert.equal(await redis.health(), 'connected');
    fixture.silencePing();
    const started = Date.now();
    assert.equal(await redis.health(50), 'unreachable');
    assert.ok(Date.now() - started < 1500);
    assert.ok(fixture.commands.includes('PING'));
    assert.ok(fixture.commands.every(cmd => ['CLIENT', 'PING', 'HELLO'].includes(cmd)));
  } finally {
    redis.stop();
    await fixture.close();
  }
  assert.equal(await redis.health(), 'unreachable');
});

test('Redis failure is reported and logs never include connection credentials', async () => {
  const messages = [];
  const fixture = await redisFixture();
  const port = new URL(fixture.url).port;
  await fixture.close();
  const redis = createRedisManager(
    `redis://private-user:do-not-log@127.0.0.1:${port}`,
    { info: m => messages.push(m), warn: m => messages.push(m) }
  );
  const attempt = redis.start();
  try {
    await new Promise(resolve => setTimeout(resolve, 100));
    assert.equal(await redis.health(), 'unreachable');
    assert.ok(messages.length > 0);
    assert.ok(messages.every(m => !/private-user|do-not-log|redis:\/\//.test(m)));
  } finally {
    redis.stop();
    await attempt;
  }
});

test('deep health combines database and Redis results without hiding failures', async () => {
  for (const [databaseWorks, redisState, expectedCode] of [
    [true, 'connected', 200],
    [true, 'not_configured', 200],
    [true, 'unreachable', 503],
    [false, 'connected', 503],
    [false, 'unreachable', 503],
  ]) {
    const result = await checkDependencies(
      () => databaseWorks ? Promise.resolve(1) : Promise.reject(new Error('private connection detail')),
      async () => redisState
    );
    assert.equal(result.statusCode, expectedCode);
    assert.equal(result.body.database, databaseWorks ? 'connected' : 'unreachable');
    assert.equal(result.body.redis, redisState);
    assert.ok(!JSON.stringify(result).includes('private connection detail'));
  }
  assert.equal((await checkDependencies(() => { throw Error('db'); }, async () => 'connected')).statusCode, 503);
});

test('JSON logging preserves request metadata and error stacks', () => {
  const stream = new PassThrough();
  let output = '';
  stream.on('data', data => { output += data.toString(); });
  const logger = createLogger();
  logger.clear();
  logger.add(new winston.transports.Stream({ stream }));
  logger.info('HTTP request completed', { method: 'GET', path: '/health/deep', statusCode: 200 });
  logger.error(new Error('example failure'));
  const lines = output.trim().split('\n').map(line => JSON.parse(line));
  assert.equal(lines[0].path, '/health/deep');
  assert.equal(lines[0].statusCode, 200);
  assert.ok(lines[0].timestamp);
  assert.match(lines[1].stack, /example failure/);
  assert.ok(!output.includes('[object Object]'));
  logger.close();
});
