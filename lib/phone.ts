/** Normalize a US phone number to E.164 (+1XXXXXXXXXX). Returns "" if unusable. */
export function normalizePhone(input: string | null | undefined): string {
  if (!input) return "";
  const digits = input.replace(/[^\d]/g, "");
  // NANP: exactly 10 digits (or 11 with a leading 1), and neither the area
  // code nor the exchange may start with 0/1. Anything else is unusable —
  // the old catch-all (`+${digits}`) let "12" become the stored caller-ID
  // "+12", a number that can never match an inbound call.
  const ten = digits.length === 11 && digits.startsWith("1") ? digits.slice(1) : digits;
  if (ten.length !== 10) return "";
  if (ten[0] === "0" || ten[0] === "1" || ten[3] === "0" || ten[3] === "1") return "";
  return `+1${ten}`;
}
