import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';
import { config } from '../config';

const ALGORITHM = 'aes-256-gcm';
const KEY = Buffer.from(config.ENCRYPTION_KEY, 'hex');

export function encrypt(plaintext: string): { encrypted: string; iv: string } {
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGORITHM, KEY, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return {
    encrypted: Buffer.concat([encrypted, authTag]).toString('base64'),
    iv: iv.toString('hex'),
  };
}

export function decrypt(encrypted: string, ivHex: string): string {
  const iv = Buffer.from(ivHex, 'hex');
  const data = Buffer.from(encrypted, 'base64');
  const authTag = data.slice(-16);
  const ciphertext = data.slice(0, -16);
  const decipher = createDecipheriv(ALGORITHM, KEY, iv);
  decipher.setAuthTag(authTag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
}

export function hashApiKey(key: string): string {
  const { createHash } = require('crypto');
  return createHash('sha256').update(key).digest('hex');
}
