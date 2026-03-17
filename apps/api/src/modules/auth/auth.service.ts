import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { createHash, randomBytes } from 'crypto';
import { prisma } from '../../config/database';
import { config } from '../../config';
import { hashApiKey } from '../../utils/crypto';
import { sendPasswordResetEmail } from '../../utils/mailer';

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

export async function updateProfile(
  userId: string,
  data: { name?: string; email?: string },
) {
  if (data.email) {
    const existing = await prisma.user.findUnique({ where: { email: data.email } });
    if (existing && existing.id !== userId) {
      throw Object.assign(new Error('Email already in use by another account'), { status: 409 });
    }
  }
  return prisma.user.update({
    where: { id: userId },
    data: {
      ...(data.name !== undefined && { name: data.name }),
      ...(data.email && { email: data.email }),
    },
    select: { id: true, email: true, name: true, role: true, createdAt: true },
  });
}

export async function changePassword(
  userId: string,
  currentPassword: string,
  newPassword: string,
): Promise<void> {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user?.passwordHash) throw Object.assign(new Error('Account not found'), { status: 404 });

  const valid = await bcrypt.compare(currentPassword, user.passwordHash);
  if (!valid) throw Object.assign(new Error('Current password is incorrect'), { status: 400 });

  const passwordHash = await bcrypt.hash(newPassword, 12);
  await prisma.user.update({ where: { id: userId }, data: { passwordHash } });
}

const RESET_EXPIRES_MS = 60 * 60 * 1000; // 1 hour

export async function requestPasswordReset(email: string): Promise<void> {
  const user = await prisma.user.findUnique({ where: { email } });
  // Always return silently — never leak whether the email exists
  if (!user) return;

  // Invalidate any existing unused tokens for this user
  await prisma.passwordResetToken.deleteMany({ where: { userId: user.id } });

  const rawToken = randomBytes(32).toString('hex');
  const tokenHash = createHash('sha256').update(rawToken).digest('hex');
  const expiresAt = new Date(Date.now() + RESET_EXPIRES_MS);

  await prisma.passwordResetToken.create({
    data: { userId: user.id, tokenHash, expiresAt },
  });

  const resetUrl = `${config.APP_URL}/auth/reset-password?token=${rawToken}`;
  await sendPasswordResetEmail(email, resetUrl);
}

export async function resetPassword(rawToken: string, newPassword: string): Promise<void> {
  const tokenHash = createHash('sha256').update(rawToken).digest('hex');

  const record = await prisma.passwordResetToken.findUnique({ where: { tokenHash } });
  if (!record) throw Object.assign(new Error('Invalid or expired reset link'), { status: 400 });
  if (record.usedAt) throw Object.assign(new Error('This reset link has already been used'), { status: 400 });
  if (record.expiresAt < new Date()) throw Object.assign(new Error('Reset link has expired — request a new one'), { status: 400 });

  const passwordHash = await bcrypt.hash(newPassword, 12);

  await prisma.$transaction([
    prisma.user.update({ where: { id: record.userId }, data: { passwordHash } }),
    prisma.passwordResetToken.update({ where: { id: record.id }, data: { usedAt: new Date() } }),
  ]);
}

export async function validateApiKey(rawKey: string) {
  const keyHash = hashApiKey(rawKey);
  const record = await prisma.apiKey.findUnique({ where: { keyHash }, include: { user: true } });
  if (!record) return null;
  if (record.expiresAt && record.expiresAt < new Date()) return null;

  await prisma.apiKey.update({ where: { id: record.id }, data: { lastUsedAt: new Date() } });
  return record.user;
}
