import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, Length } from 'class-validator';

/**
 * Login request. The Mitarbeiternummer is always required; the PIN only for the
 * privileged roles (Teamlead/Admin/IT) — the Mitarbeiterrolle signs in with the
 * number alone. The role, and with it the demand for a PIN, is resolved
 * server-side from the database (`LoginService`), never from this payload.
 */
export class LoginRequestDto {
  @ApiProperty() @IsString() employeeNo!: string;

  @ApiPropertyOptional({ description: 'Nur für Teamlead/Admin/IT. Mitarbeiter melden sich ohne PIN an.' })
  @IsOptional()
  @IsString()
  @Length(4, 8)
  pin?: string;
}

export class LoginResponseDto {
  @ApiProperty() token!: string;
}
