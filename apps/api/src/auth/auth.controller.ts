import { Controller, Get, Post, Body, HttpCode, HttpStatus, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from './jwt-auth.guard';
import type { CurrentUser } from '../access/access.service';
import { User } from '../access/current-user.decorator';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { AuthService } from './auth.service';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Get('setup')
  @ApiOperation({ summary: 'Whether the first-run setup (creating the admin) is still required' })
  async setup() {
    return { required: await this.authService.setupRequired() };
  }

  @Post('register')
  @ApiOperation({
    summary: 'Bootstrap first user (only works when 0 users exist)',
  })
  register(@Body() body: { email: string; password: string }) {
    return this.authService.register(body.email, body.password);
  }

  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Login and receive tokens' })
  login(@Body() body: { email: string; password: string }) {
    return this.authService.login(body.email, body.password);
  }

  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Refresh access token' })
  refresh(@Body() body: { refreshToken: string }) {
    return this.authService.refresh(body.refreshToken);
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'The signed-in user, incl. their role' })
  me(@User() user: CurrentUser) {
    return user;
  }

  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Logout and invalidate refresh token' })
  async logout(@Body() body: { refreshToken: string }) {
    await this.authService.logout(body.refreshToken);
  }
}
