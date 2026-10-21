import type { Attachment } from '@/domain/types';
import { baseType } from '@/domain/voice';

import type { FamStoryApi } from './api';
import { ApiError } from './http';

/**
 * SENDING THE PHOTOGRAPHS.
 *
 * The composer has always shown a picked photograph immediately, because on a
 * phone the picture is the reason somebody is writing anything down at all.
 * What it could not do was send it anywhere: the attachment kept the device's
 * own file URI and the memory existed on exactly one phone.
 *
 * Three steps per photograph, and they are the server's three steps
 * (apps/api/src/modules/media/uploads.service.ts): ask where to put it, PUT
 * the bytes there, say it arrived. The middle one is a plain PUT against a URL
 * the server signed, which is also what a presigned bucket URL is - so this
 * file does not change when the bytes move to a bucket.
 *
 * WHAT STAYS ON SCREEN. After a successful upload the attachment keeps the
 * LOCAL uri for display and swaps only its id for the server's. The person who
 * just took the photograph goes on looking at their own copy - instant, no
 * download - and everybody else gets the signed link with their next refresh.
 * Fetching back a picture this device already has would be a round trip to
 * show something that is already on screen.
 */

/** An attachment that exists only on this device, as the picker made it. */
export function isLocal(attachment: Attachment): boolean {
  return attachment.id.startsWith('local_');
}

export interface UploadOutcome {
  /** The list to store: uploaded ones carry the server's id. */
  attachments: Attachment[];
  /** How many could not be sent. Their local copies are still in the list. */
  failed: number;
  /** The first refusal, for the banner. */
  error?: ApiError;
}

export async function uploadAttachments(
  api: FamStoryApi,
  familyId: string,
  eventId: string,
  attachments: Attachment[],
): Promise<UploadOutcome> {
  const result: Attachment[] = [];
  let failed = 0;
  let error: ApiError | undefined;

  for (const attachment of attachments) {
    if (!isLocal(attachment)) {
      result.push(attachment);
      continue;
    }

    try {
      result.push(await uploadOne(api, familyId, eventId, attachment));
    } catch (thrown) {
      // One photograph failing must not take the others with it - and it must
      // not take the event either. The local copy stays in the list so the
      // person can still see what they added.
      failed += 1;
      error ??= thrown instanceof ApiError ? thrown : undefined;
      result.push(attachment);
    }
  }

  return { attachments: result, failed, error };
}

async function uploadOne(
  api: FamStoryApi,
  familyId: string,
  eventId: string,
  attachment: Attachment,
): Promise<Attachment> {
  const file = await readLocalFile(attachment.url);
  // A recorder reports "audio/webm;codecs=opus"; the server takes the type
  // without its parameters, and would refuse the rest as malformed. For a
  // recording, what the recorder said it made is the better witness than a
  // blob type guessed from a file name.
  const mimeType = baseType(
    (attachment.kind === 'audio' && attachment.mimeType) || file.type || attachment.mimeType || '',
  );

  const target = await api.requestUpload(familyId, eventId, {
    mimeType,
    sizeBytes: file.size,
    ...(attachment.kind === 'audio' && attachment.durationSec
      ? { durationSec: Math.max(1, Math.round(attachment.durationSec)) }
      : null),
  });

  const response = await fetch(target.uploadUrl, {
    method: target.method,
    headers: { 'Content-Type': mimeType },
    body: file,
  });

  if (!response.ok) throw await asApiError(response);

  await api.completeUpload(familyId, target.attachmentId);

  return { ...attachment, id: target.attachmentId };
}

/**
 * The picked file, as bytes.
 *
 * `fetch` on a local URI is the one way to do this that is the same on the web
 * (a `blob:` URL from the file input) and on a phone (`file://`). What it does
 * not give is progress; when this moves to a native build with uploads worth
 * watching, expo-file-system's `uploadAsync` is the replacement, and only this
 * function changes.
 */
export async function readLocalFile(uri: string): Promise<Blob> {
  const response = await fetch(uri);
  if (!response.ok) throw new Error(`The photograph could not be read (${response.status}).`);

  const blob = await response.blob();

  // A blob with no type happens on some Android providers. The server refuses
  // an unknown type, so guess from the name rather than let it fail there.
  return blob.type ? blob : new Blob([blob], { type: guessType(uri) });
}

function guessType(uri: string): string {
  const extension = uri.split('?')[0].split('.').pop()?.toLowerCase();

  switch (extension) {
    case 'png':
      return 'image/png';
    case 'webp':
      return 'image/webp';
    case 'heic':
      return 'image/heic';
    case 'heif':
      return 'image/heif';
    // Recordings: a phone's is .m4a, a browser's .webm or .ogg.
    case 'm4a':
    case 'mp4':
      return 'audio/mp4';
    case 'webm':
      return 'audio/webm';
    case 'ogg':
      return 'audio/ogg';
    case 'mp3':
      return 'audio/mpeg';
    case 'aac':
      return 'audio/aac';
    default:
      return 'image/jpeg';
  }
}

/** The PUT goes straight to a signed URL, so its refusal is parsed here. */
async function asApiError(response: Response): Promise<ApiError> {
  let code = `http_${response.status}`;
  let message = 'The photograph could not be uploaded.';

  try {
    const body = (await response.json()) as { error?: { code?: string; message?: string } };
    code = body.error?.code ?? code;
    message = body.error?.message ?? message;
  } catch {
    // Not JSON - a proxy error page, or nothing at all.
  }

  return new ApiError(response.status, code, message);
}
