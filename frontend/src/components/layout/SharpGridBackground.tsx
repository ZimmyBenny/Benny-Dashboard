/**
 * SharpGridBackground — dezentes Hintergrund-Raster für die Dashboard-Landings.
 *
 * Feines 44px-Raster aus zwei repeating-linear-gradients. Die Linienfarbe
 * leitet sich per color-mix aus --color-primary ab und nimmt damit automatisch
 * den Modul-Akzent auf (blau in DJ/Amazon/Finanzen, lila auf Default-Seiten).
 *
 * Einsatz: als erstes Kind eines position:relative-Containers, HINTER dem
 * Content (Content sollte in einer position:relative; zIndex:1-Ebene liegen).
 * pointerEvents:none — blockiert keine Klicks.
 */
export function SharpGridBackground() {
  const line = 'var(--sharp-grid-line)';
  return (
    <div
      aria-hidden
      style={{
        position: 'absolute',
        inset: 0,
        pointerEvents: 'none',
        zIndex: 0,
        backgroundImage:
          `repeating-linear-gradient(0deg, ${line} 0px, ${line} 1px, transparent 1px, transparent 44px), ` +
          `repeating-linear-gradient(90deg, ${line} 0px, ${line} 1px, transparent 1px, transparent 44px)`,
        backgroundSize: '44px 44px',
      }}
    />
  );
}
