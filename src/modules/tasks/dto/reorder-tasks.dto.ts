import { ApiProperty } from '@nestjs/swagger';
import { IsArray, IsString } from 'class-validator';

export class ReorderTasksDto {
  @ApiProperty({
    example: ['task_id_1', 'task_id_2', 'task_id_3'],
    description: "Task id'leri yeni sırayla",
  })
  @IsArray()
  @IsString({ each: true })
  taskIds!: string[];
}
