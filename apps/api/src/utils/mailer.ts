import nodemailer from 'nodemailer';
import { logger } from './logger';

// Transport is created once at module load — avoids re-creating the connection
// pool on every email send and makes SMTP misconfiguration fail fast at startup.
const transport = process.env.SMTP_HOST
  ? nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT ?? 587),
      secure: Number(process.env.SMTP_PORT) === 465,
      auth:
        process.env.SMTP_USER && process.env.SMTP_PASS
          ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
          : undefined,
    })
  : null;

export async function sendPasswordResetEmail(to: string, resetUrl: string): Promise<void> {
  const from = process.env.SMTP_FROM ?? 'AgentHub <no-reply@agenthub.ai>';

  const html = `
    <div style="font-family:sans-serif;max-width:480px;margin:0 auto;color:#111">
      <div style="text-align:center;padding:32px 0 24px">
        <div style="display:inline-flex;align-items:center;justify-content:center;
                    width:48px;height:48px;background:#7c3aed;border-radius:12px">
          <span style="font-size:24px">⚡</span>
        </div>
        <h1 style="margin:12px 0 4px;font-size:20px">AgentHub</h1>
      </div>
      <div style="background:#fff;border:1px solid #e5e7eb;border-radius:12px;padding:32px">
        <h2 style="margin:0 0 8px;font-size:18px">Reset your password</h2>
        <p style="color:#6b7280;margin:0 0 24px;font-size:14px;line-height:1.6">
          Click the button below to set a new password. This link expires in <strong>1 hour</strong>.
          If you didn't request this, you can safely ignore this email.
        </p>
        <a href="${resetUrl}"
           style="display:inline-block;background:#7c3aed;color:#fff;padding:12px 28px;
                  border-radius:8px;text-decoration:none;font-weight:600;font-size:14px">
          Reset Password
        </a>
        <p style="color:#9ca3af;font-size:11px;margin:24px 0 0">
          Or copy this link: <span style="color:#7c3aed">${resetUrl}</span>
        </p>
      </div>
    </div>
  `;

  if (!transport) {
    // Dev/staging without SMTP — print to console so dev can test the flow
    logger.info({ to, resetUrl }, '📧 [DEV] Password reset link (set SMTP_HOST to send real emails)');
    return;
  }

  await transport.sendMail({
    from,
    to,
    subject: 'Reset your AgentHub password',
    html,
  });
  logger.info({ to }, '[Mailer] Password reset email sent');
}
