import { ApiProperty } from '@nestjs/swagger';
import { IsString, MinLength, MaxLength } from 'class-validator';

export class ChangePasswordDto {
  @ApiProperty({ example: 'CurrentPass123!' })
  @IsString()
  currentPassword!: string;

  @ApiProperty({ example: 'NewPass456!' })
  @IsString()
  @MinLength(8)
  @MaxLength(64)
  newPassword!: string;
}
