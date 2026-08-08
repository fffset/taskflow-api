import { HttpStatus } from '@nestjs/common';
import { BaseException } from 'src/common/exceptions/base.exception';
import { ErrorCode } from 'src/common/exceptions/error-code.enum';

export class InvalidCredentialsException extends BaseException {
  constructor() {
    super(
      'Invalid email or password',
      HttpStatus.UNAUTHORIZED,
      ErrorCode.AUTH_INVALID_CREDENTIALS,
    );
  }
}

export class EmailAlreadyExistsException extends BaseException {
  constructor() {
    super(
      'Email address is already in use',
      HttpStatus.CONFLICT,
      ErrorCode.AUTH_EMAIL_ALREADY_EXISTS,
    );
  }
}

export class TokenExpiredException extends BaseException {
  constructor() {
    super(
      'Token has expired',
      HttpStatus.UNAUTHORIZED,
      ErrorCode.AUTH_TOKEN_EXPIRED,
    );
  }
}

export class TokenInvalidException extends BaseException {
  constructor() {
    super(
      'Token is invalid',
      HttpStatus.UNAUTHORIZED,
      ErrorCode.AUTH_TOKEN_INVALID,
    );
  }
}

export class TwoFactorRequiredException extends BaseException {
  constructor() {
    super(
      'Two-factor authentication code required',
      HttpStatus.UNAUTHORIZED,
      ErrorCode.AUTH_2FA_REQUIRED,
    );
  }
}

export class TwoFactorInvalidException extends BaseException {
  constructor() {
    super(
      'Invalid two-factor authentication code',
      HttpStatus.UNAUTHORIZED,
      ErrorCode.AUTH_2FA_INVALID_CODE,
    );
  }
}
