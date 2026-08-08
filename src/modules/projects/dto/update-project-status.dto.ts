import { PartialType } from '@nestjs/swagger';
import { CreateProjectStatusDto } from './create-project-status.dto';

export class UpdateProjectStatusDto extends PartialType(
  CreateProjectStatusDto,
) {}
