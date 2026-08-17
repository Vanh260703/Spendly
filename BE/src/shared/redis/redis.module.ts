import { Global, Logger, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import { REDIS_CLIENT } from './redis.constants';
import { RedisService } from './redis.service';

/**
 * `@Global()` — Redis là hạ tầng dùng khắp nơi (cache, rate limit, session, queue).
 * Đánh dấu global để các module domain khỏi phải import lặp đi lặp lại.
 */
@Global()
@Module({
  providers: [
    {
      provide: REDIS_CLIENT,
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const logger = new Logger('Redis');

        const client = new Redis({
          host: config.getOrThrow<string>('REDIS_HOST'),
          port: config.getOrThrow<number>('REDIS_PORT'),

          // Cache thì phải fail nhanh. Không có 2 tùy chọn dưới đây, lệnh sẽ nằm chờ
          // trong hàng đợi khi Redis chết và kéo theo request bị treo.
          maxRetriesPerRequest: 2,
          enableOfflineQueue: false,

          // Backoff tăng dần, tối đa 3s — tránh spam kết nối khi Redis đang xuống
          retryStrategy: (times) => Math.min(times * 200, 3000),
        });

        client.on('connect', () =>
          logger.log(
            `Đã kết nối ${config.get('REDIS_HOST')}:${config.get('REDIS_PORT')}`,
          ),
        );
        // Chỉ `warn`: mất Redis là suy giảm hiệu năng, không phải sự cố dữ liệu.
        // App vẫn phải chạy được (xem RedisService.safe).
        client.on('error', (err) => logger.warn(`Lỗi kết nối: ${err.message}`));

        return client;
      },
    },
    RedisService,
  ],
  exports: [RedisService, REDIS_CLIENT],
})
export class RedisModule {}
