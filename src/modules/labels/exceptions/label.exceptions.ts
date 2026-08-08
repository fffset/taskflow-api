import { HttpStatus } from '@nestjs/common';
import { BaseException } from '../../../common/exceptions/base.exception';
import { ErrorCode } from '../../../common/exceptions/error-code.enum';

export class LabelNotFoundException extends BaseException {
  constructor() {
    super('Label not found', HttpStatus.NOT_FOUND, ErrorCode.LABEL_NOT_FOUND);
  }
}

export class LabelForbiddenException extends BaseException {
  constructor() {
    super(
      'You do not have permission to perform this action',
      HttpStatus.FORBIDDEN,
      ErrorCode.LABEL_FORBIDDEN,
    );
  }
}
