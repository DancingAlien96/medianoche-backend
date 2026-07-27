import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';

@Injectable()
export class MailService implements OnModuleInit {
  private readonly logger = new Logger(MailService.name);
  private transporter!: nodemailer.Transporter;
  private from = 'Medianoche <no-reply@medianoche.com>';

  constructor(private readonly config: ConfigService) {}

  async onModuleInit() {
    this.from = this.config.get<string>('MAIL_FROM') ?? this.from;
    const host = this.config.get<string>('SMTP_HOST');

    if (host) {
      this.transporter = nodemailer.createTransport({
        host,
        port: Number(this.config.get('SMTP_PORT') ?? 587),
        secure: this.config.get('SMTP_SECURE') === 'true',
        auth: {
          user: this.config.get<string>('SMTP_USER'),
          pass: this.config.get<string>('SMTP_PASS'),
        },
      });
      this.logger.log(`Mail transport: SMTP (${host})`);
      return;
    }

    // Dev fallback: Ethereal test account. Emails are NOT delivered to real
    // inboxes; a preview URL is logged instead. If Ethereal is unreachable
    // (offline), fall back to a JSON transport that just serializes the message.
    try {
      const testAccount = await nodemailer.createTestAccount();
      this.transporter = nodemailer.createTransport({
        host: 'smtp.ethereal.email',
        port: 587,
        secure: false,
        auth: { user: testAccount.user, pass: testAccount.pass },
      });
      this.logger.warn(
        'Mail transport: Ethereal (dev). Emails are NOT delivered — a preview URL is logged per email. Set SMTP_* in .env for real delivery.',
      );
    } catch {
      this.transporter = nodemailer.createTransport({ jsonTransport: true });
      this.logger.warn(
        'Mail transport: JSON (offline fallback). Emails are only logged, not sent.',
      );
    }
  }

  async send(to: string, subject: string, html: string): Promise<void> {
    try {
      const info = await this.transporter.sendMail({
        from: this.from,
        to,
        subject,
        html,
      });
      const preview = nodemailer.getTestMessageUrl(info);
      if (preview) {
        this.logger.log(`Email → ${to} | preview: ${preview}`);
      } else {
        this.logger.log(`Email → ${to} (${info.messageId})`);
      }
    } catch (error) {
      this.logger.error(
        `Failed to send email to ${to}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }
}
