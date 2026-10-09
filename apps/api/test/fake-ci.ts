import { createServer, IncomingHttpHeaders, Server } from 'http';
import type { AddressInfo } from 'net';

export interface CiCall {
  method: string;
  /** Path including the query string */
  path: string;
  headers: IncomingHttpHeaders;
  body: any;
}

/**
 * Records the requests a CI system's API (GitHub, GitLab, Bitbucket, Azure
 * DevOps) would receive, answering every one with `respondWith`.
 */
export class FakeCi {
  readonly calls: CiCall[] = [];
  /** HTTP status to answer with, e.g. 500 to simulate an outage */
  respondWith = 201;
  responseBody = '{}';
  private server!: Server;

  async start(): Promise<string> {
    this.server = createServer((req, res) => {
      let body = '';
      req.on('data', (chunk) => (body += chunk));
      req.on('end', () => {
        this.calls.push({
          method: req.method ?? '',
          path: req.url ?? '',
          headers: req.headers,
          body: body ? JSON.parse(body) : null,
        });
        res.writeHead(this.respondWith, { 'Content-Type': 'application/json' }).end(this.responseBody);
      });
    });
    await new Promise<void>((resolve) => this.server.listen(0, '127.0.0.1', resolve));
    return `http://127.0.0.1:${(this.server.address() as AddressInfo).port}`;
  }

  stop() {
    return new Promise((resolve) => this.server.close(resolve));
  }

  reset() {
    this.calls.length = 0;
    this.respondWith = 201;
    this.responseBody = '{}';
  }

  /** Calls whose path contains `fragment` (e.g. a commit SHA), oldest first. */
  matching(fragment: string) {
    return this.calls.filter((c) => c.path.includes(fragment));
  }
}
