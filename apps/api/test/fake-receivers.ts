import { createServer, IncomingHttpHeaders, Server } from 'http';
import type { AddressInfo } from 'net';
import { SMTPServer } from 'smtp-server';

export interface ReceivedRequest {
  path: string;
  headers: IncomingHttpHeaders;
  raw: string;
  body: any;
}

/** Records webhook calls (Slack, Teams, generic) — any path, answers `status`. */
export class FakeWebhooks {
  readonly requests: ReceivedRequest[] = [];
  status = 200;
  private server!: Server;
  url = '';

  async start() {
    this.server = createServer((req, res) => {
      let raw = '';
      req.on('data', (c) => (raw += c));
      req.on('end', () => {
        this.requests.push({ path: req.url ?? '', headers: req.headers, raw, body: JSON.parse(raw || '{}') });
        res.writeHead(this.status).end();
      });
    });
    await new Promise<void>((resolve) => this.server.listen(0, '127.0.0.1', resolve));
    this.url = `http://127.0.0.1:${(this.server.address() as AddressInfo).port}`;
  }

  stop() {
    return new Promise((resolve) => this.server.close(resolve));
  }

  to(path: string) {
    return this.requests.filter((r) => r.path === path);
  }
}

/** A real SMTP server that keeps the raw messages it receives. */
export class FakeSmtp {
  /** `raw` with the quoted-printable encoding undone */
  readonly messages: { to: string[]; raw: string }[] = [];
  private server!: SMTPServer;
  url = '';

  async start() {
    this.server = new SMTPServer({
      authOptional: true,
      disabledCommands: ['STARTTLS'],
      onData: (stream, session, callback) => {
        let raw = '';
        stream.on('data', (c) => (raw += c));
        stream.on('end', () => {
          // Undo quoted-printable soft line breaks and escapes, so long links can be matched
          const decoded = raw
            .replace(/=\r?\n/g, '')
            .replace(/=([0-9A-F]{2})/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)));
          this.messages.push({ to: session.envelope.rcptTo.map((r) => r.address), raw: decoded });
          callback();
        });
      },
    });
    await new Promise<void>((resolve) => this.server.listen(0, '127.0.0.1', () => resolve()));
    const { port } = this.server.server.address() as AddressInfo;
    this.url = `smtp://127.0.0.1:${port}?ignoreTLS=true`;
  }

  stop() {
    return new Promise((resolve) => this.server.close(() => resolve(undefined)));
  }
}
