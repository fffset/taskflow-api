import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString,
  MinLength,
  MaxLength,
  IsOptional,
  IsEnum,
  IsDateString,
} from 'class-validator';
import { TaskPriority } from '@prisma/client';

export class CreateTaskDto {
  @ApiProperty({ example: 'Implement JWT refresh token' })
  @IsString()
  @MinLength(1)
  @MaxLength(256)
  title!: string;

  @ApiPropertyOptional({ example: 'Add refresh token rotation logic' })
  @IsOptional()
  @IsString()
  @MaxLength(2048)
  description?: string;

  @ApiProperty({ description: 'TaskStatus id' })
  @IsString()
  statusId!: string;

  @ApiPropertyOptional({ enum: TaskPriority, example: TaskPriority.MEDIUM })
  @IsOptional()
  @IsEnum(TaskPriority)
  priority?: TaskPriority;

  @ApiPropertyOptional({ example: '2026-07-01T00:00:00.000Z' })
  @IsOptional()
  @IsDateString()
  dueDate?: string;

  @ApiPropertyOptional({ description: "Atanacak kullanıcının id'si" })
  @IsOptional()
  @IsString()
  assigneeId?: string;

  @ApiPropertyOptional({ description: 'Parent task id (sub-task için)' })
  @IsOptional()
  @IsString()
  parentId?: string;
}
