import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { CategoriesModule } from '../categories/categories.module';
import { UsersModule } from '../users/users.module';
import { WalletsModule } from '../wallets/wallets.module';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { JwtStrategy } from './strategies/jwt.strategy';

@Module({
  imports: [
    UsersModule,
    WalletsModule,
    CategoriesModule,
    PassportModule,
    // Secret không đặt ở đây: access và refresh dùng HAI secret khác nhau nên mỗi lần
    // ký/verify đều truyền secret tường minh. Lộ secret này không kéo theo secret kia.
    JwtModule.register({}),
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    JwtStrategy,
    // Guard GLOBAL: mọi endpoint đều cần token trừ khi đánh dấu @Public()
    { provide: APP_GUARD, useClass: JwtAuthGuard },
  ],
  exports: [AuthService],
})
export class AuthModule {}
