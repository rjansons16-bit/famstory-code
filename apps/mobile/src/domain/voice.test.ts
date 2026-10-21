import assert from 'node:assert/strict';

import { appendDictation, baseType, formatDuration, pickRecordingType, speechLanguage } from './voice';

describe('pickRecordingType', () => {
  it('prefers Opus in WebM where the browser makes it', () => {
    assert.equal(pickRecordingType(() => true), 'audio/webm;codecs=opus');
  });

  it("takes Safari's AAC in MP4 when that is all there is", () => {
    assert.equal(pickRecordingType((t) => t === 'audio/mp4'), 'audio/mp4');
  });

  it('says so when the browser can record nothing the server takes', () => {
    assert.equal(pickRecordingType(() => false), null);
  });

  it('a browser that throws on the question is a browser that cannot', () => {
    assert.equal(
      pickRecordingType(() => {
        throw new Error('not implemented');
      }),
      null,
    );
  });
});

describe('baseType', () => {
  it('drops the codec parameters and the case', () => {
    assert.equal(baseType('audio/webm;codecs=opus'), 'audio/webm');
    assert.equal(baseType('Audio/MP4'), 'audio/mp4');
  });
});

describe('formatDuration', () => {
  it('minutes and two-digit seconds', () => {
    assert.equal(formatDuration(7), '0:07');
    assert.equal(formatDuration(84), '1:24');
    assert.equal(formatDuration(723), '12:03');
  });

  it('rounds, and never goes below zero or says NaN', () => {
    assert.equal(formatDuration(59.6), '1:00');
    assert.equal(formatDuration(-3), '0:00');
    assert.equal(formatDuration(Number.NaN), '0:00');
  });
});

describe('appendDictation', () => {
  it('an empty field starts with a capital', () => {
    assert.equal(appendDictation('', 'vecmāmiņa stāsta par māju'), 'Vecmāmiņa stāsta par māju');
  });

  it('carries on a sentence with a space and no capital', () => {
    assert.equal(appendDictation('We went to', 'the seaside'), 'We went to the seaside');
  });

  it('after a full stop, a new sentence', () => {
    assert.equal(appendDictation('It rained.', 'we stayed in'), 'It rained. We stayed in');
  });

  it('does not double a space that is already there', () => {
    assert.equal(appendDictation('It rained. ', 'we stayed in'), 'It rained. We stayed in');
  });

  it('silence changes nothing', () => {
    assert.equal(appendDictation('As it was', '   '), 'As it was');
  });

  it('keeps the words as spoken otherwise', () => {
    assert.equal(appendDictation('', '  Rīga   in June '), 'Rīga in June');
  });
});

describe('speechLanguage', () => {
  it('listens in the language the app is in', () => {
    assert.equal(speechLanguage('lv'), 'lv-LV');
    assert.equal(speechLanguage('en'), 'en-GB');
  });
});
