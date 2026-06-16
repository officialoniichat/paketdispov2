/**
 * Reusable Bereich/Skill catalog. Bereiche are NOT free text and NOT admin-editable —
 * they are the FIXED warehouse storage classes (Hängebahn/Palette/Regal), derived from
 * the Lagerklasse (LocationKind). A Beleg's Bereich is fixed by where its goods are
 * stored; employees can only be assigned these values. Single source: @paket/domain-types.
 */
import { BEREICHE } from '@paket/domain-types';

/** The fixed Bereich catalog (labels). */
export function useBereichCatalog(): readonly string[] {
  return BEREICHE;
}
