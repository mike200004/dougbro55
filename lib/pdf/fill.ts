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
import crypto from "crypto";
import { getTemplate } from "@/lib/templates";
import type { Placement } from "@/lib/templates/types";
import { downloadTemplateFile } from "@/lib/storage";
import { getFormTemplate, getProfile, latestSignedRequest } from "@/lib/db";
import { admin } from "@/lib/supabase/admin";

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

  // Generated library documents carry embedded form fields named after the
  // schema keys — fill by name and flatten.
  if (tpl.kind === "acroform") {
    const pdf = await PDFDocument.load(bytes);
    const form = pdf.getForm();
    for (const field of tpl.fields) {
      const value = field.source
        ? profile?.[field.source] ?? ""
        : fields[field.key] ?? "";
      const v = String(value).trim();
      if (!v) continue;
      try {
        if (field.type === "checkbox") {
          const cb = form.getCheckBox(field.key);
          if (CHECK_TRUTHY.test(v)) cb.check();
          else cb.uncheck();
        } else {
          form.getTextField(field.key).setText(v);
        }
      } catch {
        // Schema/PDF mismatch on one field — leave it blank rather than fail.
      }
    }
    form.updateFieldAppearances(await pdf.embedFont(StandardFonts.Helvetica));
    form.flatten();
    return pdf.save();
  }

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
  opts?: { ignoreSigned?: boolean },
): Promise<{ bytes: Uint8Array; filename: string }> {
  const safe = (name: string) => (name || "document").replace(/[^a-z0-9]+/gi, "-");

  // Once a document has been signed, the signed PDF (with its certificate
  // page) is the document of record everywhere.
  if (!opts?.ignoreSigned) {
    const signed = await latestSignedRequest(doc.id);
    if (signed?.signed_path) {
      const { data } = await admin().storage.from("form-templates").download(signed.signed_path);
      if (data) {
        return {
          bytes: new Uint8Array(await data.arrayBuffer()),
          filename: safe(`${doc.title || "document"}-signed`),
        };
      }
    }
  }

  if (doc.template_id) {
    const tpl = await getFormTemplate(doc.account_id, doc.template_id);
    if (!tpl) throw new Error("Form template not found");
    return { bytes: await fillTemplateDocument(tpl, doc.fields), filename: safe(doc.title || tpl.name) };
  }
  const profile = await getProfile(doc.account_id);
  const bytes = await fillDocument(doc.type as DocType, doc.fields, profile);
  return { bytes, filename: safe(doc.title || getTemplate(doc.type as DocType).shortName) };
}

// ---------------------------------------------------------------------------
// E-signature certificate page
// ---------------------------------------------------------------------------

export interface SignatureStamp {
  signerName: string;
  signerContact: string;
  documentTitle: string;
  signedAtIso: string;
  ip: string;
  userAgent: string;
  consentText: string;
  /** Optional drawn signature as a PNG data URL. */
  signaturePngDataUrl?: string | null;
}

/**
 * Append a signature certificate page to a PDF — the standard lightweight
 * e-sign approach: the signature (drawn or typed), signer identity, timestamp,
 * consent statement, and a SHA-256 fingerprint of the document being signed.
 */
export async function stampSignaturePage(
  pdfBytes: Uint8Array,
  stamp: SignatureStamp,
): Promise<Uint8Array> {
  const docHash = crypto.createHash("sha256").update(pdfBytes).digest("hex");
  const pdf = await PDFDocument.load(pdfBytes, { ignoreEncryption: true });
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const italic = await pdf.embedFont(StandardFonts.TimesRomanItalic);

  const page = pdf.addPage([612, 792]);
  const ink = rgb(0.106, 0.169, 0.267);
  const gold = rgb(0.663, 0.518, 0.247);
  const muted = rgb(0.35, 0.33, 0.3);
  let y = 720;

  page.drawText("Signature Certificate", { x: 64, y, size: 24, font: bold, color: ink });
  y -= 14;
  page.drawRectangle({ x: 64, y, width: 80, height: 2, color: gold });
  y -= 28;
  page.drawText("Completed electronically via Pheme (pheme.deals)", { x: 64, y, size: 10, font, color: muted });
  y -= 36;

  const row = (label: string, value: string) => {
    page.drawText(label.toUpperCase(), { x: 64, y, size: 8, font: bold, color: muted });
    y -= 14;
    page.drawText(value.slice(0, 95), { x: 64, y, size: 11, font, color: ink });
    y -= 24;
  };

  row("Document", stamp.documentTitle);
  row("Signer", stamp.signerName);
  row("Contact", stamp.signerContact);
  row("Signed at", stamp.signedAtIso);
  row("IP address", stamp.ip);
  row("Device", stamp.userAgent.slice(0, 90));
  row("Document SHA-256", docHash);

  y -= 6;
  page.drawText("SIGNATURE", { x: 64, y, size: 8, font: bold, color: muted });
  y -= 8;

  if (stamp.signaturePngDataUrl?.startsWith("data:image/png;base64,")) {
    const pngBytes = Buffer.from(stamp.signaturePngDataUrl.split(",")[1], "base64");
    const png = await pdf.embedPng(pngBytes);
    const dims = png.scaleToFit(260, 90);
    y -= dims.height;
    page.drawImage(png, { x: 64, y, width: dims.width, height: dims.height });
    y -= 10;
  } else {
    y -= 34;
    page.drawText(stamp.signerName, { x: 64, y, size: 26, font: italic, color: ink });
    y -= 10;
  }
  page.drawLine({ start: { x: 64, y }, end: { x: 340, y }, thickness: 1, color: ink });
  y -= 28;

  const consentLines = wrap(stamp.consentText, 92);
  for (const line of consentLines) {
    page.drawText(line, { x: 64, y, size: 8.5, font, color: muted });
    y -= 12;
  }

  return pdf.save();
}

function wrap(text: string, width: number): string[] {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let cur = "";
  for (const w of words) {
    if ((cur + " " + w).trim().length > width) {
      lines.push(cur.trim());
      cur = w;
    } else {
      cur += " " + w;
    }
  }
  if (cur.trim()) lines.push(cur.trim());
  return lines;
}
