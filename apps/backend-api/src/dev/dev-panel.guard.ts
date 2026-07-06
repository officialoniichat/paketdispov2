import { Injectable, NotFoundException, type CanActivate } from '@nestjs/common';
import { config } from '../config.js';

/**
 * Env gate for the /api/dev surface. When `config.dev.panelEnabled` is off
 * (production default) every dev endpoint answers 404 — the surface behaves as
 * if it did not exist. Note the global JwtAuthGuard/RolesGuard still run first
 * (Nest global guards precede route guards), so an unauthenticated probe sees
 * the usual 401 and an authenticated non-admin the usual 403; only a legitimate
 * admin ever reaches this 404.
 */
@Injectable()
export class DevPanelGuard implements CanActivate {
  canActivate(): boolean {
    if (!config.dev.panelEnabled) {
      throw new NotFoundException();
    }
    return true;
  }
}
