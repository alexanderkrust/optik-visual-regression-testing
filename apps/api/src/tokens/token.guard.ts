import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
} from '@nestjs/common';
import { TokensService } from './tokens.service';

@Injectable()
export class TokenGuard implements CanActivate {
  constructor(private readonly tokensService: TokensService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest();
    const authHeader: string | undefined = req.headers['authorization'];

    if (!authHeader?.startsWith('Bearer ')) {
      throw new UnauthorizedException(
        'Missing Authorization header. Configure your adapter with a project token: ' +
          'createOptikTest({ token: "optik_..." }) — generate one in the Optik dashboard.',
      );
    }

    const rawToken = authHeader.slice(7);
    const result = await this.tokensService.findByToken(rawToken);
    if (!result) {
      throw new UnauthorizedException(
        'Invalid or revoked token. Generate a new one in the Optik dashboard under project settings.',
      );
    }

    req.projectId = result.projectId;
    req.projectSlug = result.projectSlug;
    req.apiToken = { id: result.id, name: result.name };
    return true;
  }
}
