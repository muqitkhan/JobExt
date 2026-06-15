#!/usr/bin/env node
/**
 * Generate extension + installer PNG icons from public/logo.svg
 * Run: npm run icons
 */
import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const SVG = join(ROOT, 'public/logo.svg');
const OUT = join(ROOT, 'public/icon');

const SIZES = [16, 32, 48, 64, 96, 128, 256, 512, 1024];

mkdirSync(OUT, { recursive: true });

for (const size of SIZES) {
  const outPath = join(OUT, `${size}.png`);
  await sharp(SVG).resize(size, size).png({ compressionLevel: 9 }).toFile(outPath);
  console.log(`✔ ${size}x${size} → public/icon/${size}.png`);
}

console.log('\nIcons generated from public/logo.svg\n');
