import { PasswordService } from './password.service';

/**
 * scrypt with N=2^17 is deliberately slow (~100 ms per hash) — that is the whole
 * point. So the timeout here is raised rather than the parameters lowered.
 */
jest.setTimeout(30_000);

describe('PasswordService', () => {
  const service = new PasswordService();

  it('the right password is accepted', async () => {
    const hash = await service.hash('correct-password-123');
    expect(await service.verify('correct-password-123', hash)).toBe(true);
  });

  it('a wrong password is rejected', async () => {
    const hash = await service.hash('correct-password-123');
    expect(await service.verify('wrong-password', hash)).toBe(false);
  });

  it('two hashes of one password differ (the salt is random)', async () => {
    const a = await service.hash('one-and-the-same');
    const b = await service.hash('one-and-the-same');
    expect(a).not.toEqual(b);
    expect(await service.verify('one-and-the-same', a)).toBe(true);
    expect(await service.verify('one-and-the-same', b)).toBe(true);
  });

  it('the parameters are encoded in the hash, not assumed from constants', async () => {
    const hash = await service.hash('x');
    const [algo, n, r, p] = hash.split('$');
    expect(algo).toBe('scrypt');
    expect(Number(n)).toBe(2 ** 17);
    expect(Number(r)).toBe(8);
    expect(Number(p)).toBe(1);
  });

  it('unicode and long passwords work', async () => {
    const password = 'A family story 🏡 ' + 'a'.repeat(200);
    const hash = await service.hash(password);
    expect(await service.verify(password, hash)).toBe(true);
  });

  describe('corrupt input is never accepted', () => {
    // Every one of these once had a path to `true`. An empty base64 buffer is
    // the dangerous case: Buffer.from does not throw, and comparing two empty
    // buffers succeeds — so a corrupt hash would accept ANY password.
    it.each([
      ['empty', ''],
      ['no format', 'plaintext'],
      ['too few parts', 'scrypt$16384$8$1$abc'],
      ['a different algorithm', 'bcrypt$16384$8$1$YWJj$ZGVm'],
      ['corrupt base64', 'scrypt$131072$8$1$!!!$!!!'],
      ['empty salt and hash', 'scrypt$131072$8$1$$'],
      ['salt too short', 'scrypt$131072$8$1$YWJj$' + 'A'.repeat(88)],
      ['hash too short', 'scrypt$131072$8$1$' + 'A'.repeat(24) + '$YWJj'],
      ['NaN parameters', 'scrypt$abc$def$ghi$' + 'A'.repeat(24) + '$' + 'A'.repeat(88)],
      ['negative N', 'scrypt$-1$8$1$' + 'A'.repeat(24) + '$' + 'A'.repeat(88)],
    ])('%s', async (_name, stored) => {
      expect(await service.verify('anything', stored)).toBe(false);
    });
  });

  it('needsRehash flags weaker parameters', async () => {
    const current = await service.hash('x');
    expect(service.needsRehash(current)).toBe(false);
    // An old hash with N=2^14
    expect(service.needsRehash('scrypt$16384$8$1$YWJj$ZGVm')).toBe(true);
    expect(service.needsRehash('nonsense')).toBe(true);
  });
});
