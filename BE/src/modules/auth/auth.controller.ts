import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  Res,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Request, Response } from 'express';
import {
  AuthUser,
  CurrentUser,
} from '../../common/decorators/current-user.decorator';
import { Public } from '../../common/decorators/public.decorator';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { toUserProfile } from '../users/dto/user-profile.dto';
import { UsersService } from '../users/users.service';
import { AuthResult, AuthService } from './auth.service';
import { REFRESH_COOKIE, REFRESH_COOKIE_PATH } from './auth.constants';
import {
  LoginDto,
  RegisterDto,
  loginSchema,
  registerSchema,
} from './dto/auth.dto';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly users: UsersService,
    private readonly config: ConfigService,
  ) {}

  @Public()
  @Post('register')
  async register(
    @Body(new ZodValidationPipe(registerSchema)) dto: RegisterDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    return this.send(await this.auth.register(dto), res);
  }

  @Public()
  @HttpCode(HttpStatus.OK)
  @Post('login')
  async login(
    @Body(new ZodValidationPipe(loginSchema)) dto: LoginDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    return this.send(await this.auth.login(dto), res);
  }

  @Public()
  @HttpCode(HttpStatus.OK)
  @Post('refresh')
  async refresh(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const result = await this.auth.refresh(req.cookies?.[REFRESH_COOKIE] as string);
    return this.send(result, res);
  }

  @Public()
  @HttpCode(HttpStatus.NO_CONTENT)
  @Post('logout')
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    await this.auth.logout(req.cookies?.[REFRESH_COOKIE] as string);
    res.clearCookie(REFRESH_COOKIE, { path: REFRESH_COOKIE_PATH });
  }

  @Get('me')
  async me(@CurrentUser() user: AuthUser) {
    return toUserProfile(await this.users.findById(user.id));
  }

  /**
   * Đặt refresh token vào **httpOnly cookie** và chỉ trả access token trong body.
   *
   * httpOnly khiến JavaScript không đọc được cookie, nên một lỗ hổng XSS trên FE cũng
   * không lấy được refresh token — thứ có hạn dài nhất và nguy hiểm nhất nếu lộ.
   */
  private send(result: AuthResult, res: Response) {
    const { refreshToken, refreshTtlSeconds, ...body } = result;
    const production = this.config.get('NODE_ENV') === 'production';

    res.cookie(REFRESH_COOKIE, refreshToken, {
      httpOnly: true,

      /**
       * Production: FE nằm trên Cloudflare Pages còn BE ở domain khác → **cross-site**.
       * Trình duyệt chỉ gửi kèm cookie khi `sameSite: 'none'`, và `'none'` bắt buộc đi
       * cùng `secure: true` (chỉ qua HTTPS).
       *
       * Dev: `'lax'` + `secure: false` vì localhost chạy HTTP — bật `secure` ở đây thì
       * trình duyệt bỏ cookie và refresh token không bao giờ tới nơi.
       */
      sameSite: production ? 'none' : 'lax',
      secure: production,

      path: REFRESH_COOKIE_PATH,
      maxAge: refreshTtlSeconds * 1000,
    });

    return body;
  }
}
