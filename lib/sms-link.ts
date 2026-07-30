/**
 * Tap-to-send: build an `sms:` deep link that opens the sender's OWN Messages
 * app with the recipient and body prefilled — they tap send, and the text goes
 * out from THEIR number. Pheme deliberately sends no server-side SMS to third
 * parties: carriers require A2P registration we've opted out of, and a client
 * should see their agent's real number, which only the agent's own phone can
 * produce.
 *
 * Why the body param appears twice: iOS's Messages handler expects
 * `sms:+1…&body=…` while Android (RFC 5724) expects `sms:+1…?body=…`.
 * Emitting `?body=X&body=X` satisfies both — each OS honors the form it
 * understands and ignores the other. iOS body prefill is undocumented Apple
 * behavior, so any UI rendering this href must keep a visible "copy message"
 * fallback next to it.
 */
export function smsHref(phone: string | null | undefined, body: string): string {
  const target = (phone || "").replace(/[^+\d]/g, "");
  const encoded = encodeURIComponent(body);
  return `sms:${target}?body=${encoded}&body=${encoded}`;
}

/** The "here is your document" message the agent sends from their phone. */
export function documentTextMessage(
  docName: string,
  link: string,
  recipientName?: string | null,
): string {
  const who = recipientName?.trim();
  return `${who ? who + ", " : ""}here is your ${docName}: ${link}`;
}

/** The "please sign" message the agent sends from their phone. */
export function signatureTextMessage(
  docName: string,
  link: string,
  signerName?: string | null,
): string {
  const who = signerName?.trim();
  return `${who ? who + ", you" : "You"}'ve been asked to sign "${docName}". Review & sign: ${link}`;
}
