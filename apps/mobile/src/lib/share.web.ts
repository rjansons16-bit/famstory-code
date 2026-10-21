/**
 * Handing a link to somebody else, in a browser.
 *
 * Two paths, in this order. A phone browser has the system share sheet behind
 * `navigator.share`, which is the same sheet the native app would get. A
 * desktop browser has no such thing, so the link goes to the clipboard and the
 * screen says so - a "Share" button that opens nothing looks broken.
 */
export async function shareText(text: string, title?: string): Promise<'shared' | 'copied' | 'failed'> {
  if (typeof navigator !== 'undefined' && navigator.share) {
    try {
      await navigator.share({ text, title });
      return 'shared';
    } catch {
      // Dismissed, or refused by the browser. The clipboard is still worth a try.
    }
  }

  try {
    await navigator.clipboard.writeText(text);
    return 'copied';
  } catch {
    return 'failed';
  }
}
