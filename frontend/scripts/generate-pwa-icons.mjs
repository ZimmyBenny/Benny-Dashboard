/**
 * PWA Icon Generator — Electric Noir Style
 * Generiert 4 PNGs (192, 512, 512-maskable, 180-apple) via sharp aus SVG-Templates.
 * Ausführen: node frontend/scripts/generate-pwa-icons.mjs
 */

import sharp from 'sharp';
import { fileURLToPath } from 'url';
import path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_DIR = path.join(__dirname, '..', 'public');

function makeSvg({ size, rounded, safePadding }) {
  const padding = safePadding ? size * 0.20 : 0;
  const innerSize = size - padding * 2;
  const fontSize = Math.round(innerSize * 0.42);
  const cx = size / 2;
  const cy = size / 2;
  const rx = rounded ? Math.round(size * 0.12) : 0;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <rect width="${size}" height="${size}" fill="#0A0A0F" rx="${rx}" ry="${rx}"/>
  <text
    x="${cx}"
    y="${cy}"
    dominant-baseline="central"
    text-anchor="middle"
    fill="#00E5FF"
    font-family="Manrope, system-ui, sans-serif"
    font-weight="800"
    font-size="${fontSize}"
    letter-spacing="-${Math.round(fontSize * 0.04)}"
  >BD</text>
</svg>`;
}

const icons = [
  { name: 'icon-192.png',          size: 192, rounded: true,  safePadding: false },
  { name: 'icon-512.png',          size: 512, rounded: true,  safePadding: false },
  { name: 'icon-512-maskable.png', size: 512, rounded: false, safePadding: true  },
  { name: 'apple-touch-icon.png',  size: 180, rounded: false, safePadding: false },
];

for (const icon of icons) {
  const svg = makeSvg(icon);
  const outPath = path.join(OUT_DIR, icon.name);
  await sharp(Buffer.from(svg))
    .png()
    .toFile(outPath);
  console.log(`✓ ${icon.name} (${icon.size}x${icon.size})`);
}

console.log('\nAlle Icons in frontend/public/ generiert.');
