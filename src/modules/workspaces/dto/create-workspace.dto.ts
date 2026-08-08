import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString,
  MinLength,
  MaxLength,
  IsOptional,
  Matches,
} from 'class-validator';

export class CreateWorkspaceDto {
  @ApiProperty({ example: 'Acme Corp' })
  @IsString()
  @MinLength(2)
  @MaxLength(64)
  name!: string;

  @ApiProperty({ example: 'acme-corp' })
  @IsString()
  @MinLength(2)
  @MaxLength(32)
  @Matches(/^[a-z0-9-]+$/, {
    message: 'Slug can only contain lowercase letters, numbers and hyphens',
  })
  slug!: string;

  @ApiPropertyOptional({ example: 'We build great software' })
  @IsOptional()
  @IsString()
  @MaxLength(256)
  description?: string;
}
