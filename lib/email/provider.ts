import nodemailer, { Transporter } from "nodemailer";
import { EmailMessage, EmailProviderInstance, EmailSendResult } from "./types";
import { getEmailConfig, EmailConfig } from "./config";

let cachedTransporter: Transporter | null = null;
let cachedConfig: EmailConfig | null = null;

function getTransporter(): { transporter: Transporter; config: EmailConfig } | null {
  if (cachedTransporter && cachedConfig && cachedConfig.provider === "gmail-smtp") {
    return { transporter: cachedTransporter, config: cachedConfig };
  }

  const config = getEmailConfig();

  if (config.provider !== "gmail-smtp") {
    return null;
  }

  const transporter = nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: config.secure,
    auth: {
      user: config.user,
      pass: config.password,
    },
    connectionTimeout: 5000,
    greetingsTimeout: 5000,
    socketTimeout: 10000,
  } as Parameters<typeof nodemailer.createTransport>[0] & {
    connectionTimeout?: number;
    greetingsTimeout?: number;
    socketTimeout?: number;
  });

  cachedTransporter = transporter;
  cachedConfig = config;

  return { transporter, config };
}

export async function sendViaGmail(message: EmailMessage): Promise<EmailSendResult> {
  const result = getTransporter();
  if (!result) {
    return { success: false, error: "Gmail SMTP not configured" };
  }

  const { transporter, config } = result;

  try {
    const info = await transporter.sendMail({
      from: message.from || config.from,
      to: message.to,
      cc: message.cc,
      bcc: message.bcc,
      replyTo: message.replyTo || config.replyTo || undefined,
      subject: message.subject,
      text: message.text,
      html: message.html,
    });

    return {
      success: true,
      providerMessageId: info.messageId,
    };
  } catch (err) {
    const error = err as { code?: string; responseCode?: number };
    let category = "smtp_delivery_failed";
    if (error?.code === "EAUTH") category = "smtp_authentication_failed";
    else if (["ETIMEDOUT", "ESOCKET"].includes(error?.code ?? "")) category = "smtp_timeout";
    else if (["ECONNECTION", "ECONNREFUSED", "EHOSTUNREACH", "ENOTFOUND"].includes(error?.code ?? "")) category = "smtp_connection_failed";
    else if (error?.responseCode && error.responseCode >= 400) category = "smtp_message_rejected";
    return { success: false, error: category };
  }
}

export class GmailSmtpProvider implements EmailProviderInstance {
  validateConfig(): boolean {
    try {
      const config = getEmailConfig();
      return config.provider === "gmail-smtp" && !!config.host && !!config.user && !!config.password && !!config.from;
    } catch {
      return false;
    }
  }

  getName(): string {
    return "gmail-smtp";
  }

  async send(message: EmailMessage): Promise<EmailSendResult> {
    return sendViaGmail(message);
  }
}

export const gmailProvider = new GmailSmtpProvider();
export default GmailSmtpProvider;
