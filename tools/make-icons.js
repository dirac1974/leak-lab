// Generates the PWA icons (felt-green ground, brass spade) as raw PNGs — no dependencies.
// Run: node tools/make-icons.js   → icon-180.png, icon-192.png, icon-512.png at repo root.
const fs = require("fs");
const zlib = require("zlib");

const CRC = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c; }
  return (buf) => { let c = -1; for (const b of buf) c = t[(c ^ b) & 0xff] ^ (c >>> 8); return (c ^ -1) >>> 0; };
})();
const chunk = (type, data) => {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(CRC(body));
  return Buffer.concat([len, body, crc]);
};

const BG = [22, 32, 27], SPADE = [217, 164, 65];
const inTri = (u, v, ax, ay, bx, by, cx, cy) => {
  const s = (bx - ax) * (v - ay) - (by - ay) * (u - ax);
  const t = (cx - bx) * (v - by) - (cy - by) * (u - bx);
  const w = (ax - cx) * (v - cy) - (ay - cy) * (u - cx);
  return (s >= 0 && t >= 0 && w >= 0) || (s <= 0 && t <= 0 && w <= 0);
};
const inSpade = (u, v) => {
  if (inTri(u, v, 0.5, 0.14, 0.22, 0.55, 0.78, 0.55)) return true;
  const d2 = (x, y, r) => (u - x) * (u - x) + (v - y) * (v - y) <= r * r;
  if (d2(0.345, 0.55, 0.165) || d2(0.655, 0.55, 0.165)) return true;
  if (v >= 0.6 && v <= 0.84) { const hw = 0.03 + Math.max(0, v - 0.62) * 0.35; return Math.abs(u - 0.5) <= Math.min(hw, 0.11); }
  return false;
};

function makePng(size) {
  const raw = Buffer.alloc(size * (1 + size * 4));
  for (let y = 0; y < size; y++) {
    raw[y * (1 + size * 4)] = 0; // filter: none
    for (let x = 0; x < size; x++) {
      // 3x3 supersample for smooth edges
      let hit = 0;
      for (let sy = 0; sy < 3; sy++) for (let sx = 0; sx < 3; sx++) {
        if (inSpade((x + (sx + 0.5) / 3) / size, (y + (sy + 0.5) / 3) / size)) hit++;
      }
      const a = hit / 9;
      const px = [0, 1, 2].map((i) => Math.round(BG[i] * (1 - a) + SPADE[i] * a));
      const o = y * (1 + size * 4) + 1 + x * 4;
      raw[o] = px[0]; raw[o + 1] = px[1]; raw[o + 2] = px[2]; raw[o + 3] = 255;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; ihdr[9] = 6; // 8-bit RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", zlib.deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

for (const s of [180, 192, 512]) {
  fs.writeFileSync(`icon-${s}.png`, makePng(s));
  console.log(`icon-${s}.png written`);
}
