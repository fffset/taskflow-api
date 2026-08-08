import { HttpStatus } from '@nestjs/common';
import { BaseException } from '../../../common/exceptions/base.exception';
import { ErrorCode } from '../../../common/exceptions/error-code.enum';

export class TaskNotFoundException extends BaseException {
  constructor() {
    super('Task not found', HttpStatus.NOT_FOUND, ErrorCode.TASK_NOT_FOUND);
  }
}

export class TaskForbiddenException extends BaseException {
  constructor() {
    super(
      'You do not have permission to perform this action',
      HttpStatus.FORBIDDEN,
      ErrorCode.TASK_FORBIDDEN,
    );
  }
}

export class TaskStatusNotFoundException extends BaseException {
  constructor() {
    super(
      'Task status not found',
      HttpStatus.NOT_FOUND,
      ErrorCode.TASK_NOT_FOUND,
    );
  }
}
