import { ApiProperty } from '@nestjs/swagger';
import { IsString, Length } from 'class-validator';

/** Real employee login (employeeNo + PIN) — replaces manual dev-token minting. */
export class LoginRequestDto {
  @ApiProperty() @IsString() employeeNo!: string;
  @ApiProperty() @IsString() @Length(4, 8) pin!: string;
}

export class LoginResponseDto {
  @ApiProperty() token!: string;
}
