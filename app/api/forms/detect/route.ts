import { NextRequest, NextResponse } from "next/server";
import { getAccount } from "@/lib/auth";
import { openai } from "@/lib/ai";
import type { FormTemplateField } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 60;

interface PageInput {
  image: string; // data:image/png;base64,...
  width: number; // PDF points
  height: number;
}

const SYSTEM = `You are looking at page images of a blank real-estate form (it has no fillable fields, so a person fills the blanks by hand or typewriter). Find every blank a person would fill in: names, addresses, prices, dates, percentages, phone/email, checkboxes, and signature/initial lines.

Return STRICT JSON: {"fields":[{"label": "...", "page": 0, "x": 0.0, "y": 0.0, "w": 0.0}]}
- page: 0-based page index matching the order of images given.
- x, y: normalized [0..1] coordinates (origin TOP-LEFT) of where the FILLED text should START — i.e. on the blank line, just after the printed label.
- w: normalized available width for the value (to the end of the blank).
- label: a short human label for the blank (e.g. "Buyer name", "Purchase price", "Closing date").
Only include real fillable blanks. Don't invent fields. Order them top-to-bottom.`;

function slug(s: string, i: number): string {
  const base = s.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 40);
  return base ? `${base}_${i}` : `field_${i}`;
}

export async function POST(req: NextRequest) {
  const account = await getAccount();
  if (!account) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: { pages?: PageInput[] };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const pages = (body.pages ?? []).slice(0, 6);
  if (!pages.length) return NextResponse.json({ error: "No pages" }, { status: 400 });

  const content: { type: "text" | "image_url"; text?: string; image_url?: { url: string } }[] = [
    { type: "text", text: `This form has ${pages.length} page(s), in order.` },
    ...pages.map((p) => ({ type: "image_url" as const, image_url: { url: p.image } })),
  ];

  let parsed: { fields?: { label: string; page: number; x: number; y: number; w: number }[] };
  try {
    const res = await openai().chat.completions.create({
      model: "gpt-4o",
      temperature: 0,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: SYSTEM },
        // @ts-expect-error vision content array
        { role: "user", content },
      ],
    });
    parsed = JSON.parse(res.choices[0]?.message?.content || "{}");
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Detection failed" },
      { status: 502 },
    );
  }

  const fields: FormTemplateField[] = (parsed.fields ?? []).map((f, i) => {
    const page = pages[f.page] ? f.page : 0;
    const { width: W, height: H } = pages[page];
    const size = 10;
    const xPt = Math.max(2, Math.min(f.x, 0.98) * W);
    // f.y is the top of the text location (top-left origin); convert to a PDF
    // baseline (bottom-left origin) sitting just below that line.
    const yPt = Math.max(2, H - f.y * H - size);
    const maxWidth = Math.max(40, Math.min(f.w || 0.3, 1 - f.x) * W);
    return {
      key: slug(f.label, i),
      label: f.label || `Field ${i + 1}`,
      type: "text",
      placement: { page, x: Math.round(xPt), y: Math.round(yPt), size, maxWidth: Math.round(maxWidth) },
    };
  });

  return NextResponse.json({ fields });
}
