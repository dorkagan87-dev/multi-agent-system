import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { prisma } from '../../config/database';
import { config } from '../../config';
import { hashApiKey } from '../../utils/crypto';
import { randomBytes } from 'crypto';

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
}

export async function register(email: string, password: string, name?: string) {
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) throw new Error('Email already registered');

  const passwordHash = await bcrypt.hash(password, 12);
  const user = await prisma.user.create({
    data: { email, passwordHash, name },
    select: { id: true, email: true, name: true, role: true, createdAt: true },
  });
  return user;
}

export async function login(email: string, password: string): Promise<{ user: object; tokens: TokenPair }> {
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user || !user.passwordHash) throw new Error('Invalid credentials');

  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) throw new Error('Invalid credentials');

  await prisma.user.update({
    where: { id: user.id },
    data: { lastLoginAt: new Date() },
  });

  const tokens = issueTokens(user.id, user.role);
  const { passwordHash: _, ...safeUser } = user;
  return { user: safeUser, tokens };
}

export function issueTokens(userId: string, role: string): TokenPair {
  const accessToken = jwt.sign(
    { sub: userId, role },
    config.JWT_ACCESS_SECRET,
    { expiresIn: config.JWT_ACCESS_EXPIRES as jwt.SignOptions['expiresIn'] },
  );
  const refreshToken = jwt.sign(
    { sub: userId },
    config.JWT_REFRESH_SECRET,
    { expiresIn: config.JWT_REFRESH_EXPIRES as jwt.SignOptions['expiresIn'] },
  );
  return { accessToken, refreshToken };
}

export function verifyAccessToken(token: string): { sub: string; role: string } {
  return jwt.verify(token, config.JWT_ACCESS_SECRET) as { sub: string; role: string };
}

export function verifyRefreshToken(token: string): { sub: string } {
  return jwt.verify(token, config.JWT_REFRESH_SECRET) as { sub: string };
}

export async function generateApiKey(userId: string, name: string) {
  const raw = `ahk_${randomBytes(24).toString('hex')}`;
  const keyHash = hashApiKey(raw);
  const keyPrefix = raw.slice(0, 12);

  const record = await prisma.apiKey.create({
    data: { userId, name, keyHash, keyPrefix },
  });

  return { id: record.id, key: raw, prefix: keyPrefix };
}

export async function validateApiKey(rawKey: string) {
  const keyHash = hashApiKey(rawKey);
  const record = await prisma.apiKey.findUnique({ where: { keyHash }, include: { user: true } });
  if (!record) return null;
  if (record.expiresAt && record.expiresAt < new Date()) return null;

  await prisma.apiKey.update({ where: { id: record.id }, data: { lastUsedAt: new Date() } });
  return record.user;
}
