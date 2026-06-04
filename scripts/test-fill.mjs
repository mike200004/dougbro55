// Coordinate-validation harness: fills each template with sample data and
// writes the result so we can eyeball placement. Run: node scripts/test-fill.mjs
import { promises as fs } from "fs";
import path from "path";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { buyerRep } from "../lib/templates/buyerRep.ts";
import { purchase } from "../lib/templates/purchase.ts";
import { dualAgency } from "../lib/templates/dualAgency.ts";

const templates = { buyer_rep: buyerRep, purchase, dual_agency: dualAgency };

const INK = rgb(0.06, 0.09, 0.23);

const profile = {
  broker_agency_name: "Bro Realty Group, LLC",
  agent_name: "Doug Bro",
  license_number: "RES.0812345",
  street: "55 Greenwich Ave",
  city_state_zip: "Greenwich, CT 06830",
  email: "doug@brorealty.com",
  phone: "(203) 555-0155",
};

const samples = {
  dual_agency: {
    propertyAddress: "12 Maple Street, Greenwich, CT 06830",
    sellerName: "Robert & Linda Carter",
    buyerName: "John & Jane Smith",
    listingAgreementDate: "05/01/2026",
    buyerAgencyDate: "05/10/2026",
    date: "06/04/2026",
  },
  buyer_rep: {
    buyerNames: "John Smith and Jane Smith",
    propertyDescription: "Single-family home in central Greenwich, CT, 3+ bedrooms",
    termStart: "06/04/2026",
    termEnd: "12/31/2026",
    feePercent: "2.5",
    retainerFee: "500",
    holdoverDays: "180",
    certInitials: "JS",
    buyerAddress: "88 Field Point Rd",
    buyerCityStateZip: "Greenwich, CT 06830",
    buyerEmail: "john.smith@email.com",
  },
  purchase: {
    date: "06/04/2026",
    sellerName: "Robert & Linda Carter",
    sellerAddress: "12 Maple Street, Greenwich, CT 06830",
    buyerName: "John & Jane Smith",
    buyerAddress: "88 Field Point Rd, Greenwich, CT 06830",
    propertyDescription: "12 Maple Street, Greenwich, CT 06830",
    price: "1,250,000",
    binderAmount: "25,000",
    escrowAgent: "Bro Realty Group, LLC",
    closingAmount: "1,000,000",
    closingDate: "08/15/2026",
    mortgageAmount: "225,000",
    financingDate: "07/15/2026",
    mortgageYears: "30",
    brokerFeePercent: "2.5",
  },
};

function drawFitted(page, font, text, p) {
  let size = p.size ?? 9;
  let out = text;
  if (p.maxWidth) {
    while (size > 6 && font.widthOfTextAtSize(out, size) > p.maxWidth) size -= 0.5;
    if (font.widthOfTextAtSize(out, size) > p.maxWidth) {
      while (out.length > 1 && font.widthOfTextAtSize(out + "…", size) > p.maxWidth)
        out = out.slice(0, -1);
      out += "…";
    }
  }
  page.drawText(out, { x: p.x, y: p.y, size, font, color: INK });
}

async function fill(type, fields) {
  const tpl = templates[type];
  const bytes = await fs.readFile(path.join(process.cwd(), tpl.file));
  const pdf = await PDFDocument.load(bytes);
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const pages = pdf.getPages();
  for (const field of tpl.fields) {
    const pl = tpl.placements[field.key];
    if (!pl) continue;
    const value = field.source ? profile[field.source] ?? "" : fields[field.key] ?? "";
    if (!value || !String(value).trim()) continue;
    drawFitted(pages[pl.page], font, String(value).trim(), pl);
  }
  return pdf.save();
}

await fs.mkdir("/tmp/fill-test", { recursive: true });
for (const [type, fields] of Object.entries(samples)) {
  const out = await fill(type, fields);
  await fs.writeFile(`/tmp/fill-test/${type}.pdf`, out);
  console.log(`wrote /tmp/fill-test/${type}.pdf`);
}
