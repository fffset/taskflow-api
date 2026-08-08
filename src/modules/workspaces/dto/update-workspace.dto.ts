import { PartialType, OmitType } from '@nestjs/swagger';
import { CreateWorkspaceDto } from './create-workspace.dto';

// PartialType → tüm field'ları optional yapar
// OmitType → slug workspace oluşturulduktan sonra değiştirilemez
export class UpdateWorkspaceDto extends PartialType(
  OmitType(CreateWorkspaceDto, ['slug'] as const),
) {}
