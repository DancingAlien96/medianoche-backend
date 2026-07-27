import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsInt,
  IsString,
  Min,
  MinLength,
} from 'class-validator';

export class CreateProductDto {
  @IsString()
  @MinLength(2)
  name: string;

  @IsString()
  @MinLength(2)
  description: string;

  @Type(() => Number)
  @IsInt()
  @Min(0)
  priceCents: number;

  // Gallery images (at least one). The first is the cover.
  @IsArray()
  @ArrayMinSize(1)
  @IsString({ each: true })
  images: string[];

  @Type(() => Number)
  @IsInt()
  @Min(0)
  stock: number;

  @IsString()
  categoryId: string;
}
