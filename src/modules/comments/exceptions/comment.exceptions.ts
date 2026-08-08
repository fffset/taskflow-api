import { HttpStatus } from '@nestjs/common';
import { BaseException } from '../../../common/exceptions/base.exception';
import { ErrorCode } from '../../../common/exceptions/error-code.enum';

export class CommentNotFoundException extends BaseException {
  constructor() {
    super(
      'Comment not found',
      HttpStatus.NOT_FOUND,
      ErrorCode.COMMENT_NOT_FOUND,
    );
  }
}

export class CommentForbiddenException extends BaseException {
  constructor() {
    super(
      'You can only edit or delete your own comments',
      HttpStatus.FORBIDDEN,
      ErrorCode.COMMENT_FORBIDDEN,
    );
  }
}
