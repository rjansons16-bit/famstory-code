/**
 * Handing the person a file.
 *
 * The web build - the one a family actually opens today - can save a file, and
 * does, in ./download.web.ts. A native build cannot without a file-system and
 * sharing module, and adding one to produce a JSON file nobody has asked for
 * on a phone yet is a native rebuild for a hypothetical.
 *
 * So this returns false and the screen says where the download works, which is
 * the truth. Until the native app ships, that sentence is never reached.
 */
export function saveFile(_name: string, _contents: string | Blob, _mimeType: string): boolean {
  return false;
}
