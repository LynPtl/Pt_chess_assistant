/** Release the screenshot object URL a previous result was showing.
 *
 *  Every paste creates one, and nothing else frees it, so without this a
 *  session of pasting a dozen screenshots keeps a dozen decoded images in
 *  memory for the lifetime of the tab. */
export function releaseResultUrl(state, revoke = (url) => URL.revokeObjectURL(url)) {
  if (state && state.kind === "result" && state.imageUrl) revoke(state.imageUrl);
}
