import { ApiProperty } from '@nestjs/swagger';
import { IsNumberString, Length } from 'class-validator';
import { LoginDto } from './login.dto';

// LoginDto'dan miras alıyor (email + password validasyonu), Verify2faDto
// ile aynı kod validasyon kuralını (6 haneli, sayısal) ekliyor. Böylece
// intersection type (`LoginDto & { code: string }`) yerine gerçek bir
// class kullanıyoruz — class-validator artık code alanını da doğruluyor.
//
// NOT: import yolu './login.dto' — eğer projende LoginDto farklı bir
// dosya adında tanımlıysa (örn. tüm DTO'lar tek dosyada), bu satırı ona
// göre güncelle. auth.service.ts'te `import { LoginDto } from './dto'`
// (barrel/index dosyası) kullanıldığını gördüm — eğer bu projede de
// öyleyse, bu dosyayı da dto/ klasörünün İÇİNE koyup barrel'a ekle.
export class Login2faDto extends LoginDto {
  @ApiProperty({ example: '123456', description: '6 haneli TOTP kodu' })
  @IsNumberString()
  @Length(6, 6)
  code!: string;
}
