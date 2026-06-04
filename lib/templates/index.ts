import type { DocType } from "@/lib/types";
import type { TemplateDef } from "./types";
import { buyerRep } from "./buyerRep";
import { purchase } from "./purchase";
import { dualAgency } from "./dualAgency";

export const templates: Record<DocType, TemplateDef> = {
  buyer_rep: buyerRep,
  purchase,
  dual_agency: dualAgency,
};

export const templateList: TemplateDef[] = [buyerRep, purchase, dualAgency];

export function getTemplate(type: DocType): TemplateDef {
  return templates[type];
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
