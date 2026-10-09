import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac, randomBytes } from 'crypto';
import type {
  CreatedNotificationChannel,
  CreateNotificationChannelDto,
  NotificationChannel,
  NotificationChannelType,
  NotificationEvent,
  WebhookPayload,
} from '@optik/shared';
import type { NotificationChannel as ChannelRow } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import { SecretBox } from '../common/secret-box';
import { publicUrl } from '../common/public-url';
import { AccessService, CurrentUser } from '../access/access.service';
import { MailerService } from './mailer.service';

const EVENTS: NotificationEvent[] = ['run.needs_review', 'run.reviewed'];
const TYPES: NotificationChannelType[] = ['slack', 'teams', 'webhook', 'email'];
const EMAIL = /^[^\s@]+@[^\s@]+$/;
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

/** What a notification says, before it is formatted for a channel. */
interface Message {
  event: NotificationEvent;
  title: string;
  text: string;
  url: string | null;
  payload: WebhookPayload;
}

/**
 * Notifies a project's channels — Slack, Microsoft Teams (Workflows
 * webhook), generic webhooks (signed with HMAC-SHA256) and e-mail — when a
 * run has changes to review and when they have been reviewed.
 *
 * Delivery never fails the request that triggered it: errors are logged.
 * Targets are stored encrypted, since webhook URLs are credentials.
 */
@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly secrets: SecretBox,
    private readonly access: AccessService,
    private readonly mailer: MailerService,
    private readonly config: ConfigService,
  ) {}

  // ---------------------------------------------------------------- channels

  async list(user: CurrentUser, slug: string): Promise<NotificationChannel[]> {
    const { project } = await this.access.requireProject(user, { slug }, 'maintainer');
    const rows = await this.prisma.notificationChannel.findMany({
      where: { projectId: project.id },
      orderBy: { createdAt: 'asc' },
    });
    return rows.map(toDto);
  }

  async create(
    user: CurrentUser,
    slug: string,
    dto: CreateNotificationChannelDto,
  ): Promise<CreatedNotificationChannel> {
    const { project } = await this.access.requireProject(user, { slug }, 'maintainer');
    if (!TYPES.includes(dto?.type)) {
      throw new BadRequestException(`type must be one of ${TYPES.join(', ')}`);
    }
    const events = dto.events ?? EVENTS;
    if (!Array.isArray(events) || events.length === 0 || !events.every((e) => EVENTS.includes(e))) {
      throw new BadRequestException(`events must be some of ${EVENTS.join(', ')}`);
    }

    const { target, label } = validTarget(dto.type, dto.target);
    if (dto.type === 'email' && !this.mailer.enabled) {
      throw new BadRequestException('E-mail notifications need SMTP_URL to be configured on the server');
    }
    const webhookSecret = dto.type === 'webhook' ? randomBytes(32).toString('hex') : undefined;

    const row = await this.prisma.notificationChannel.create({
      data: {
        projectId: project.id,
        type: dto.type,
        targetEncrypted: this.secrets.encrypt(target),
        label,
        secretEncrypted: webhookSecret ? this.secrets.encrypt(webhookSecret) : null,
        events,
      },
    });
    return { ...toDto(row), ...(webhookSecret ? { webhookSecret } : {}) };
  }

  async remove(user: CurrentUser, slug: string, id: string): Promise<void> {
    const { project } = await this.access.requireProject(user, { slug }, 'maintainer');
    await this.prisma.notificationChannel.deleteMany({ where: { id, projectId: project.id } });
  }

  /** Sends a test message to one channel; true if it was delivered. */
  async test(user: CurrentUser, slug: string, id: string): Promise<{ delivered: boolean }> {
    const { project } = await this.access.requireProject(user, { slug }, 'maintainer');
    const channel = await this.prisma.notificationChannel.findFirst({
      where: { id, projectId: project.id },
    });
    if (!channel) throw new NotFoundException(`Channel "${id}" not found`);
    const message: Message = {
      event: 'run.needs_review',
      title: `optik test notification for ${project.name}`,
      text: 'If you can read this, notifications for this project work.',
      url: null,
      payload: {
        event: 'run.needs_review',
        project: { slug: project.slug, name: project.name },
        run: { id: 'test', branch: 'main', suite: 'test', commitSha: '0'.repeat(40), pendingCount: 0, changedCount: 0 },
        reviewUrl: null,
      },
    };
    return { delivered: await this.deliver(channel, message) };
  }

  // ---------------------------------------------------------------- dispatch

  /** Notifies all channels of the run's project that subscribed to the event. */
  async notifyRun(runId: string, event: NotificationEvent): Promise<void> {
    const run = await this.prisma.run.findUnique({
      where: { id: runId },
      include: {
        project: { include: { notificationChannels: { where: { events: { has: event } } } } },
        snapshots: { select: { status: true } },
      },
    });
    if (!run || run.project.notificationChannels.length === 0) return;

    const pending = run.snapshots.filter((s) => s.status === 'pending').length;
    const changed = run.snapshots.filter((s) => ['pending', 'approved', 'rejected'].includes(s.status)).length;
    const rejected = run.snapshots.filter((s) => s.status === 'rejected').length;
    const base = publicUrl(this.config, run.serverUrl);
    const url = base ? `${base}/${run.project.slug}/${run.id}` : null;
    const where = `${run.project.name} · ${run.branch} · ${run.suite}`;

    const payload: WebhookPayload = {
      event,
      project: { slug: run.project.slug, name: run.project.name },
      run: {
        id: run.id,
        branch: run.branch,
        suite: run.suite,
        commitSha: run.commitSha,
        pendingCount: pending,
        changedCount: changed,
      },
      reviewUrl: url,
    };
    const title =
      event === 'run.needs_review'
        ? `${plural(pending, 'visual change')} to review`
        : rejected > 0
          ? `Review done — ${plural(rejected, 'change')} rejected`
          : 'Review done — all changes accepted';
    const text =
      event === 'run.needs_review' ? `${where} (commit ${run.commitSha.slice(0, 7)})` : where;
    const message: Message = { event, title, text, url, payload };

    await Promise.all(run.project.notificationChannels.map((c) => this.deliver(c, message)));
  }

  private async deliver(channel: ChannelRow, message: Message): Promise<boolean> {
    const target = this.secrets.decrypt(channel.targetEncrypted);
    if (!target) {
      this.logger.warn(`Notification channel ${channel.id} can't be decrypted — was JWT_SECRET changed?`);
      return false;
    }
    try {
      switch (channel.type) {
        case 'email':
          return await this.mailer.send({
            to: target.split(','),
            subject: `[optik] ${message.title}`,
            text: [message.title, message.text, message.url].filter(Boolean).join('\n\n'),
          });
        case 'slack':
          return await this.post(target, slack(message));
        case 'teams':
          return await this.post(target, teams(message));
        case 'webhook': {
          const body = JSON.stringify(message.payload);
          const secret = channel.secretEncrypted ? this.secrets.decrypt(channel.secretEncrypted) : null;
          const signature = secret ? createHmac('sha256', secret).update(body).digest('hex') : null;
          return await this.post(target, body, {
            'X-Optik-Event': message.event,
            ...(signature ? { 'X-Optik-Signature': `sha256=${signature}` } : {}),
          });
        }
      }
    } catch (err) {
      this.logger.warn(`Notification to ${channel.type} channel ${channel.label} failed: ${(err as Error).message}`);
      return false;
    }
  }

  private async post(url: string, body: unknown, headers: Record<string, string> = {}) {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...headers },
      body: typeof body === 'string' ? body : JSON.stringify(body),
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) throw new Error(`${res.status} ${await res.text().catch(() => '')}`.trim());
    return true;
  }
}

