/** The one rule the paste handler needs: an image, or nothing at all.
 *
 *  Pasting text — a FEN, a URL, a paragraph — must leave the page exactly as
 *  it was, so this returns null rather than throwing or scanning anything. */
export function pickImageFile(items) {
  const item = Array.from(items ?? []).find((i) => i.type?.startsWith("image/"));
  return item?.getAsFile() ?? null;
}
