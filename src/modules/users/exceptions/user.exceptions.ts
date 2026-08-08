import { HttpStatus } from '@nestjs/common';
import { BaseException } from '../../../common/exceptions/base.exception';
import { ErrorCode } from '../../../common/exceptions/error-code.enum';

export class UserNotFoundException extends BaseException {
  constructor() {
    super('User not found', HttpStatus.NOT_FOUND, ErrorCode.USER_NOT_FOUND);
  }
}

export class InvalidPasswordException extends BaseException {
  constructor() {
    super(
      'Current password is incorrect',
      HttpStatus.UNAUTHORIZED,
      ErrorCode.AUTH_INVALID_CREDENTIALS,
    );
  }
}
