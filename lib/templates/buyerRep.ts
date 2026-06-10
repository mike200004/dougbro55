import type { TemplateDef } from "./types";

// Coordinates derived from the source PDF (612x792). y is from bottom-left.
// Page 0 = inline blanks; page 1 = signature/contact block (labels printed
// below their blank lines, so values sit ~13px above the label baseline).
export const buyerRep: TemplateDef = {
  id: "buyer_rep",
  category: "Agency & representation",
  name: "Exclusive Right to Represent Buyer Agreement",
  shortName: "Buyer Rep",
  description:
    "Engages the broker as the buyer's exclusive agent (Connecticut).",
  file: "templates/buyer-rep.pdf",
  pages: 2,
  fields: [
    {
      key: "buyerNames",
      label: "Buyer(s)",
      type: "text",
      required: true,
      hint: "Full name(s) of the buyer(s).",
    },
    {
      key: "propertyDescription",
      label: "Property / Geographical Area",
      type: "longtext",
      required: true,
      hint: "Description of the property or area the buyer wants to purchase.",
    },
    {
      key: "termStart",
      label: "Term start date",
      type: "date",
      required: true,
    },
    {
      key: "termEnd",
      label: "Expiration date",
      type: "date",
      required: true,
    },
    {
      key: "feePercent",
      label: "Professional Service Fee (% of purchase price)",
      type: "percent",
      required: true,
      hint: "Broker commission as a percent of purchase price, e.g. 2.5",
    },
    {
      key: "feeFlat",
      label: "Professional Service Fee (flat $, alternative to %)",
      type: "currency",
    },
    {
      key: "retainerFee",
      label: "Non-refundable retainer fee ($)",
      type: "currency",
    },
    {
      key: "holdoverDays",
      label: "Holdover period (days after expiration)",
      type: "text",
    },
    { key: "certInitials", label: "Buyer certification initials", type: "initials" },
    { key: "buyerAddress", label: "Buyer address", type: "text" },
    { key: "buyerCityStateZip", label: "Buyer city/state/zip", type: "text" },
    { key: "buyerEmail", label: "Buyer email", type: "text" },
    // Auto-filled from the agent profile:
    { key: "brokerName", label: "Broker", type: "text", source: "broker_agency_name" },
    { key: "brokerNameP2", label: "Broker/Agency name", type: "text", source: "broker_agency_name" },
    { key: "brokerStreet", label: "Broker street", type: "text", source: "street" },
    { key: "brokerCityStateZip", label: "Broker city/state/zip", type: "text", source: "city_state_zip" },
    { key: "authorizedRep", label: "Authorized representative", type: "text", source: "agent_name" },
    { key: "brokerEmail", label: "Broker email", type: "text", source: "email" },
  ],
  placements: {
    // Page 0 — inline blanks
    buyerNames: { page: 0, x: 228, y: 680, size: 10, maxWidth: 308 },
    brokerName: { page: 0, x: 60, y: 669, size: 10, maxWidth: 350 },
    propertyDescription: { page: 0, x: 60, y: 646, size: 9, maxWidth: 515 },
    termStart: { page: 0, x: 284, y: 600, size: 8, maxWidth: 78 },
    termEnd: { page: 0, x: 450, y: 600, size: 8, maxWidth: 60 },
    certInitials: { page: 0, x: 160, y: 553, size: 9, maxWidth: 28 },
    retainerFee: { page: 0, x: 88, y: 381, size: 9, maxWidth: 65 },
    feePercent: { page: 0, x: 80, y: 404, size: 9, maxWidth: 200 },
    feeFlat: { page: 0, x: 510, y: 416, size: 8, maxWidth: 55 },
    holdoverDays: { page: 0, x: 80, y: 301, size: 9, maxWidth: 90 },
    // Page 1 — broker block (right column) + buyer contact (left column)
    brokerNameP2: { page: 1, x: 324, y: 255, size: 9, maxWidth: 240 },
    brokerStreet: { page: 1, x: 324, y: 225, size: 9, maxWidth: 240 },
    brokerCityStateZip: { page: 1, x: 324, y: 194, size: 9, maxWidth: 240 },
    authorizedRep: { page: 1, x: 324, y: 163, size: 9, maxWidth: 200 },
    brokerEmail: { page: 1, x: 324, y: 126, size: 9, maxWidth: 240 },
    buyerAddress: { page: 1, x: 36, y: 194, size: 9, maxWidth: 200 },
    buyerCityStateZip: { page: 1, x: 36, y: 163, size: 9, maxWidth: 200 },
    buyerEmail: { page: 1, x: 36, y: 126, size: 9, maxWidth: 240 },
  },
};
