import type { DocType } from "@/lib/types";
import type { TemplateDef } from "./types";
import { generatedTemplates } from "./generated";

/** Display order of the library's category groups. */
export const templateCategories = [
  "Listings & transactions",
  "Brokerage & office",
  "Leasing & compliance",
] as const;

export const templateList: TemplateDef[] = [...generatedTemplates];

export const templates: Record<DocType, TemplateDef> = Object.fromEntries(
  templateList.map((t) => [t.id, t]),
) as Record<DocType, TemplateDef>;

/**
 * Look up a built-in template. Returns undefined for unknown/retired types
 * (e.g. a legacy document row whose template has been removed) — callers must
 * handle the missing case rather than assume a template always exists.
 */
export function getTemplate(type: string): TemplateDef | undefined {
  return templates[type as DocType];
}

export function isDocType(type: string): type is DocType {
  return type in templates;
}

/** Human label for a document type, with a safe fallback for retired types. */
export function docTypeLabel(type: string): string {
  return templates[type as DocType]?.shortName ?? "Retired form";
}

/** Fields the user/AI must supply (excludes profile-sourced auto fields). */
export function userFields(type: DocType) {
  return templates[type]?.fields.filter((f) => !f.source) ?? [];
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
