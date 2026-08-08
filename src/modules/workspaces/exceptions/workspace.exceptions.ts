import { HttpStatus } from '@nestjs/common';
import { BaseException } from '../../../common/exceptions/base.exception';
import { ErrorCode } from '../../../common/exceptions/error-code.enum';

export class WorkspaceNotFoundException extends BaseException {
  constructor() {
    super(
      'Workspace not found',
      HttpStatus.NOT_FOUND,
      ErrorCode.WORKSPACE_NOT_FOUND,
    );
  }
}

export class WorkspaceForbiddenException extends BaseException {
  constructor() {
    super(
      'You are not a member of this workspace',
      HttpStatus.FORBIDDEN,
      ErrorCode.WORKSPACE_FORBIDDEN,
    );
  }
}

export class WorkspaceSlugTakenException extends BaseException {
  constructor() {
    super(
      'Workspace slug is already taken',
      HttpStatus.CONFLICT,
      ErrorCode.WORKSPACE_SLUG_TAKEN,
    );
  }
}

export class WorkspaceInviteInvalidException extends BaseException {
  constructor() {
    super(
      'Invite token is invalid',
      HttpStatus.BAD_REQUEST,
      ErrorCode.WORKSPACE_INVITE_INVALID,
    );
  }
}

export class WorkspaceInviteExpiredException extends BaseException {
  constructor() {
    super(
      'Invite token has expired',
      HttpStatus.BAD_REQUEST,
      ErrorCode.WORKSPACE_INVITE_EXPIRED,
    );
  }
}
