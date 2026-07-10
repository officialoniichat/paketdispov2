import { Body, Controller, HttpCode, HttpStatus, Inject, Post, UnauthorizedException } from '@nestjs/common';
import { ApiOkResponse, ApiTags, ApiUnauthorizedResponse } from '@nestjs/swagger';
import { Public } from './rbac.js';
import { LoginService } from './login.service.js';
import { LoginRequestDto, LoginResponseDto } from './login.dto.js';

/** Generic message for every invalid-credential case — for the privileged roles
 * it never distinguishes an unknown employeeNo from a wrong PIN (no user
 * enumeration). */
const INVALID_CREDENTIALS_MESSAGE = 'Ungültige Anmeldedaten';

@ApiTags('auth')
@Controller('api/auth')
export class LoginController {
  constructor(@Inject(LoginService) private readonly loginService: LoginService) {}

  @Public()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ type: LoginResponseDto })
  @ApiUnauthorizedResponse({ description: INVALID_CREDENTIALS_MESSAGE })
  async login(@Body() body: LoginRequestDto): Promise<LoginResponseDto> {
    const result = await this.loginService.login(body.employeeNo, body.pin);
    if (!result) {
      throw new UnauthorizedException(INVALID_CREDENTIALS_MESSAGE);
    }
    return result;
  }
}
