import { HttpStatus } from '@nestjs/common';
import { BaseException } from '../../../common/exceptions/base.exception';
import { ErrorCode } from '../../../common/exceptions/error-code.enum';

export class NotificationNotFoundException extends BaseException {
  constructor() {
    super(
      'Notification not found',
      HttpStatus.NOT_FOUND,
      ErrorCode.NOTIFICATION_NOT_FOUND,
    );
  }
}
