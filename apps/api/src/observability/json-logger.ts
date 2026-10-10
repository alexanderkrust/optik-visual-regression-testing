import { ConsoleLogger, LogLevel } from '@nestjs/common';
import { currentRequest } from '../audit/request-context';

/**
 * One JSON object per line (LOG_FORMAT=json), for log collectors such as
 * Loki, Elasticsearch or Cloud Logging. Includes the request ID of the
 * request being handled, if any.
 */
export class JsonLogger extends ConsoleLogger {
  protected printMessages(messages: unknown[], context = '', logLevel: LogLevel = 'log') {
    for (const message of messages) {
      const fields =
        message && typeof message === 'object' && !(message instanceof Error)
          ? (message as Record<string, unknown>)
          : { message: message instanceof Error ? message.message : String(message) };
      const requestId = currentRequest()?.requestId;
      const line = JSON.stringify({
        time: new Date().toISOString(),
        level: logLevel,
        ...(context ? { context } : {}),
        ...(requestId ? { requestId } : {}),
        ...fields,
      });
      (logLevel === 'error' || logLevel === 'fatal' ? process.stderr : process.stdout).write(`${line}\n`);
    }
  }

  protected printStackTrace(stack: string) {
    if (stack) process.stderr.write(`${JSON.stringify({ time: new Date().toISOString(), level: 'error', stack })}\n`);
  }
}
