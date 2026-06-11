// Verifies schema<->PDF integrity for every generated template, then fills,
// flattens, and asserts every value renders in the output text layer.
import { PDFDocument, PDFTextField, PDFCheckBox, StandardFonts } from "pdf-lib";
import { readFileSync, writeFileSync } from "fs";
import { execSync } from "child_process";

const src = readFileSync("lib/templates/generated.ts", "utf8");
const json = JSON.parse(src.slice(src.indexOf("= [") + 2, src.lastIndexOf("] as") + 1));
const CHECK_TRUTHY = /^(yes|true|x|on|checked|1|✓)$/i;
let fail = 0;

for (const tpl of json) {
  const pdf = await PDFDocument.load(readFileSync(tpl.file));
  const form = pdf.getForm();
  const byName = new Map(form.getFields().map((f) => [f.getName(), f]));

  // 1. every schema field exists in the PDF with the right widget kind
  for (const f of tpl.fields) {
    const w = byName.get(f.key);
    if (!w) { console.log(`✗ ${tpl.id}: missing widget ${f.key}`); fail++; continue; }
    const wantCheck = f.type === "checkbox";
    const isCheck = w instanceof PDFCheckBox;
    if (wantCheck !== isCheck) { console.log(`✗ ${tpl.id}: ${f.key} widget kind mismatch`); fail++; }
  }
  // 2. no orphan widgets the schema doesn't know about
  for (const name of byName.keys()) {
    if (!tpl.fields.some((f) => f.key === name)) { console.log(`✗ ${tpl.id}: orphan widget ${name}`); fail++; }
  }

  // 3. fill (same logic as fillDocument's acroform branch), flatten, extract
  const values = {};
  for (let i = 0; i < tpl.fields.length; i++) {
    const f = tpl.fields[i];
    values[f.key] = f.type === "checkbox" ? "Yes" : f.type === "date" ? `06/0${(i % 9) + 1}/2026` : `TV${i}X`;
  }
  for (const f of tpl.fields) {
    const v = values[f.key];
    if (f.type === "checkbox") { if (CHECK_TRUTHY.test(v)) form.getCheckBox(f.key).check(); }
    else form.getTextField(f.key).setText(v);
  }
  form.updateFieldAppearances(await pdf.embedFont(StandardFonts.Helvetica));
  form.flatten();
  const out = `/tmp/lib-${tpl.id}.pdf`;
  writeFileSync(out, await pdf.save());
  const text = execSync(`pdftotext ${out} -`).toString();
  const missing = tpl.fields.filter((f) => f.type !== "checkbox" && !text.includes(values[f.key]));
  if (missing.length) { console.log(`✗ ${tpl.id}: values not rendered: ${missing.map((m) => m.key).join(", ")}`); fail++; }
  else console.log(`✓ ${tpl.id} (${tpl.fields.length} fields fill+flatten+render)`);
}
console.log(fail === 0 ? "ALL TEMPLATES PASS" : `${fail} FAILURES`);
process.exit(fail === 0 ? 0 : 1);
