import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, MinLength, MaxLength, IsOptional } from 'class-validator';

export class CreateProjectDto {
  @ApiProperty({ example: 'Backend Refactor' })
  @IsString()
  @MinLength(2)
  @MaxLength(128)
  name!: string;

  @ApiPropertyOptional({ example: 'Refactor the legacy backend services' })
  @IsOptional()
  @IsString()
  @MaxLength(512)
  description?: string;

  @ApiProperty({ description: 'ProjectStatus id' })
  @IsString()
  statusId!: string;
}
