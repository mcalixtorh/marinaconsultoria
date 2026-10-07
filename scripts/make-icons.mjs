import sharp from 'sharp';
import { readFileSync } from 'node:fs';

const svg = readFileSync('public/icon.svg');
const maskable = Buffer.from(
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><rect width="512" height="512" fill="#C25259"/><g transform="translate(76.8 76.8) scale(.7)" fill="none" stroke="#FFF" stroke-width="30" stroke-linecap="round" stroke-linejoin="round"><rect x="120" y="140" width="272" height="252" rx="40"/><path d="M120 214h272M190 108v56M322 108v56"/><path d="M200 306l42 42 76-84"/></g></svg>`,
);
await sharp(svg).resize(192, 192).png().toFile('public/icon-192.png');
await sharp(svg).resize(512, 512).png().toFile('public/icon-512.png');
await sharp(svg).resize(180, 180).png().toFile('public/apple-touch-icon.png');
await sharp(maskable).resize(512, 512).png().toFile('public/icon-maskable-512.png');
console.log('ícones gerados');
