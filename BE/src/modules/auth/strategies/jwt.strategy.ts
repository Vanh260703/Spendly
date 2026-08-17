import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { AuthUser } from '../../../common/decorators/current-user.decorator';
import { AccessTokenPayload } from '../auth.constants';

/**
 * Xác thực access token từ header `Authorization: Bearer <token>`.
 *
 * `validate()` trả về gì thì Nest gắn nguyên vào `request.user`, và đó là thứ
 * `@CurrentUser()` đọc ra. Cố ý chỉ trả `id` + `email`, **không** query DB mỗi request:
 * token đã ký thì tin được, thêm một round-trip DB cho mọi request là lãng phí.
 * Endpoint nào cần hồ sơ đầy đủ thì tự lấy từ `UsersService`.
 */
@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(config: ConfigService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.getOrThrow<string>('JWT_ACCESS_SECRET'),
    });
  }

  validate(payload: AccessTokenPayload): AuthUser {
    return { id: payload.sub, email: payload.email };
  }
}
