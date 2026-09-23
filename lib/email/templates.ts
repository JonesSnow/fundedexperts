import { sendEmail } from "../email";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || process.env.SITE_URL || "http://localhost:3000";

export async function sendVerificationEmail(to: string, token: string): Promise<{ success: boolean; error?: string }> {
  const link = `${SITE_URL}/auth/verify?token=${token}`;
  const text = `Welcome to Funded Experts!\n\nPlease verify your email by clicking the link below:\n${link}\n\nThis link expires in 24 hours.\n\nIf you did not create an account, you can safely ignore this email.`;

  const result = await sendEmail({
    to,
    subject: "Verify your email address",
    text,
  });

  return result;
}

export async function sendPasswordResetEmail(to: string, token: string): Promise<{ success: boolean; error?: string }> {
  const link = `${SITE_URL}/auth/reset-password?token=${token}`;
  const text = `Password Reset Request\n\nWe received a request to reset your password. Click the link below to reset it:\n${link}\n\nThis link expires in 15 minutes.\n\nIf you did not request a password reset, please contact support immediately.`;

  const result = await sendEmail({
    to,
    subject: "Reset your password",
    text,
  });

  return result;
}

export async function sendNotificationEmail(to: string, title: string, message: string): Promise<{ success: boolean; error?: string }> {
  const text = `${title}\n\n${message}`;

  const result = await sendEmail({
    to,
    subject: title,
    text,
  });

  return result;
}
