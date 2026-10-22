// The image `npm run check:bedrock` sends: a committed real Ring Playground frame from the REPLAY
// fixtures (always present in a fresh clone), or, if none is found, a tiny generated PNG.
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";

const FIXTURE_SNAPSHOTS = path.join("fixtures", "playground", "snapshots");

export interface CheckImage {
  /** Repo-relative path of the image, or null for the generated fallback. */
  path: string | null;
  bytes: Uint8Array;
  format: "jpeg" | "png";
}

/** First recorded Ring snapshot in the fixtures (sorted, so the choice is stable). */
export function checkImagePath(root = process.cwd()): string | null {
  const dir = path.join(root, FIXTURE_SNAPSHOTS);
  if (!fs.existsSync(dir)) return null;
  const file = fs
    .readdirSync(dir)
    .filter((f) => /\.(jpe?g|png)$/i.test(f))
    .sort()[0];
  return file ? path.join(FIXTURE_SNAPSHOTS, file) : null;
}

export function loadCheckImage(root = process.cwd()): CheckImage {
  const rel = checkImagePath(root);
  if (rel) {
    return { path: rel, bytes: fs.readFileSync(path.join(root, rel)), format: /\.png$/i.test(rel) ? "png" : "jpeg" };
  }
  return { path: null, bytes: tinyPng(64, 36), format: "png" };
}

/** A small solid-grey PNG built with zlib, so the fallback needs no image library. */
export function tinyPng(width: number, height: number): Uint8Array {
  const crcTable = Array.from({ length: 256 }, (_, n) => {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    return c >>> 0;
  });
  const crc = (buf: Buffer) => {
    let c = 0xffffffff;
    for (const b of buf) c = crcTable[(c ^ b) & 0xff]! ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  };
  const chunk = (type: string, data: Buffer) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const td = Buffer.concat([Buffer.from(type, "ascii"), data]);
    const c = Buffer.alloc(4);
    c.writeUInt32BE(crc(td));
    return Buffer.concat([len, td, c]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // RGB
  const row = Buffer.concat([Buffer.from([0]), Buffer.alloc(width * 3, 0x80)]);
  const raw = Buffer.concat(Array.from({ length: height }, () => row));
  return new Uint8Array(
    Buffer.concat([
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      chunk("IHDR", ihdr),
      chunk("IDAT", zlib.deflateSync(raw)),
      chunk("IEND", Buffer.alloc(0)),
    ]),
  );
}
