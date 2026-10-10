import { AsyncLocalStorage } from 'async_hooks';
import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Observable } from 'rxjs';
import type { CurrentUser } from '../access/access.service';

/** Who made the current request, and from where — for the audit log. */
export interface RequestContext {
  /** X-Request-Id: the client's (if sensible) or a generated one */
  requestId: string | null;
  ip: string | null;
  userAgent: string | null;
  user: CurrentUser | null;
  apiToken: { id: string; name: string } | null;
}

const storage = new AsyncLocalStorage<RequestContext>();

/** The context of the request being handled, if any. */
export const currentRequest = (): RequestContext | undefined => storage.getStore();

/**
 * Makes the request's user, API token, address and browser available to
 * services (see currentRequest). Runs after the guards, which identify them.
 */
@Injectable()
export class RequestContextInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const req = context.switchToHttp().getRequest();
    const store: RequestContext = {
      requestId: req?.requestId ?? null,
      ip: req?.ip ?? null,
      userAgent: req?.headers?.['user-agent']?.slice(0, 500) ?? null,
      user: req?.user ?? null,
      apiToken: req?.apiToken ?? null,
    };
    return new Observable((subscriber) => storage.run(store, () => next.handle().subscribe(subscriber)));
  }
}
