import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString,
  MinLength,
  MaxLength,
  IsOptional,
  Matches,
} from 'class-validator';

export class CreateLabelDto {
  @ApiProperty({ example: 'Bug' })
  @IsString()
  @MinLength(1)
  @MaxLength(64)
  name!: string;

  @ApiPropertyOptional({ example: '#EF4444' })
  @IsOptional()
  @IsString()
  @Matches(/^#[0-9A-Fa-f]{6}$/, { message: 'Color must be a valid hex color' })
  color?: string;
}
