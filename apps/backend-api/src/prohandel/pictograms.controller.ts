import { Controller, Get, Header, NotFoundException, Param } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { SECURITY_PICTOGRAM_CODES } from '@paket/domain-types';
import { Public } from '../auth/rbac.js';

/**
 * Sicherungstyp-Piktogramme (A4): „Piktogramme liegen auf dem Server". Mock-Assets —
 * je Code ein deterministisch generiertes SVG unter `/static/pictograms/<code>.svg`.
 * Öffentlich lesbar (reine Bild-Assets, keine Fachdaten), von der OpenAPI-Spec
 * ausgenommen: die Frontends binden die URL direkt in <img> ein.
 */
const PICTOGRAM_LABELS: Readonly<Record<string, string>> = {
  'hard-tag': 'Hartetikett',
  'ink-tag': 'Farbetikett',
  'spider-wrap': 'Spinnensicherung',
  'safer-box': 'Safer-Box',
  'cable-lock': 'Kabelschloss',
};

function pictogramSvg(code: string, label: string): string {
  // Simple deterministic glyph: circle + code initials, brand-blue on white.
  const initials = code
    .split('-')
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('');
  return [
    '<svg xmlns="http://www.w3.org/2000/svg" width="96" height="96" viewBox="0 0 96 96" role="img" aria-label="' +
      label +
      '">',
    '<rect width="96" height="96" rx="12" fill="#ffffff" stroke="#1a4f8b" stroke-width="4"/>',
    '<circle cx="48" cy="40" r="22" fill="none" stroke="#1a4f8b" stroke-width="4"/>',
    `<text x="48" y="47" text-anchor="middle" font-family="system-ui, sans-serif" font-size="18" font-weight="700" fill="#1a4f8b">${initials}</text>`,
    `<text x="48" y="82" text-anchor="middle" font-family="system-ui, sans-serif" font-size="11" fill="#1a4f8b">${label}</text>`,
    '</svg>',
  ].join('');
}

@ApiExcludeController()
@Public()
@Controller('static/pictograms')
export class PictogramsController {
  @Get(':file')
  @Header('Content-Type', 'image/svg+xml')
  @Header('Cache-Control', 'public, max-age=86400')
  pictogram(@Param('file') file: string): string {
    const code = file.replace(/\.svg$/, '');
    if (!SECURITY_PICTOGRAM_CODES.includes(code)) {
      throw new NotFoundException(`Unbekanntes Piktogramm "${code}"`);
    }
    return pictogramSvg(code, PICTOGRAM_LABELS[code] ?? code);
  }
}
