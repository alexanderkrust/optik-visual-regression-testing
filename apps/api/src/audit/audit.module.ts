import { Global, Module } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { AuditTrail } from './audit-trail';
import { RequestContextInterceptor } from './request-context';

@Global()
@Module({
  providers: [AuditTrail, { provide: APP_INTERCEPTOR, useClass: RequestContextInterceptor }],
  exports: [AuditTrail],
})
export class AuditModule {}