// -------------------------------------------------------------- formatting

function slack(m: Message) {
  const link = m.url ? `\n<${m.url}|Open review in optik>` : '';
  return { text: `*${m.title}*\n${m.text}${link}` };
}

/** Adaptive Card for a Teams "Workflows" (Power Automate) webhook */
function teams(m: Message) {
  return {
    type: 'message',
    attachments: [
      {
        contentType: 'application/vnd.microsoft.card.adaptive',
        content: {
          $schema: 'http://adaptivecards.io/schemas/adaptive-card.json',
          type: 'AdaptiveCard',
          version: '1.4',
          body: [
            { type: 'TextBlock', text: m.title, weight: 'Bolder', size: 'Medium', wrap: true },
            { type: 'TextBlock', text: m.text, wrap: true },
          ],
          actions: m.url ? [{ type: 'Action.OpenUrl', title: 'Open review in optik', url: m.url }] : [],
        },
      },
    ],
  };
}

// -------------------------------------------------------------- validation

function validTarget(type: NotificationChannelType, value: string | undefined) {
  const target = value?.trim() ?? '';
  if (type === 'email') {
    const addresses = target.split(',').map((a) => a.trim()).filter(Boolean);
    if (addresses.length === 0 || !addresses.every((a) => EMAIL.test(a))) {
      throw new BadRequestException('target must be one or more e-mail addresses, separated by commas');
    }
    return { target: addresses.join(','), label: addresses.join(', ') };
  }
  let url: URL;
  try {
    url = new URL(target);
  } catch {
    throw new BadRequestException('target must be a webhook URL');
  }
  if (!['http:', 'https:'].includes(url.protocol)) {
    throw new BadRequestException('target must be an http(s) URL');
  }
  // The path of Slack / Teams webhook URLs is the secret — show only a hint
  return { target: url.toString(), label: `${url.host}/…${url.pathname.slice(-4)}` };
}

function toDto(r: ChannelRow): NotificationChannel {
  return {
    id: r.id,
    type: r.type,
    label: r.label,
    events: r.events as NotificationEvent[],
    createdAt: r.createdAt.toISOString(),
  };
}
