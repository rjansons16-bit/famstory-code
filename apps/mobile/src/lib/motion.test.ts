import assert from 'node:assert/strict';

import { motion } from '@/theme';
import { curve, duration } from './motion';

/**
 * The two things the rest of the app trusts about motion: that reduced motion
 * really means none, and that a named curve starts where it is and ends where
 * it is going. A transposed control point still produces a plausible-looking
 * curve, so it is worth pinning.
 */

describe('Reduced motion', () => {
  it('removes the duration entirely rather than shortening it', () => {
    assert.equal(duration(motion.normal, true), 0);
    assert.equal(duration(motion.slow, true), 0);
  });

  it('leaves the duration alone otherwise', () => {
    assert.equal(duration(motion.normal, false), motion.normal);
  });
});

describe('The named curves', () => {
  const names = ['enter', 'exit', 'inOut'] as const;

  it('begin at the start and arrive at the end', () => {
    for (const name of names) {
      const ease = curve(name);
      assert.equal(ease(0), 0, `${name} does not start at 0`);
      // Bezier evaluation is iterative, so the endpoint is approached, not hit.
      assert.ok(Math.abs(ease(1) - 1) < 1e-6, `${name} does not end at 1`);
    }
  });

  it('never turns back on themselves', () => {
    // A curve that dips below its own previous value reads as a stutter — this
    // is what a mistyped control point looks like on screen.
    for (const name of names) {
      const ease = curve(name);
      let previous = 0;
      for (let step = 1; step <= 40; step += 1) {
        const value = ease(step / 40);
        assert.ok(value >= previous - 1e-9, `${name} goes backwards at ${step / 40}`);
        previous = value;
      }
    }
  });
});

describe('The speeds', () => {
  it('stay in order — chrome answers faster than content settles', () => {
    assert.ok(motion.fast < motion.normal);
    assert.ok(motion.normal < motion.slow);
  });
});
