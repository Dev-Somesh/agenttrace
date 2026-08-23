/**
 * A frozen, self-contained HTML snapshot of a state payload.
 *
 * The live page polls. A snapshot must not: it is a file someone can attach
 * to a PR. The UI already knows how to draw from an injected `__SNAPSHOT__`.
 */
export function snapshotHtml(uiTemplate, state) {
  // A PR attachment is about the runs. User-scoped documents (plans, skills
  // from a home directory) do not belong in a file someone will upload.
  const safe = { ...state, documents: [] };
  const payload = JSON.stringify(safe).replace(/</g, "\\u003c");
  return uiTemplate.replace(
    "<script>",
    `<script>window.__SNAPSHOT__=${payload};</script>\n<script>`
  );
}
