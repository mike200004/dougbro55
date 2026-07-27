import { admin } from "@/lib/supabase/admin";

/**
 * Server-generated auth links that DON'T depend on Supabase's built-in SMTP or
 * the redirect-URL allowlist. We mint the token with admin.generateLink, then
 * build our own link carrying `token_hash`; the target page calls
 * supabase.auth.verifyOtp({ token_hash, type }) to establish the session.
 *
 * This lets us deliver password-reset and invite emails through Resend (our
 * production sender) with full branding, instead of Supabase's dev-only mailer
 * that only reaches project team members.
 */

const SITE = process.env.NEXT_PUBLIC_SITE_URL || "https://pheme.deals";

type LinkType = "recovery" | "invite";

export interface AuthLink {
  link: string;
  userId: string;
  email: string;
}

export async function generateAuthLink(
  type: LinkType,
  email: string,
  targetPath: string,
): Promise<AuthLink | null> {
  const { data, error } = await admin().auth.admin.generateLink({
    type,
    email,
    // For invites the redirect is only a fallback; verifyOtp on the target page
    // is what actually creates the session, so allowlisting isn't required.
    options: { redirectTo: `${SITE}${targetPath}` },
  } as Parameters<ReturnType<typeof admin>["auth"]["admin"]["generateLink"]>[0]);

  if (error || !data?.properties?.hashed_token || !data.user) return null;
  const tokenHash = data.properties.hashed_token;
  const link = `${SITE}${targetPath}?token_hash=${encodeURIComponent(tokenHash)}&type=${type}`;
  return { link, userId: data.user.id, email };
}
