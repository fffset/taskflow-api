import { ApiProperty } from '@nestjs/swagger';
import { IsString, MinLength, MaxLength } from 'class-validator';

export class CreateBoardDto {
  @ApiProperty({ example: 'Sprint 1' })
  @IsString()
  @MinLength(1)
  @MaxLength(128)
  name!: string;
}
