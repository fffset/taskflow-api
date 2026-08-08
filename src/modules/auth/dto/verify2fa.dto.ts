import { ApiProperty } from '@nestjs/swagger';
import { IsNumberString, Length } from 'class-validator';

export class Verify2faDto {
  @ApiProperty({ example: '123456', description: '6 haneli TOTP kodu' })
  @IsNumberString()
  @Length(6, 6)
  code!: string;
}
