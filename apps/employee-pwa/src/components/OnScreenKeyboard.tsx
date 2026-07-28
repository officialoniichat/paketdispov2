/**
 * Aufklappbare digitale Tastatur (Kundenfeedback „Dashboard ändern" 15.07.2026,
 * Punkt 1). Zielgerät ist der Touchscreen-Monitor an den Packtischen: dort blendet
 * `inputmode` allein KEINE Bildschirmtastatur ein, weil Desktop-Browser eine
 * Hardware-Tastatur annehmen. Diese Komponente liefert deshalb eine eigene
 * On-Screen-Tastatur, die
 *
 *  - nur auf Touch-Geräten aufklappt (`navigator.maxTouchPoints > 0`),
 *  - beim ersten echten Hardware-Tastendruck dauerhaft verschwindet und dann der
 *    physischen Tastatur das Feld überlässt (Forderung: „nur wenn eine physische
 *    Tastatur angeschlossen ist, auf diese wechseln"),
 *  - je Feld das passende Layout zeigt (numerisch / dezimal mit Komma / Text).
 *
 * Felder melden sich per `data-osk="numeric|decimal|text"` an (siehe
 * `oskProps()`). Der native Soft-Keyboard des Feldes wird währenddessen über
 * `inputmode="none"` unterdrückt, damit auf echten Mobilgeräten nicht ZWEI
 * Tastaturen erscheinen; Hardware-Eingabe bleibt davon unberührt.
 *
 * Es gibt bewusst KEINE Caret-Verwaltung: im Lager wird ans Ende getippt bzw. mit
 * ⌫ am Ende gelöscht — das reicht für Preise, Mitarbeiternummer und Notiz und
 * hält die Komponente klein und robust.
 */
import { useEffect, useRef, useState, type JSX, type PointerEvent } from 'react';
import Box from '@mui/material/Box';
import Paper from '@mui/material/Paper';

/** Layout-Kennung, die ein Feld über `data-osk` anfordert. */
export type OskLayout = 'numeric' | 'decimal' | 'text';

/**
 * Props, die ein Eingabefeld für die OSK-Anbindung setzt. `inputMode` dient als
 * Fallback für den Hardware-/Mobil-Fall; die OSK überschreibt ihn zur Laufzeit
 * auf `none`, solange sie ein Feld bedient.
 */
export function oskProps(layout: OskLayout): {
  'data-osk': OskLayout;
  inputMode: 'numeric' | 'decimal' | 'text';
} {
  return { 'data-osk': layout, inputMode: layout === 'text' ? 'text' : layout };
}

type EditableEl = HTMLInputElement | HTMLTextAreaElement;

/** Schreibt einen Wert so, dass Reacts `onChange` (synthetisch) zuverlässig feuert. */
function setNativeValue(el: EditableEl, value: string): void {
  const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
  setter?.call(el, value);
  el.dispatchEvent(new Event('input', { bubbles: true }));
}

const NUMERIC_ROWS: string[][] = [
  ['7', '8', '9'],
  ['4', '5', '6'],
  ['1', '2', '3'],
];

const TEXT_ROWS: string[][] = [
  ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0'],
  ['q', 'w', 'e', 'r', 't', 'z', 'u', 'i', 'o', 'p'],
  ['a', 's', 'd', 'f', 'g', 'h', 'j', 'k', 'l'],
  ['y', 'x', 'c', 'v', 'b', 'n', 'm', '-'],
];

/**
 * Global gemountete Tastatur (einmal in `App`). Hört auf Fokus- und
 * Hardware-Tastatur-Ereignisse und rendert sich als Bottom-Sheet über allem
 * (auch über MUI-Dialogen), ohne je den Fokus zu stehlen.
 */
