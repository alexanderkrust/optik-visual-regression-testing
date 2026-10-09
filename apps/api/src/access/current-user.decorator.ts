import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { CurrentUser } from './access.service';

/** The signed-in user (requires JwtAuthGuard). */
export const User = createParamDecorator(
  (_: unknown, context: ExecutionContext): CurrentUser => context.switchToHttp().getRequest().user,
);
