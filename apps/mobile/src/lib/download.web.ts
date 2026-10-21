/**
 * Handing the person a file, on the web.
 *
 * A Blob and a link that clicks itself: no server round trip, and the file
 * never leaves the machine it was made on - which matters when the file is a
 * family's whole chronicle.
 */
export function saveFile(name: string, contents: string | Blob, mimeType: string): boolean {
  if (typeof document === 'undefined') return false;

  const url = URL.createObjectURL(new Blob([contents], { type: mimeType }));
  const link = document.createElement('a');

  link.href = url;
  link.download = name;
  document.body.appendChild(link);
  link.click();
  link.remove();

  // Not immediately: Safari needs the URL to outlive the click that used it.
  setTimeout(() => URL.revokeObjectURL(url), 1000);

  return true;
}