export function OnScreenKeyboard(): JSX.Element | null {
  const [active, setActive] = useState<EditableEl | null>(null);
  const [layout, setLayout] = useState<OskLayout>('numeric');
  // Ref statt State: die Fokus-/Keydown-Listener lesen den aktuellen Wert, ohne
  // dass die Effekte neu gebunden werden müssen.
  const hardwareSeen = useRef(false);

  useEffect(() => {
    const touchCapable = navigator.maxTouchPoints > 0;
    if (!touchCapable) return; // Kein Touch → nie eine On-Screen-Tastatur.

    const onFocusIn = (event: FocusEvent): void => {
      const el = event.target;
      if (!(el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement)) return;
      const osk = el.getAttribute('data-osk') as OskLayout | null;
      if (!osk || hardwareSeen.current) return;
      // Native Soft-Keyboard unterdrücken, solange die OSK das Feld bedient.
      el.setAttribute('inputmode', 'none');
      setLayout(osk);
      setActive(el);
      requestAnimationFrame(() => el.scrollIntoView({ block: 'center', behavior: 'smooth' }));
    };

    const onFocusOut = (event: FocusEvent): void => {
      if (event.target === active) setActive(null);
    };

    // Ein echter (isTrusted) Tastendruck heißt: physische Tastatur vorhanden.
    // Ab jetzt bleibt die OSK aus und die Hardware bedient das Feld direkt.
    const onKeyDown = (event: KeyboardEvent): void => {
      if (!event.isTrusted) return;
      hardwareSeen.current = true;
      setActive(null);
    };

    document.addEventListener('focusin', onFocusIn);
    document.addEventListener('focusout', onFocusOut);
    document.addEventListener('keydown', onKeyDown, true);
    return () => {
      document.removeEventListener('focusin', onFocusIn);
      document.removeEventListener('focusout', onFocusOut);
      document.removeEventListener('keydown', onKeyDown, true);
    };
  }, [active]);

  if (!active) return null;

  const type = (active as HTMLInputElement).type;

  const insert = (char: string): void => {
    setNativeValue(active, active.value + char);
  };
  const backspace = (): void => {
    setNativeValue(active, active.value.slice(0, -1));
  };
  const done = (): void => {
    active.blur();
    setActive(null);
  };

  const isNumeric = layout === 'numeric' || layout === 'decimal';

  return (
    <Paper
      elevation={12}
      // Über dem fixen Aktionsbalken UND über MUI-Dialogen (zIndex 1300).
      sx={{
        position: 'fixed',
        left: 0,
        right: 0,
        bottom: 0,
        zIndex: 1500,
        p: 1,
        borderTop: '2px solid',
        borderColor: 'divider',
        borderTopLeftRadius: 16,
        borderTopRightRadius: 16,
      }}
      // Tastendrücke dürfen den Fokus des Feldes NICHT stehlen.
      onPointerDown={(event: PointerEvent) => event.preventDefault()}
    >
      {isNumeric ? (
        <NumericPad
          withComma={layout === 'decimal' && type !== 'number'}
          onKey={insert}
          onBackspace={backspace}
          onDone={done}
        />
      ) : (
        <TextPad onKey={insert} onBackspace={backspace} onDone={done} />
      )}
    </Paper>
  );
}

interface PadProps {
  onKey: (char: string) => void;
  onBackspace: () => void;
  onDone: () => void;
}

/** Feste Tastenmaße — bedienbar auch mit Handschuhen. */
const KEY = {
  minWidth: 56,
  height: 56,
  fontSize: '1.35rem',
  fontWeight: 700,
} as const;

function Key({
  label,
  onPress,
  grow,
  tone,
}: {
  label: string;
  onPress: () => void;
  grow?: boolean;
  tone?: 'default' | 'primary';
}): JSX.Element {
  return (
    <Box
      component="button"
      type="button"
      onClick={onPress}
      sx={{
        ...KEY,
        flex: grow ? 1 : '0 0 auto',
        border: '1px solid',
        borderColor: tone === 'primary' ? 'primary.main' : 'divider',
        borderRadius: 2,
        bgcolor: tone === 'primary' ? 'primary.main' : 'background.paper',
        color: tone === 'primary' ? 'primary.contrastText' : 'text.primary',
        cursor: 'pointer',
        px: 1.5,
        '&:active': { bgcolor: tone === 'primary' ? 'primary.dark' : 'action.selected' },
      }}
    >
      {label}
    </Box>
  );
}

function NumericPad({
  withComma,
  onKey,
  onBackspace,
  onDone,
}: PadProps & { withComma: boolean }): JSX.Element {
  return (
    <Box sx={{ display: 'flex', gap: 1, maxWidth: 520, mx: 'auto' }}>
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1, flex: 1 }}>
        {NUMERIC_ROWS.map((row) => (
          <Box key={row.join()} sx={{ display: 'flex', gap: 1 }}>
            {row.map((digit) => (
              <Key key={digit} label={digit} grow onPress={() => onKey(digit)} />
            ))}
          </Box>
        ))}
        <Box sx={{ display: 'flex', gap: 1 }}>
          {withComma ? <Key label="," grow onPress={() => onKey(',')} /> : null}
          <Key label="0" grow onPress={() => onKey('0')} />
          {withComma ? <Key label="00" grow onPress={() => onKey('00')} /> : null}
        </Box>
      </Box>
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1, width: 96 }}>
        <Key label="⌫" grow onPress={onBackspace} />
        <Key label="✓ Fertig" grow tone="primary" onPress={onDone} />
      </Box>
    </Box>
  );
}

function TextPad({ onKey, onBackspace, onDone }: PadProps): JSX.Element {
  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1, maxWidth: 760, mx: 'auto' }}>
      {TEXT_ROWS.map((row) => (
        <Box key={row.join()} sx={{ display: 'flex', gap: 0.75, justifyContent: 'center' }}>
          {row.map((char) => (
            <Key key={char} label={char} grow onPress={() => onKey(char)} />
          ))}
        </Box>
      ))}
      <Box sx={{ display: 'flex', gap: 0.75 }}>
        <Key label="⌫" onPress={onBackspace} />
        <Key label="Leer" grow onPress={() => onKey(' ')} />
        <Key label="✓ Fertig" tone="primary" onPress={onDone} />
      </Box>
    </Box>
  );
}
