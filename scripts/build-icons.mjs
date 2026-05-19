// Builds Android-adaptive-icon-friendly variants from a single resources/icon.png.
//
// Why: Android 8+ uses adaptive icons with a 108×108dp foreground layer where
// the OS masks the outer ~17% per side (the system decides the shape — circle,
// squircle, teardrop, etc.). If the source icon has content near the edges,
// it gets cropped on the home screen.
//
// What this script outputs (all 1024×1024):
//   - icon-foreground.png : original logo scaled to 66% of canvas, centered on
//                           transparent. Visible content lives entirely inside
//                           Android's safe zone — no more clipped bars/charts.
//   - icon-background.png : solid deep blue. Shown by adaptive icon mask in
//                           the outer ring where the foreground is transparent.
//   - icon-only.png       : same composition as the adaptive layers flattened
//                           onto the bg color. Used for legacy (pre-API-26)
//                           launchers and the iOS icon if you ever add iOS.
//
// After running this, `capacitor-assets generate --android` picks up the
// three files (Custom Mode) and produces all density buckets correctly.
import sharp from 'sharp';
import { dirname, resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const RESOURCES = resolve(__dirname, '..', 'resources');
const SOURCE = join(RESOURCES, 'icon.png');

const SIZE = 1024;
const SAFE_INNER = Math.round(SIZE * 0.66); // ~67% — within Android's safe zone
const BG = { r: 0x15, g: 0x65, b: 0xc0 }; // Material Blue 800, matches the icon's deep gradient

const meta = await sharp(SOURCE).metadata();
console.log(`Source: ${meta.width}×${meta.height}`);

const innerBuf = await sharp(SOURCE)
  .resize(SAFE_INNER, SAFE_INNER, {
    fit: 'contain',
    background: { r: 0, g: 0, b: 0, alpha: 0 },
  })
  .toBuffer();

const offset = Math.round((SIZE - SAFE_INNER) / 2);

// 1. Solid-color background
await sharp({
  create: { width: SIZE, height: SIZE, channels: 4, background: BG },
})
  .png()
  .toFile(join(RESOURCES, 'icon-background.png'));

// 2. Transparent foreground with logo in the safe zone
await sharp({
  create: {
    width: SIZE,
    height: SIZE,
    channels: 4,
    background: { r: 0, g: 0, b: 0, alpha: 0 },
  },
})
  .composite([{ input: innerBuf, left: offset, top: offset }])
  .png()
  .toFile(join(RESOURCES, 'icon-foreground.png'));

// 3. Flattened legacy/iOS icon — logo on the bg color
await sharp({
  create: { width: SIZE, height: SIZE, channels: 4, background: BG },
})
  .composite([{ input: innerBuf, left: offset, top: offset }])
  .png()
  .toFile(join(RESOURCES, 'icon-only.png'));

console.log('Wrote icon-foreground.png, icon-background.png, icon-only.png');
