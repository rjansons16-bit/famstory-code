import { Share } from 'react-native';

/**
 * Handing a link to somebody else.
 *
 * On a phone that is the system share sheet - the list of every app the person
 * already talks to their family in. See ./share.web.ts for the browser, where
 * there is no such list and the answer is the clipboard.
 */
export async function shareText(text: string, title?: string): Promise<'shared' | 'copied' | 'failed'> {
  try {
    const result = await Share.share({ message: text }, { dialogTitle: title });
    return result.action === Share.dismissedAction ? 'failed' : 'shared';
  } catch {
    return 'failed';
  }
}
