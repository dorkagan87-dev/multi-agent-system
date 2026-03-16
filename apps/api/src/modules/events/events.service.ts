/**
 * Publishes events via Redis pub/sub.
 * Workers publish here; the API server subscribes and fans out over Socket.io.
 */
import { redis } from '../../config/redis';

const CHANNEL = 'agent-hub:events';

export async function publishEvent(type: string, payload: unknown): Promise<void> {
  await redis.publish(CHANNEL, JSON.stringify({ type, payload, ts: Date.now() }));
}

export { CHANNEL };
