import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsInt, Min, IsOptional } from 'class-validator';

export class MoveTaskDto {
  @ApiProperty({ description: 'Hedef board id' })
  @IsString()
  boardId!: string;

  @ApiPropertyOptional({
    description: 'Yeni position (belirtilmezse sona eklenir)',
  })
  @IsOptional()
  @IsInt()
  @Min(0)
  position?: number;
}
