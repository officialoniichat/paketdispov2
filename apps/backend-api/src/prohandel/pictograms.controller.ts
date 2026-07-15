import { Controller, Get, Header, NotFoundException, Param } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { Public } from '../auth/rbac.js';
import { PICTOGRAM_SVGS } from './pictogram-assets.js';

/**
 * Arbeitsschritt-Piktogramme (A4, „Piktogramme liegen auf dem Server"): echte
 * Line-Art-Grafiken unter `/static/pictograms/<code>.svg`, an der Bildsprache der
 * L+T-Arbeitsanweisung orientiert (u. a. die aus der AW vektorisierte Handschuh-
 * Grafik für „Preisetiketten anbringen"). Öffentlich lesbar (reine Bild-Assets,
 * keine Fachdaten), aus der OpenAPI-Spec ausgenommen: die PWA bindet die URL
 * direkt als <img> ein. Siehe {@link PICTOGRAM_SVGS}.
 */
@ApiExcludeController()
@Public()
@Controller('static/pictograms')
export class PictogramsController {
  @Get(':file')
  @Header('Content-Type', 'image/svg+xml')
  // Mock-Assets werden serverseitig generiert (keine gehashten Dateinamen); daher
  // revalidieren statt einen Tag hart cachen, sonst zeigen Updates nicht durch.
  @Header('Cache-Control', 'no-cache')
  pictogram(@Param('file') file: string): string {
    const code = file.replace(/\.svg$/, '');
    const svg = PICTOGRAM_SVGS[code];
    if (svg === undefined) {
      throw new NotFoundException(`Unbekanntes Piktogramm "${code}"`);
    }
    return svg;
  }
}
