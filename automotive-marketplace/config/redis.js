const Redis = require('ioredis');
require('dotenv').config();

const redisHost = process.env.REDIS_HOST || '127.0.0.1';
const redisPort = Number(process.env.REDIS_PORT) || 6379;
const redisPassword = process.env.REDIS_PASSWORD || undefined;

let client = null;
let isConnected = false;

try {
  client = new Redis({
    host: redisHost,
    port: redisPort,
    password: redisPassword,
    lazyConnect: true,
    maxRetriesPerRequest: 1,
    retryStrategy(times) {
      if (times > 2) {
        return null; 
      }
      return 1000;
    },
    enableOfflineQueue: false,
  });

  client.on('connect', () => {
    isConnected = true;
    console.log(`[Redis] Connected to Redis cache at ${redisHost}:${redisPort}`);
  });

  client.on('error', (err) => {
    isConnected = false;
  });

  client.on('close', () => {
    isConnected = false;
  });

  client.connect().catch(() => {
    console.log('[Redis] Cache server not reachable. Running with Graceful Fallback (Direct Database Querying).');
  });
} catch (e) {
  console.log('[Redis] Driver initialization failed. Operating in cache-bypass mode.');
}

/**
 * @param {string} key 
 * @param {number} ttlSeconds 
 * @param {Function} fetchFn 
 */
async function getOrSet(key, ttlSeconds, fetchFn) {
  if (isConnected && client) {
    try {
      const cached = await client.get(key);
      if (cached) {
        return JSON.parse(cached);
      }
    } catch (err) {
    }
  }

  const freshData = await fetchFn();

  if (isConnected && client && freshData !== undefined && freshData !== null) {
    try {
      await client.setex(key, ttlSeconds, JSON.stringify(freshData));
    } catch (err) {
    }
  }

  return freshData;
}

/**
 * @param {string} pattern Example: 'filters:*'
 */
async function deleteKeys(pattern) {
  if (!isConnected || !client) return;
  try {
    const keys = await client.keys(pattern);
    if (keys.length > 0) {
      await client.del(...keys);
    }
  } catch (err) {
  }
}

module.exports = {
  client,
  getOrSet,
  deleteKeys,
  isAvailable: () => isConnected,
};
