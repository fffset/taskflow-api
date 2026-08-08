import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { BaseException } from '../exceptions/base.exception';
import { ErrorCode } from '../exceptions/error-code.enum';
import { ThrottlerException } from '@nestjs/throttler';

@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(GlobalExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const request = ctx.getRequest<Request>();
    const response = ctx.getResponse<Response>();

    let statusCode = HttpStatus.INTERNAL_SERVER_ERROR;
    let message = 'Internal server error';
    let errorCode: ErrorCode = ErrorCode.INTERNAL_ERROR;

    if (exception instanceof BaseException) {
      statusCode = exception.getStatus();
      const body = exception.getResponse() as {
        message: string;
        errorCode: ErrorCode;
      };
      message = body.message;
      errorCode = body.errorCode;
    } else if (exception instanceof ThrottlerException) {
      statusCode = HttpStatus.TOO_MANY_REQUESTS;
      message = 'Too many requests, please try again later';
      errorCode = ErrorCode.RATE_LIMIT_EXCEEDED;
    } else if (exception instanceof HttpException) {
      statusCode = exception.getStatus();
      const body = exception.getResponse() as string | { message: string };
      message = typeof body === 'string' ? body : body.message;
    } else if (exception instanceof Error) {
      this.logger.error(exception.message, exception.stack);
    }

    response.status(statusCode).json({
      statusCode,
      errorCode,
      message,
      path: request.url,
      method: request.method,
      timestamp: new Date().toISOString(),
    });
  }
}
