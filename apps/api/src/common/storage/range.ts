/**
 * ONE BYTE RANGE, FROM A `Range` HEADER.
 *
 * A browser playing a voice note does not download it and then play it: it
 * asks for the first bytes, then for wherever the listener drags to. Safari
 * will not play audio at all from a server that ignores the header. Photographs
 * never needed this; a recording does.
 *
 * Only the single range a media element asks for. Several ranges at once, or a
 * unit other than bytes, answer null - and the whole file is a correct reply to
 * those (RFC 9110 lets a server ignore Range). A range wholly outside the file
 * is different: that is a 416, and the whole file would be the wrong answer.
 */
export type ByteRange = { start: number; end: number };

export function parseRange(header: string | undefined, size: number): ByteRange | 'unsatisfiable' | null {
  if (!header) return null;

  const match = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
  if (!match) return null;

  const [, from, to] = match;
  if (from === '' && to === '') return null;

  if (size <= 0) return 'unsatisfiable';

  if (from === '') {
    // "bytes=-500": the last 500 bytes.
    const length = Number(to);
    if (length === 0) return 'unsatisfiable';
    return { start: Math.max(0, size - length), end: size - 1 };
  }

  const start = Number(from);
  const end = to === '' ? size - 1 : Math.min(Number(to), size - 1);
  if (start >= size || start > end) return 'unsatisfiable';

  return { start, end };
}
