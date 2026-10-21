import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createTransport } from 'nodemailer';

/** What a message needs. The sender is always MAIL_FROM. */
export interface MailMessage {
  to: string;
  subject: string;
  text: string;
}

/** The part of a nodemailer transport this uses - a test passes its own. */
export interface MailSender {
  sendMail(message: MailMessage & { from: string }): Promise<unknown>;
}

/**
 * EMAIL THE APP SENDS - so far one kind: the link to set a new password
 * (identity/password-reset.service.ts).
 *
 * Any SMTP provider will do, and it is two settings in the server's .env:
 * SMTP_URL (`smtps://user:password@smtp.example.com:465`) and MAIL_FROM
 * (`FamStory <support@famstory.lv>`). Without both this is off and says so,
 * and the app offers the family admin's link instead - which is what the LAN
 * host on the laptop does, having no provider at all.
 *
 * What passes through the provider is an address and a message with a link,
 * never anything a family wrote. It is named in the privacy policy
 * ({{mailer}}, docs/legal/facts.json) and needs its processing agreement
 * before the first message (docs/12-LAUNCH-RUNBOOK.md, section 1).
 */
@Injectable()
export class MailService {
  private sender: MailSender | null = null;

  constructor(private readonly config: ConfigService) {}

  private get url(): string {
    return (this.config.get<string>('SMTP_URL') ?? '').trim();
  }

  private get from(): string {
    return (this.config.get<string>('MAIL_FROM') ?? '').trim();
  }

  get configured(): boolean {
    return this.url.length > 0 && this.from.length > 0;
  }

  /** For tests: a sender that records instead of connecting. */
  useSender(sender: MailSender): void {
    this.sender = sender;
  }

  /** Throws when it could not be handed to the provider; the caller decides what that means. */
  async send(message: MailMessage): Promise<void> {
    if (!this.configured) throw new Error('Email is not set up on this server (SMTP_URL, MAIL_FROM).');
    this.sender ??= createTransport(this.url) as MailSender;
    await this.sender.sendMail({ from: this.from, ...message });
  }
}
