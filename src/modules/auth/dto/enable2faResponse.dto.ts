import { ApiProperty } from '@nestjs/swagger';

export class Enable2faResponseDto {
  @ApiProperty({ description: 'QR code için otpauth URL' })
  otpAuthUrl!: string;

  @ApiProperty({ description: 'Manuel giriş için secret key' })
  secret!: string;
}
