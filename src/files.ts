// Spike 4 helpers: what did the photo picker actually hand us?
// The browser's `file.type` is a label; the first bytes of the file say what it really is.

export type SniffedFormat = 'jpeg' | 'png' | 'webp' | 'heic' | 'unknown';

/** Identify an image from its first 12+ bytes (magic numbers). */
export function sniffImageFormat(bytes: Uint8Array): SniffedFormat {
  const at = (i: number) => bytes[i] ?? -1;
  const ascii = (from: number, to: number) => String.fromCharCode(...bytes.slice(from, to));
  if (at(0) === 0xff && at(1) === 0xd8 && at(2) === 0xff) return 'jpeg';
  if (at(0) === 0x89 && ascii(1, 4) === 'PNG') return 'png';
  if (ascii(0, 4) === 'RIFF' && ascii(8, 12) === 'WEBP') return 'webp';
  if (ascii(4, 8) === 'ftyp' && /^(heic|heix|hevc|hevx|heim|heis|mif1|msf1)$/.test(ascii(8, 12))) return 'heic';
  return 'unknown';
}

export type SpikeVerdict = { pass: boolean; summary: string };

/** Spike 4 passes when the file really is JPEG, PNG or WebP (Claude cannot read HEIC). */
export function spike4Verdict(mime: string, sniffed: SniffedFormat): SpikeVerdict {
  if (sniffed === 'heic') return { pass: false, summary: `FAIL: the file is HEIC (browser said "${mime || 'no type'}").` };
  if (sniffed === 'unknown') return { pass: false, summary: `FAIL: not a recognised JPEG, PNG or WebP (browser said "${mime || 'no type'}").` };
  return { pass: true, summary: `PASS: the file is really ${sniffed.toUpperCase()} (browser said "${mime || 'no type'}").` };
}
