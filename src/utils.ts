/**
 * Generates a cryptographically random nonce string for use in
 * the Content Security Policy of the webview HTML.
 *
 * A nonce is a random value that ties a specific <script> tag to
 * the CSP header, preventing injected scripts from executing.
 */
export function getNonce(): string {
  let text = '';
  const possible =
    'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  for (let i = 0; i < 32; i++) {
    text += possible.charAt(Math.floor(Math.random() * possible.length));
  }
  return text;
}
