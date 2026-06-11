import type { AgentProfile, DocType } from "@/lib/types";

export type FieldType =
  | "text"
  | "longtext"
  | "date"
  | "currency"
  | "percent"
  | "checkbox"
  | "initials";

export interface FieldDef {
  key: string;
  label: string;
  type: FieldType;
  required?: boolean;
  /** When set, the value comes from the agent profile (not from the user/AI). */
  source?: keyof AgentProfile;
  /** Hint shown to the user and to the AI about what belongs here. */
  hint?: string;
  /**
   * Mutually-exclusive companions (e.g. the "is / is not contingent" checkbox
   * pair): once any listed key has a value, the walkthrough skips this field.
   */
  pairedWith?: string[];
  /** Editor grouping for long forms ("Parties & property", "Attorneys", …). */
  section?: string;
}

/** Where to stamp a value on the PDF. y is measured from the bottom-left (pdf-lib). */
export interface Placement {
  page: number;
  x: number;
  y: number;
  size?: number;
  maxWidth?: number;
}

export interface TemplateDef {
  id: DocType;
  name: string;
  /** Short human label for the document type. */
  shortName: string;
  description: string;
  /** Library grouping shown in the dashboard ("Brokerage & office", …). */
  category: string;
  /**
   * How the PDF is filled: "overlay" stamps text at mapped coordinates
   * (scanned originals); "acroform" fills embedded form fields named after
   * the field keys (our generated documents). Defaults to overlay.
   */
  kind?: "overlay" | "acroform";
  /** Path to the source PDF relative to the project root. */
  file: string;
  pages: number;
  fields: FieldDef[];
  placements: Record<string, Placement>;
}
