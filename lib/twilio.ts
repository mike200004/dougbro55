/** Send an SMS via Twilio's REST API using the account's provisioned number. */
const FROM = process.env.TWILIO_PHONE_NUMBER || "+14752703374";

export interface SendSmsResult {
  ok: boolean;
  sid?: string;
  status?: string;
  error?: string;
}

export async function sendSms(to: string, body: string): Promise<SendSmsResult> {
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  if (!sid || !token) return { ok: false, error: "Twilio is not configured." };

  const res = await fetch(
    `https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`,
    {
      method: "POST",
      headers: {
        Authorization: "Basic " + Buffer.from(`${sid}:${token}`).toString("base64"),
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({ To: to, From: FROM, Body: body }).toString(),
    },
  );
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    return { ok: false, error: data?.message || `Twilio error ${res.status}` };
  }
  return { ok: true, sid: data.sid, status: data.status };
}
