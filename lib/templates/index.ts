import type { DocType } from "@/lib/types";
import type { TemplateDef } from "./types";
import { buyerRep } from "./buyerRep";
import { purchase } from "./purchase";
import { dualAgency } from "./dualAgency";
import { generatedTemplates } from "./generated";

/** Display order of the library's category groups. */
export const templateCategories = [
  "Agency & representation",
  "Listings & transactions",
  "Brokerage & office",
  "Leasing & compliance",
] as const;

export const templateList: TemplateDef[] = [
  buyerRep,
  dualAgency,
  purchase,
  ...generatedTemplates,
];

export const templates: Record<DocType, TemplateDef> = Object.fromEntries(
  templateList.map((t) => [t.id, t]),
) as Record<DocType, TemplateDef>;

export function getTemplate(type: DocType): TemplateDef {
  return templates[type];
}

export function isDocType(type: string): type is DocType {
  return type in templates;
}

/** Fields the user/AI must supply (excludes profile-sourced auto fields). */
export function userFields(type: DocType) {
  return templates[type].fields.filter((f) => !f.source);
}

/** Required user fields that are still empty in the given values. */
export function missingRequired(
  type: DocType,
  values: Record<string, string>,
): string[] {
  return userFields(type)
    .filter((f) => f.required && !values[f.key]?.trim())
    .map((f) => f.key);
}

export type { TemplateDef, FieldDef, FieldType, Placement } from "./types";
