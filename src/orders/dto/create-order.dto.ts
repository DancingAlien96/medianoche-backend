import { PaymentMethod } from '@prisma/client';
import { IsEnum, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class CreateOrderDto {
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  customerName: string;

  @IsString()
  @MinLength(6)
  @MaxLength(30)
  phone: string;

  @IsString()
  @MinLength(4)
  @MaxLength(200)
  address: string;

  @IsString()
  @MinLength(2)
  @MaxLength(100)
  city: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;

  @IsEnum(PaymentMethod)
  paymentMethod: PaymentMethod;
}
