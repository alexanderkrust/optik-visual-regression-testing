import { JsonLogger } from './json-logger';
import { startTracing } from './tracing';

describe('JsonLogger', () => {
  it('writes one JSON object per line', () => {
    const out: string[] = [];
    const stdout = jest.spyOn(process.stdout, 'write').mockImplementation((chunk) => (out.push(String(chunk)), true));
    const stderr = jest.spyOn(process.stderr, 'write').mockImplementation((chunk) => (out.push(String(chunk)), true));
    const logger = new JsonLogger();
    logger.log('optik running', 'Bootstrap');
    logger.log({ message: 'GET /api/runs 200 3ms', status: 200 }, 'HTTP');
    logger.error('broken', undefined, 'Storage');
    stdout.mockRestore();
    stderr.mockRestore();

    const lines = out.map((l) => JSON.parse(l));
    expect(lines[0]).toMatchObject({ level: 'log', context: 'Bootstrap', message: 'optik running', time: expect.any(String) });
    expect(lines[1]).toMatchObject({ context: 'HTTP', message: 'GET /api/runs 200 3ms', status: 200 });
    expect(lines[2]).toMatchObject({ level: 'error', context: 'Storage', message: 'broken' });
  });
});

describe('tracing', () => {
  it('stays off without an OTLP endpoint', () => {
    expect(startTracing({})).toBeNull();
  });
});
