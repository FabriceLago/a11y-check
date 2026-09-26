import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import nodemailer from 'nodemailer';

export type Mail = {
  to: string;
  subject: string;
  html: string;
  text: string;
  attachments?: { filename: string; content: Buffer; contentType: string }[];
};
export type SendMail = (mail: Mail) => Promise<void>;

/**
 * SMTP when SMTP_HOST is set (Brevo: smtp-relay.brevo.com, port 587).
 * Otherwise nothing leaves the machine: each e-mail is written as a .eml file in MAIL_DIR.
 */
export function createMailer(env: NodeJS.ProcessEnv = process.env): SendMail {
  const from = env.MAIL_FROM ?? "Vérificateur d'accessibilité <no-reply@example.invalid>";

  if (env.SMTP_HOST) {
    const transport = nodemailer.createTransport({
      host: env.SMTP_HOST,
      port: Number(env.SMTP_PORT ?? 587),
      auth: { user: env.SMTP_USER, pass: env.SMTP_PASS },
    });
    return async (mail) => {
      await transport.sendMail({ from, ...mail });
    };
  }

  const dir = env.MAIL_DIR ?? 'mails';
  const transport = nodemailer.createTransport({ streamTransport: true, buffer: true });
  return async (mail) => {
    const { message } = await transport.sendMail({ from, ...mail });
    await mkdir(dir, { recursive: true });
    await writeFile(join(dir, `${Date.now()}-${mail.to.replace(/[^a-z0-9@.-]/gi, '_')}.eml`), message as Buffer);
  };
}
