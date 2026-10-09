import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createTransport, Transporter } from 'nodemailer';

export interface Mail {
  to: string | string[];
  subject: string;
  text: string;
  html?: string;
}

/**
 * Sends e-mail through the SMTP server in SMTP_URL (e.g.
 * smtp://user:password@mail.example.com:587), from SMTP_FROM. Without
 * SMTP_URL, e-mail is simply disabled.
 */
@Injectable()
export class MailerService {
  private readonly logger = new Logger(MailerService.name);
  private readonly transport: Transporter | null;
  private readonly from: string;

  constructor(config: ConfigService) {
    const url = config.get<string>('SMTP_URL');
    this.transport = url ? createTransport(url) : null;
    this.from = config.get<string>('SMTP_FROM') || 'optik <optik@localhost>';
  }

  get enabled() {
    return this.transport !== null;
  }

  /** True if the mail was handed to the SMTP server. Never throws. */
  async send(mail: Mail): Promise<boolean> {
    if (!this.transport) return false;
    try {
      await this.transport.sendMail({ from: this.from, ...mail });
      return true;
    } catch (err) {
      this.logger.warn(`Sending "${mail.subject}" failed: ${(err as Error).message}`);
      return false;
    }
  }
}
