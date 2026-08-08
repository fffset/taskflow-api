import { HttpStatus } from '@nestjs/common';
import { BaseException } from '../../../common/exceptions/base.exception';
import { ErrorCode } from '../../../common/exceptions/error-code.enum';

export class BoardNotFoundException extends BaseException {
  constructor() {
    super('Board not found', HttpStatus.NOT_FOUND, ErrorCode.BOARD_NOT_FOUND);
  }
}

export class BoardForbiddenException extends BaseException {
  constructor() {
    super(
      'You do not have permission to perform this action',
      HttpStatus.FORBIDDEN,
      ErrorCode.BOARD_FORBIDDEN,
    );
  }
}
