import sharp from 'sharp';
import { readFileSync, mkdirSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const sizes = [72, 96, 128, 144, 152, 192, 384, 512];
const iconsDir = join(__dirname, '../public/icons');

// Ensure directory exists
mkdirSync(iconsDir, { recursive: true });

// Read SVG
const svgBuffer = readFileSync(join(iconsDir, 'icon.svg'));

console.log('🎨 Generating PWA icons...');

// Generate PNG for each size
for (const size of sizes) {
  await sharp(svgBuffer)
    .resize(size, size)
    .png()
    .toFile(join(iconsDir, `icon-${size}x${size}.png`));
  
  console.log(`  ✓ icon-${size}x${size}.png`);
}

// Generate Apple Touch Icon (180x180)
await sharp(svgBuffer)
  .resize(180, 180)
  .png()
  .toFile(join(iconsDir, 'apple-touch-icon.png'));
console.log('  ✓ apple-touch-icon.png');

// Generate favicon.ico (as PNG, browsers support it)
await sharp(svgBuffer)
  .resize(32, 32)
  .png()
  .toFile(join(__dirname, '../public/favicon.png'));
console.log('  ✓ favicon.png');

// Generate screenshots placeholders
const screenshotsDir = join(__dirname, '../public/screenshots');
mkdirSync(screenshotsDir, { recursive: true });

// Desktop screenshot (placeholder)
await sharp({
  create: {
    width: 1280,
    height: 720,
    channels: 4,
    background: { r: 10, g: 10, b: 15, alpha: 1 }
  }
})
  .composite([{
    input: Buffer.from(`
      <svg width="1280" height="720" xmlns="http://www.w3.org/2000/svg">
        <rect width="1280" height="720" fill="#0a0a0f"/>
        <text x="640" y="340" font-family="system-ui" font-size="48" fill="#22c55e" text-anchor="middle">🛡️ WDK Crypto Wallet</text>
        <text x="640" y="400" font-family="system-ui" font-size="24" fill="#888" text-anchor="middle">Güvenli kripto cüzdanınız</text>
      </svg>
    `),
    top: 0,
    left: 0
  }])
  .png()
  .toFile(join(screenshotsDir, 'desktop.png'));
console.log('  ✓ screenshots/desktop.png');

// Mobile screenshot (placeholder)
await sharp({
  create: {
    width: 750,
    height: 1334,
    channels: 4,
    background: { r: 10, g: 10, b: 15, alpha: 1 }
  }
})
  .composite([{
    input: Buffer.from(`
      <svg width="750" height="1334" xmlns="http://www.w3.org/2000/svg">
        <rect width="750" height="1334" fill="#0a0a0f"/>
        <text x="375" y="600" font-family="system-ui" font-size="48" fill="#22c55e" text-anchor="middle">🛡️</text>
        <text x="375" y="680" font-family="system-ui" font-size="32" fill="#22c55e" text-anchor="middle">WDK Wallet</text>
        <text x="375" y="730" font-family="system-ui" font-size="18" fill="#888" text-anchor="middle">Güvenli kripto cüzdanınız</text>
      </svg>
    `),
    top: 0,
    left: 0
  }])
  .png()
  .toFile(join(screenshotsDir, 'mobile.png'));
console.log('  ✓ screenshots/mobile.png');

console.log('\n✅ All PWA icons generated successfully!');

