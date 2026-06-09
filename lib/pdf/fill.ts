import { promises as fs } from "fs";
import path from "path";
import {
  PDFCheckBox,
  PDFDocument,
  PDFDropdown,
  PDFFont,
  PDFOptionList,
  PDFPage,
  PDFRadioGroup,
  PDFTextField,
  StandardFonts,
  rgb,
} from "pdf-lib";
import type {
  DocType,
  AgentProfile,
  DocumentRecord,
  FormTemplate,
  FormTemplateField,
} from "@/lib/types";
import { getTemplate } from "@/lib/templates";
import type { Placement } from "@/lib/templates/types";
import { downloadTemplateFile } from "@/lib/storage";
import { getFormTemplate, getProfile } from "@/lib/db";

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

// ---------------------------------------------------------------------------
// Uploaded form templates
// ---------------------------------------------------------------------------

const CHECK_TRUTHY = /^(yes|true|x|on|checked|1|✓)$/i;

/** Read the fillable (AcroForm) fields from an uploaded PDF. Empty if none. */
export async function detectAcroFields(bytes: Buffer): Promise<FormTemplateField[]> {
  const pdf = await PDFDocument.load(bytes, { ignoreEncryption: true });
  const form = pdf.getForm();
  const out: FormTemplateField[] = [];
  for (const f of form.getFields()) {
    const acro = f.getName();
    if (!acro) continue;
    const label = acro.replace(/[._]+/g, " ").replace(/\s+/g, " ").trim() || acro;
    if (f instanceof PDFTextField) {
      out.push({ key: acro, label, type: "text", acro_name: acro });
    } else if (f instanceof PDFCheckBox) {
      out.push({ key: acro, label, type: "checkbox", acro_name: acro });
    } else if (f instanceof PDFDropdown || f instanceof PDFOptionList || f instanceof PDFRadioGroup) {
      out.push({ key: acro, label, type: "dropdown", acro_name: acro, options: f.getOptions() });
    } else {
      out.push({ key: acro, label, type: "text", acro_name: acro });
    }
  }
  return out;
}

/** Fill an uploaded template's stored PDF with values keyed by field key. */
export async function fillTemplateDocument(
  template: FormTemplate,
  values: Record<string, string>,
): Promise<Uint8Array> {
  const bytes = await downloadTemplateFile(template.storage_path);

  if (template.kind === "acroform") {
    const pdf = await PDFDocument.load(bytes, { ignoreEncryption: true });
    const form = pdf.getForm();
    for (const field of template.fields) {
      const value = (values[field.key] ?? "").trim();
      if (!value) continue;
      const name = field.acro_name ?? field.key;
      try {
        if (field.type === "checkbox") {
          const cb = form.getCheckBox(name);
          if (CHECK_TRUTHY.test(value)) cb.check();
          else cb.uncheck();
        } else if (field.type === "dropdown") {
          form.getDropdown(name).select(value);
        } else {
          form.getTextField(name).setText(value);
        }
      } catch {
        // Field type mismatch / value not an allowed option — skip it.
      }
    }
    form.flatten();
    return pdf.save();
  }

  // overlay (flat/scanned templates) — coordinate draw using saved placements
  const pdf = await PDFDocument.load(bytes);
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const pages = pdf.getPages();
  for (const field of template.fields) {
    const value = (values[field.key] ?? "").trim();
    if (!value || !field.placement) continue;
    const page = pages[field.placement.page];
    if (!page) continue;
    drawFitted(page, font, value, field.placement);
  }
  return pdf.save();
}

/** Render a document's filled PDF — built-in template or uploaded form. */
export async function renderDocument(
  doc: DocumentRecord,
): Promise<{ bytes: Uint8Array; filename: string }> {
  const safe = (name: string) => (name || "document").replace(/[^a-z0-9]+/gi, "-");
  if (doc.template_id) {
    const tpl = await getFormTemplate(doc.account_id, doc.template_id);
    if (!tpl) throw new Error("Form template not found");
    return { bytes: await fillTemplateDocument(tpl, doc.fields), filename: safe(doc.title || tpl.name) };
  }
  const profile = await getProfile(doc.account_id);
  const bytes = await fillDocument(doc.type as DocType, doc.fields, profile);
  return { bytes, filename: safe(doc.title || getTemplate(doc.type as DocType).shortName) };
}
