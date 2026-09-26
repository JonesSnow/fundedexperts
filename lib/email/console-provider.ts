import { EmailMessage, EmailProviderInstance, EmailSendResult } from "./types";

export class ConsoleProvider implements EmailProviderInstance {
  validateConfig(): boolean {
    return true;
  }

  getName(): string {
    return "console";
  }

  async send(message: EmailMessage): Promise<EmailSendResult> {
    const sanitizedUrl = (message.html || message.text || "").length > 0 ? "[present]" : "[empty]";
    console.log("[EMAIL][DEV][CONSOLE PROVIDER]");
    console.log("  Template:", message.templateId || "unknown");
    console.log("  Recipient:", message.to);
    console.log("  From:", message.from || "[default]");
    console.log("  Subject:", message.subject);
    console.log("  Body length:", message.text?.length ?? message.html?.length ?? 0, "chars");
    console.log("  HTML present:", sanitizedUrl);
    return { success: true, providerMessageId: `console-${Date.now()}` };
  }
}

export const consoleProvider = new ConsoleProvider();
export default ConsoleProvider;
