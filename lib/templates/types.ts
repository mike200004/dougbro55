import type { AgentProfile, DocType } from "@/lib/types";

export type FieldType =
  | "text"
  | "longtext"
  | "date"
  | "currency"
  | "percent"
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
  /** Path to the source PDF relative to the project root. */
  file: string;
  pages: number;
  fields: FieldDef[];
  placements: Record<string, Placement>;
}
