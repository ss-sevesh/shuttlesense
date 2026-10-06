import { mkdir, copyFile } from "node:fs/promises";
import sharp from "sharp";

await mkdir("public/fonts", { recursive: true });
await mkdir("public/images", { recursive: true });
await copyFile("node_modules/next/dist/next-devtools/server/font/geist-latin.woff2", "public/fonts/geist-latin.woff2");
await sharp(process.argv[2]).resize({ width: 1536, withoutEnlargement: true }).webp({ quality: 85 }).toFile("public/images/demo-court.webp");
