import assert from 'node:assert/strict';

import type { Attachment } from '@/domain/types';
import type { FamStoryApi } from './api';
import { isLocal, uploadAttachments } from './uploads';

/**
 * Sending a picked photograph to the server.
 *
 * The behaviour worth pinning is what happens when one fails. A family saves
 * an event with three photographs on a train; if one upload dies, the event
 * must still exist, the other two must still go, and the person must be told —
 * a photograph that silently did not arrive is discovered months later on
 * somebody else's phone.
 */

const local = (id = 'local_1'): Attachment => ({
  id,
  kind: 'image',
  url: `blob:${id}`,
  thumbnailUrl: `blob:${id}`,
  width: 1600,
  height: 1200,
});

function fakeApi(overrides: Partial<Record<'requestUpload' | 'completeUpload', unknown>> = {}) {
  let n = 0;

  return {
    requestUpload: jest.fn(async () => ({
      attachmentId: `att_${++n}`,
      uploadUrl: `https://api.test/v1/uploads/att_${n}/bytes?expires=1&signature=s`,
      method: 'PUT' as const,
      expiresIn: 900,
      maxBytes: 25 * 1024 * 1024,
    })),
    completeUpload: jest.fn(async () => ({})),
    ...overrides,
  } as unknown as FamStoryApi;
}

/** The local file read, then the PUT. */
function fakeFetch(options: { putStatus?: number; blobType?: string } = {}) {
  return jest.fn(async (input: string, init?: RequestInit) => {
    if (!init || init.method !== 'PUT') {
      return new Response(new Blob([new Uint8Array(1024)], { type: options.blobType ?? 'image/jpeg' }));
    }
    return new Response(options.putStatus === 204 || !options.putStatus ? null : '{"error":{"code":"file_too_large","message":"Too big."}}', {
      status: options.putStatus ?? 204,
    });
  });
}

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe('uploadAttachments', () => {
  it('leaves an attachment that is already on the server alone', async () => {
    const api = fakeApi();
    globalThis.fetch = fakeFetch() as unknown as typeof fetch;

    const server: Attachment = { id: 'att_9', kind: 'image', url: 'https://api.test/photo.jpg' };
    const outcome = await uploadAttachments(api, 'fam_1', 'evt_1', [server]);

    assert.deepEqual(outcome.attachments, [server]);
    assert.equal(outcome.failed, 0);
    assert.equal((api.requestUpload as jest.Mock).mock.calls.length, 0);
  });

  it('asks, sends and confirms — in that order', async () => {
    const api = fakeApi();
    const fetchMock = fakeFetch();
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    await uploadAttachments(api, 'fam_1', 'evt_1', [local()]);

    assert.equal((api.requestUpload as jest.Mock).mock.calls.length, 1);
    assert.equal((api.completeUpload as jest.Mock).mock.calls.length, 1);

    const put = fetchMock.mock.calls.find(([, init]) => init?.method === 'PUT');
    assert.ok(put, 'the bytes were never sent');
    assert.equal(put[0], 'https://api.test/v1/uploads/att_1/bytes?expires=1&signature=s');
  });

  it('keeps the local picture on screen and takes the server id', async () => {
    const api = fakeApi();
    globalThis.fetch = fakeFetch() as unknown as typeof fetch;

    const { attachments } = await uploadAttachments(api, 'fam_1', 'evt_1', [local()]);

    assert.equal(attachments[0].id, 'att_1');
    // The device that took the photograph goes on showing its own copy.
    assert.equal(attachments[0].url, 'blob:local_1');
    assert.equal(attachments[0].width, 1600);
  });

  it('tells the server what kind of file it is about to get', async () => {
    const api = fakeApi();
    globalThis.fetch = fakeFetch({ blobType: 'image/png' }) as unknown as typeof fetch;

    await uploadAttachments(api, 'fam_1', 'evt_1', [local()]);

    assert.equal((api.requestUpload as jest.Mock).mock.calls[0][2].mimeType, 'image/png');
  });

  it('guesses the type when the device does not say', async () => {
    const api = fakeApi();
    globalThis.fetch = fakeFetch({ blobType: '' }) as unknown as typeof fetch;

    // Some Android providers hand back a blob with no type at all, and the
    // server refuses an unknown one.
    await uploadAttachments(api, 'fam_1', 'evt_1', [{ ...local(), url: 'file:///DCIM/x.png' }]);

    assert.equal((api.requestUpload as jest.Mock).mock.calls[0][2].mimeType, 'image/png');
  });

  it('keeps going when one photograph fails, and says how many', async () => {
    const api = fakeApi();
    let calls = 0;

    globalThis.fetch = (async (input: string, init?: RequestInit) => {
      if (!init || init.method !== 'PUT') {
        return new Response(new Blob([new Uint8Array(10)], { type: 'image/jpeg' }));
      }
      calls += 1;
      // The middle one dies.
      return calls === 2
        ? new Response('{"error":{"code":"file_too_large","message":"Too big."}}', { status: 413 })
        : new Response(null, { status: 204 });
    }) as unknown as typeof fetch;

    const outcome = await uploadAttachments(api, 'fam_1', 'evt_1', [
      local('local_1'),
      local('local_2'),
      local('local_3'),
    ]);

    assert.equal(outcome.failed, 1);
    assert.equal(outcome.error?.code, 'file_too_large');
    assert.equal(outcome.attachments.length, 3);
    // The one that failed keeps its local id: nothing on the server matches it.
    assert.ok(outcome.attachments.some((a) => a.id === 'local_2'));
    assert.equal(outcome.attachments.filter((a) => a.id.startsWith('att_')).length, 2);
  });
});

describe('isLocal', () => {
  it('knows a picked file from a stored one', () => {
    assert.equal(isLocal(local()), true);
    assert.equal(isLocal({ id: 'att_1', kind: 'image', url: 'https://x' }), false);
  });
});
