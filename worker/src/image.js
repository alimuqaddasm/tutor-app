/* Image checks for uploads. The type comes from the file's own first bytes (never from its name or
   the Content-Type header), and the width and height are read from its header. Anything else is refused. */

export const MAX_BYTES = 1900000;          // D1 keeps at most 2,000,000 bytes per row
export const MAX_SIDE = 10000;

export function sniff(b) {
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "image/jpeg";
  if (b.length >= 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47 && b[4] === 0x0d && b[5] === 0x0a && b[6] === 0x1a && b[7] === 0x0a) return "image/png";
  if (b.length >= 12 && str(b, 0, 4) === "RIFF" && str(b, 8, 4) === "WEBP") return "image/webp";
  return null;
}

function str(b, at, n) { let s = ""; for (let i = 0; i < n; i++) s += String.fromCharCode(b[at + i]); return s; }
function u16be(b, i) { return (b[i] << 8) | b[i + 1]; }
function u32be(b, i) { return ((b[i] << 24) >>> 0) + (b[i + 1] << 16) + (b[i + 2] << 8) + b[i + 3]; }
function u16le(b, i) { return b[i] | (b[i + 1] << 8); }
function u24le(b, i) { return b[i] | (b[i + 1] << 8) | (b[i + 2] << 16); }

export function dimensions(b, mime) {
  if (mime === "image/png") {
    if (b.length < 24 || str(b, 12, 4) !== "IHDR") return null;
    return { width: u32be(b, 16), height: u32be(b, 20) };
  }
  if (mime === "image/jpeg") {
    let i = 2;
    while (i + 9 < b.length) {
      if (b[i] !== 0xff) { i++; continue; }
      const m = b[i + 1];
      if (m === 0xff) { i++; continue; }
      if (m === 0xd8 || m === 0x01 || (m >= 0xd0 && m <= 0xd7)) { i += 2; continue; }
      const len = u16be(b, i + 2);
      if (len < 2) return null;
      // SOF0-SOF15, except DHT (C4), JPG (C8) and DAC (CC)
      if (m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc) return { width: u16be(b, i + 7), height: u16be(b, i + 5) };
      i += 2 + len;
    }
    return null;
  }
  if (mime === "image/webp") {
    if (b.length < 30) return null;
    const kind = str(b, 12, 4);
    if (kind === "VP8 " && b[23] === 0x9d && b[24] === 0x01 && b[25] === 0x2a) return { width: u16le(b, 26) & 0x3fff, height: u16le(b, 28) & 0x3fff };
    if (kind === "VP8L" && b[20] === 0x2f) { const v = b[21] | (b[22] << 8) | (b[23] << 16) | (b[24] << 24); return { width: (v & 0x3fff) + 1, height: ((v >>> 14) & 0x3fff) + 1 }; }
    if (kind === "VP8X") return { width: u24le(b, 24) + 1, height: u24le(b, 27) + 1 };
    return null;
  }
  return null;
}

/* Returns {mime, width, height} or {error} with a plain-English reason. */
export function checkImage(bytes) {
  if (!bytes || bytes.length === 0) return { error: "The file is empty." };
  if (bytes.length > MAX_BYTES) return { error: "The picture is too big (over 1.9 MB) even after shrinking.", status: 413 };
  const mime = sniff(bytes);
  if (!mime) return { error: "Only JPG, PNG or WebP pictures can be added." };
  const d = dimensions(bytes, mime);
  if (!d || !d.width || !d.height) return { error: "The picture looks damaged." };
  if (d.width > MAX_SIDE || d.height > MAX_SIDE) return { error: "The picture is too large." };
  return { mime, width: d.width, height: d.height };
}
