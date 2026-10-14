import { EmailMessage, EmailProviderInstance, EmailSendResult } from "./types";

export class ConsoleProvider implements EmailProviderInstance {
  validateConfig(): boolean {
    return true;
  }

  getName(): string {
    return "console";
  }

  async send(message: EmailMessage): Promise<EmailSendResult> {
    const recipientDomain = message.to.includes("@") ? message.to.split("@").pop() : "unknown";
    console.log("[EMAIL][DEV][CONSOLE PROVIDER]");
    console.log("  Template:", message.templateId || "unknown");
    console.log("  Recipient domain:", recipientDomain || "unknown");
    console.log("  Message content:", (message.html || message.text) ? "present" : "empty");
    return { success: false, error: "email_console_mode_no_delivery" };
  }
}

export const consoleProvider = new ConsoleProvider();
export default ConsoleProvider;
