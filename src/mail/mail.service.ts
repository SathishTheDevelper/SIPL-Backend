import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import nodemailer, { Transporter } from 'nodemailer';

export interface PasswordResetMail {
  to: string;
  token: string;
}

@Injectable()
export class MailService implements OnModuleDestroy {
  private readonly logger = new Logger(MailService.name);
  private transporter: Transporter | null = null;
  readonly sent: PasswordResetMail[] = [];

  constructor(private readonly configService: ConfigService) {
    const host = this.configService.get<string>('mail.host', '');
    if (host) {
      this.transporter = nodemailer.createTransport({
        host,
        port: this.configService.get<number>('mail.port', 587),
        secure: this.configService.get<boolean>('mail.secure', false),
        auth: this.configService.get<string>('mail.user')
          ? {
              user: this.configService.get<string>('mail.user'),
              pass: this.configService.get<string>('mail.pass'),
            }
          : undefined,
      });
    }
  }

  async sendMail(payload: {
    to: string;
    subject: string;
    text: string;
  }): Promise<void> {
    const from = this.configService.get<string>('mail.from');
    if (!this.transporter) {
      this.logger.log(`Mail queued for ${payload.to}: ${payload.subject}`);
      return;
    }
    await this.transporter.sendMail({
      from,
      to: payload.to,
      subject: payload.subject,
      text: payload.text,
    });
  }

  async sendPasswordReset(payload: PasswordResetMail): Promise<void> {
    this.sent.push(payload);
    const from = this.configService.get<string>('mail.from');
    const resetUrl = `https://app.local/reset-password?token=${payload.token}`;

    if (!this.transporter) {
      this.logger.log(`Password reset email queued for ${payload.to}`);
      return;
    }

    await this.transporter.sendMail({
      from,
      to: payload.to,
      subject: 'SIPL Workflow 360 password reset',
      text: `Use this one-time token to reset your password. It expires shortly.\n\n${resetUrl}`,
    });
  }

  async onModuleDestroy(): Promise<void> {
    this.transporter = null;
  }
}
