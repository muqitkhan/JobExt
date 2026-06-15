/**
 * pdf-lib StandardFonts use WinAnsi encoding — strip/replace Unicode that cannot encode.
 * Common in resumes: non-breaking hyphens, smart quotes, bullets, en/em dashes.
 */
const CHAR_REPLACEMENTS: ReadonlyArray<[string, string]> = [
  ['\u2011', '-'], // non-breaking hyphen
  ['\u2010', '-'], // hyphen
  ['\u2012', '-'], // figure dash
  ['\u2013', '-'], // en dash
  ['\u2014', '--'], // em dash
  ['\u2212', '-'], // minus sign
  ['\u00AD', ''], // soft hyphen
  ['\u2018', "'"],
  ['\u2019', "'"],
  ['\u201A', "'"],
  ['\u201B', "'"],
  ['\u201C', '"'],
  ['\u201D', '"'],
  ['\u201E', '"'],
  ['\u201F', '"'],
  ['\u00A0', ' '], // nbsp
  ['\u202F', ' '], // narrow nbsp
  ['\u2007', ' '], // figure space
  ['\u200B', ''], // zero-width space
  ['\uFEFF', ''], // BOM
  ['\u2022', '-'], // bullet
  ['\u25CF', '-'], // black circle
  ['\u25E6', '-'], // white bullet
  ['\u2023', '-'],
  ['\u2043', '-'], // hyphen bullet
  ['\u2192', '->'],
  ['\u2190', '<-'],
  ['\u2026', '...'],
  ['\u00B7', '-'], // middle dot
];

/** WinAnsi / CP1252 printable range used by pdf-lib Helvetica. */
function isWinAnsiSafe(code: number): boolean {
  if (code === 0x09 || code === 0x0a || code === 0x0d) return true;
  if (code >= 0x20 && code <= 0x7e) return true;
  if (code >= 0xa0 && code <= 0xff) return true;
  return false;
}

export function sanitizeForPdfText(text: string): string {
  let out = text.normalize('NFKC');

  for (const [from, to] of CHAR_REPLACEMENTS) {
    if (out.includes(from)) {
      out = out.split(from).join(to);
    }
  }

  let safe = '';
  for (const ch of out) {
    const code = ch.codePointAt(0)!;
    if (isWinAnsiSafe(code)) {
      safe += ch;
    } else if (code > 0xffff) {
      safe += '?';
    } else {
      safe += '?';
    }
  }

  return safe;
}
