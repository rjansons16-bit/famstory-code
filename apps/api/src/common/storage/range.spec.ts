import { parseRange } from './range';

describe('parseRange', () => {
  const size = 1000;

  it('no header is the whole file', () => {
    expect(parseRange(undefined, size)).toBeNull();
  });

  it('a start and an end', () => {
    expect(parseRange('bytes=0-99', size)).toEqual({ start: 0, end: 99 });
  });

  it('an open end runs to the last byte', () => {
    expect(parseRange('bytes=500-', size)).toEqual({ start: 500, end: 999 });
  });

  it('Safari’s first question - the first two bytes', () => {
    expect(parseRange('bytes=0-1', size)).toEqual({ start: 0, end: 1 });
  });

  it('an end past the file stops at the file', () => {
    expect(parseRange('bytes=900-5000', size)).toEqual({ start: 900, end: 999 });
  });

  it('the last n bytes', () => {
    expect(parseRange('bytes=-100', size)).toEqual({ start: 900, end: 999 });
    expect(parseRange('bytes=-5000', size)).toEqual({ start: 0, end: 999 });
  });

  it('a range outside the file is unsatisfiable, not the whole file', () => {
    expect(parseRange('bytes=1000-', size)).toBe('unsatisfiable');
    expect(parseRange('bytes=600-500', size)).toBe('unsatisfiable');
    expect(parseRange('bytes=-0', size)).toBe('unsatisfiable');
  });

  it('what it does not do is answered with the whole file', () => {
    expect(parseRange('bytes=0-1,5-6', size)).toBeNull();
    expect(parseRange('items=0-1', size)).toBeNull();
    expect(parseRange('bytes=-', size)).toBeNull();
  });
});
