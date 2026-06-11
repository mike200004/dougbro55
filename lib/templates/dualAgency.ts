import type { TemplateDef } from "./types";

// Coordinates derived from the source PDF (612x792). y is from bottom-left.
export const dualAgency: TemplateDef = {
  id: "dual_agency",
  category: "Agency & representation",
  name: "Dual Agency Consent Agreement",
  shortName: "Dual Agency",
  description:
    "Consent for the brokerage to represent both buyer and seller (Public Act 96-159).",
  file: "templates/dual-agency.pdf",
  pages: 1,
  fields: [
    {
      key: "propertyAddress",
      label: "Property Address",
      type: "text",
      required: true,
      hint: "Full street address of the property in the transaction.",
    },
    {
      key: "sellerName",
      label: "Seller(s) / Landlord(s)",
      type: "text",
      required: true,
    },
    {
      key: "buyerName",
      label: "Buyer(s) / Tenant(s)",
      type: "text",
      required: true,
    },
    {
      key: "brokerageFirm",
      label: "Brokerage Firm",
      type: "text",
      required: true,
      source: "broker_agency_name",
    },
    {
      key: "listingAgreementDate",
      label: "Listing Agreement date",
      type: "date",
      hint: "Date of the listing agreement this consent is an addendum to (if applicable).",
    },
    {
      key: "buyerAgencyDate",
      label: "Buyer/Tenant agency agreement date",
      type: "date",
      hint: "Date of the buyer/tenant agency agreement (if applicable).",
    },
    {
      key: "date",
      label: "Date signed",
      type: "date",
    },
  ],
  placements: {
    propertyAddress: { page: 0, x: 126, y: 719, size: 10, maxWidth: 460 },
    sellerName: { page: 0, x: 151, y: 692, size: 10, maxWidth: 430 },
    buyerName: { page: 0, x: 144, y: 664, size: 10, maxWidth: 440 },
    listingAgreementDate: { page: 0, x: 172, y: 616, size: 9, maxWidth: 155 },
    buyerAgencyDate: { page: 0, x: 245, y: 596, size: 9, maxWidth: 120 },
    brokerageFirm: { page: 0, x: 90, y: 548, size: 9, maxWidth: 200 },
    date: { page: 0, x: 431, y: 27, size: 9, maxWidth: 150 },
  },
};
