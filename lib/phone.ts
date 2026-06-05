/** Normalize a US phone number to E.164 (+1XXXXXXXXXX). Returns "" if unusable. */
export function normalizePhone(input: string | null | undefined): string {
  if (!input) return "";
  const digits = input.replace(/[^\d]/g, "");
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  if (input.trim().startsWith("+")) return `+${digits}`;
  return digits ? `+${digits}` : "";
}
