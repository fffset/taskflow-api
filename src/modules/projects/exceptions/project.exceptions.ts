import { HttpStatus } from '@nestjs/common';
import { BaseException } from '../../../common/exceptions/base.exception';
import { ErrorCode } from '../../../common/exceptions/error-code.enum';

export class ProjectNotFoundException extends BaseException {
  constructor() {
    super(
      'Project not found',
      HttpStatus.NOT_FOUND,
      ErrorCode.PROJECT_NOT_FOUND,
    );
  }
}

export class ProjectForbiddenException extends BaseException {
  constructor() {
    super(
      'You do not have permission to perform this action',
      HttpStatus.FORBIDDEN,
      ErrorCode.PROJECT_FORBIDDEN,
    );
  }
}

export class ProjectStatusNotFoundException extends BaseException {
  constructor() {
    super(
      'Project status not found',
      HttpStatus.NOT_FOUND,
      ErrorCode.PROJECT_NOT_FOUND,
    );
  }
}
