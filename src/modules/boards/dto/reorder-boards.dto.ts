import { ApiProperty } from '@nestjs/swagger';
import { IsArray, IsString } from 'class-validator';

// Board sıralama için — sadece id listesi gönderilir, position otomatik atanır
export class ReorderBoardsDto {
  @ApiProperty({
    example: ['board_id_1', 'board_id_2', 'board_id_3'],
    description: "Board id'leri yeni sırayla",
  })
  @IsArray()
  @IsString({ each: true })
  boardIds!: string[];
}
