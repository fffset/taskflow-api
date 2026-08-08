import { HttpException, HttpStatus } from '@nestjs/common';
import { ErrorCode } from './error-code.enum';

export class BaseException extends HttpException {
  constructor(
    message: string,
    statusCode: HttpStatus,
    public readonly errorCode: ErrorCode,
  ) {
    super({ message, errorCode, statusCode }, statusCode);
  }
}
