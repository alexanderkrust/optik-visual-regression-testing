import { createServer, Server } from 'http';
import type { AddressInfo } from 'net';

export interface StatusCall {
  repo: string;
  sha: string;
  authorization: string | undefined;
  state: string;
  description: string;
  context: string;
  target_url?: string;
}

/** Records commit status calls like GitHub's (or GHE's) REST API would receive them. */
export class FakeGitHub {
  readonly calls: StatusCall[] = [];
  /** HTTP status to answer with, e.g. 500 to simulate an outage */
  respondWith = 201;
  private server!: Server;

  async start(): Promise<string> {
    this.server = createServer((req, res) => {
      let body = '';
      req.on('data', (chunk) => (body += chunk));
      req.on('end', () => {
        const match = req.url?.match(/^\/repos\/([^/]+\/[^/]+)\/statuses\/([0-9a-f]+)$/);
        if (req.method === 'POST' && match) {
          this.calls.push({
            repo: match[1],
            sha: match[2],
            authorization: req.headers.authorization,
            ...JSON.parse(body),
          });
        }
        res.writeHead(this.respondWith, { 'Content-Type': 'application/json' }).end('{}');
      });
    });
    await new Promise<void>((resolve) => this.server.listen(0, '127.0.0.1', resolve));
    return `http://127.0.0.1:${(this.server.address() as AddressInfo).port}`;
  }

  stop() {
    return new Promise((resolve) => this.server.close(resolve));
  }

  /** Statuses reported for one commit, oldest first. */
  forCommit(sha: string) {
    return this.calls.filter((c) => c.sha === sha);
  }
}
