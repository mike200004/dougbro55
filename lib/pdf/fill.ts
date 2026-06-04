import { promises as fs } from "fs";
import path from "path";
import { PDFDocument, PDFFont, PDFPage, StandardFonts, rgb } from "pdf-lib";
import type { DocType, AgentProfile } from "@/lib/types";
import { getTemplate } from "@/lib/templates";
import type { Placement } from "@/lib/templates/types";

const INK = rgb(0.06, 0.09, 0.23);

/**
 * Fill a flat template PDF by overlaying typed values at mapped coordinates.
 * Agent-profile-sourced fields are pulled from `profile`; everything else from
 * `fields`. Returns the rendered PDF bytes.
 */
export async function fillDocument(
  type: DocType,
  fields: Record<string, string>,
  profile: AgentProfile | null,
): Promise<Uint8Array> {
  const tpl = getTemplate(type);
  const bytes = await fs.readFile(path.join(process.cwd(), tpl.file));
  const pdf = await PDFDocument.load(bytes);
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const pages = pdf.getPages();

  for (const field of tpl.fields) {
    const placement = tpl.placements[field.key];
    if (!placement) continue;

    const value = field.source
      ? profile?.[field.source] ?? ""
      : fields[field.key] ?? "";
    if (!value || !String(value).trim()) continue;

    const page = pages[placement.page];
    if (!page) continue;
    drawFitted(page, font, String(value).trim(), placement);
  }

  return pdf.save();
}

function drawFitted(
  page: PDFPage,
  font: PDFFont,
  text: string,
  p: Placement,
) {
  let size = p.size ?? 9;
  let out = text;

  if (p.maxWidth) {
    // Shrink to fit, down to a readable minimum.
    while (size > 6 && font.widthOfTextAtSize(out, size) > p.maxWidth) {
      size -= 0.5;
    }
    // Still too wide: truncate with an ellipsis.
    if (font.widthOfTextAtSize(out, size) > p.maxWidth) {
      while (out.length > 1 && font.widthOfTextAtSize(out + "…", size) > p.maxWidth) {
        out = out.slice(0, -1);
      }
      out += "…";
    }
  }

  page.drawText(out, { x: p.x, y: p.y, size, font, color: INK });
}
