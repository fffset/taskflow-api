import { Module } from '@nestjs/common';
import { WinstonModule } from 'nest-winston';
import * as winston from 'winston';
import 'winston-daily-rotate-file';

@Module({
  imports: [
    WinstonModule.forRoot({
      transports: [
        // Console — development'ta renkli, production'da JSON
        new winston.transports.Console({
          format:
            process.env.NODE_ENV === 'production'
              ? winston.format.json()
              : winston.format.combine(
                  winston.format.colorize(),
                  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
                  winston.format.printf(
                    ({ timestamp, level, message, context }) => {
                      return `[${timestamp as string}] ${level} [${(context as string) ?? 'App'}]: ${message as string}`;
                    },
                  ),
                ),
        }),

        // File — error log
        new winston.transports.DailyRotateFile({
          filename: 'logs/error-%DATE%.log',
          datePattern: 'YYYY-MM-DD',
          level: 'error',
          maxFiles: '7d', // 7 günden eski dosyaları sil
          maxSize: '20m', // 20MB'dan büyüyünce yeni dosya aç
          format: winston.format.combine(
            winston.format.timestamp(),
            winston.format.json(),
          ),
        }),

        // File — combined log
        new winston.transports.DailyRotateFile({
          filename: 'logs/combined-%DATE%.log',
          datePattern: 'YYYY-MM-DD',
          maxFiles: '7d',
          maxSize: '20m',
          format: winston.format.combine(
            winston.format.timestamp(),
            winston.format.json(),
          ),
        }),
      ],
    }),
  ],
  exports: [WinstonModule],
})
export class LoggerModule {}
