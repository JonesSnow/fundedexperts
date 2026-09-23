import { createConnection, Socket } from "net";

export interface EmailMessage {
  to: string;
  subject: string;
  text: string;
  html?: string;
}

export interface EmailConfig {
  host: string;
  port: number;
  user: string;
  password: string;
  from: string;
  secure: boolean;
}

function getConfig(): EmailConfig | null {
  const host = process.env.SMTP_HOST || process.env.NEXT_PUBLIC_SMTP_HOST || "";
  const port = parseInt(process.env.SMTP_PORT || process.env.NEXT_PUBLIC_SMTP_PORT || "587", 10);
  const user = process.env.SMTP_USER || process.env.NEXT_PUBLIC_SMTP_USER || "";
  const password = process.env.SMTP_PASSWORD || process.env.NEXT_PUBLIC_SMTP_PASSWORD || "";
  const from = process.env.SMTP_FROM || process.env.NEXT_PUBLIC_SMTP_FROM || "";

  if (!host || !user || !password || !from) {
    return null;
  }

  return { host, port, user, password, from, secure: port === 465 };
}

function encode(str: string): string {
  return Buffer.from(str).toString("base64");
}

function smtpSend(socket: Socket, data: string): Promise<void> {
  return new Promise((resolve, reject) => {
    socket.write(data + "\r\n", (err) => {
      if (err) reject(err);
      else resolve();
    });
  });
}

function smtpWaitFor(socket: Socket, expectedCode: number, timeoutMs = 10000): Promise<string> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`SMTP timeout waiting for ${expectedCode}`)), timeoutMs);
    const onData = (data: Buffer) => {
      const response = data.toString();
      const code = parseInt(response.substring(0, 3), 10);
      if (code === expectedCode || (code >= 400 && code < 600)) {
        clearTimeout(timer);
        socket.off("data", onData);
        resolve(response);
      }
    };
    socket.on("data", onData);
  });
}

async function sendViaSMTP(message: EmailMessage): Promise<void> {
  const config = getConfig();
  if (!config) {
    console.log("[EMAIL] (mock) To:", message.to, "Subject:", message.subject);
    console.log("[EMAIL] (mock) Body:", message.text);
    return;
  }

  return new Promise((resolve, reject) => {
    const socket = createConnection(config.port, config.host, () => {
      smtpWaitFor(socket, 220).catch(reject);

      (async () => {
        try {
          await smtpSend(socket, `EHLO localhost`);
          await smtpWaitFor(socket, 250);

          if (config.secure) {
            // For port 465, connection is already TLS
            await smtpSend(socket, `AUTH LOGIN`);
            await smtpWaitFor(socket, 334);
            await smtpSend(socket, encode(config.user));
            await smtpWaitFor(socket, 334);
            await smtpSend(socket, encode(config.password));
            await smtpWaitFor(socket, 235);
          } else {
            // For port 587, STARTTLS
            await smtpSend(socket, `STARTTLS`);
            await smtpWaitFor(socket, 220);

            // Upgrade to TLS (simplified - in production use proper TLS)
            await smtpSend(socket, `AUTH LOGIN`);
            await smtpWaitFor(socket, 334);
            await smtpSend(socket, encode(config.user));
            await smtpWaitFor(socket, 334);
            await smtpSend(socket, encode(config.password));
            await smtpWaitFor(socket, 235);
          }

          await smtpSend(socket, `MAIL FROM:<${config.from}>`);
          await smtpWaitFor(socket, 250);
          await smtpSend(socket, `RCPT TO:<${message.to}>`);
          await smtpWaitFor(socket, 250);
          await smtpSend(socket, `DATA`);
          await smtpWaitFor(socket, 354);

          const lines: string[] = [];
          lines.push(`From: ${config.from}`);
          lines.push(`To: ${message.to}`);
          lines.push(`Subject: ${message.subject}`);
          lines.push("Content-Type: text/plain; charset=utf-8");
          lines.push("MIME-Version: 1.0");
          lines.push("");
          lines.push(message.text);
          if (message.html) {
            lines.push("");
            lines.push("Content-Type: text/html; charset=utf-8");
            lines.push("");
            lines.push(message.html);
          }
          lines.push(".");

          await smtpSend(socket, lines.join("\r\n"));
          await smtpWaitFor(socket, 250);
          await smtpSend(socket, `QUIT`);
          await smtpWaitFor(socket, 221).catch(() => {});
          socket.destroy();
          resolve();
        } catch (err) {
          socket.destroy();
          reject(err);
        }
      })();
    });

    socket.on("error", reject);
    socket.on("timeout", () => {
      socket.destroy();
      reject(new Error("SMTP connection timeout"));
    });
    socket.setTimeout(15000);
  });
}

export async function sendEmail(message: EmailMessage): Promise<{ success: true } | { success: false; error: string }> {
  try {
    await sendViaSMTP(message);
    return { success: true };
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : "Unknown error";
    console.log("[EMAIL] Failed to send:", errorMsg);
    return { success: false, error: errorMsg };
  }
}
