// Core domain types shared across the app.

export type DocType = "buyer_rep" | "purchase" | "dual_agency";

export type DocStatus = "draft" | "completed";

export interface AgentProfile {
  broker_agency_name: string;
  agent_name: string;
  license_number: string;
  street: string;
  city_state_zip: string;
  email: string;
  phone: string;
}

export interface Client {
  id: string;
  full_name: string;
  secondary_name: string | null;
  email: string | null;
  phone: string | null;
  role: "buyer" | "seller" | "both" | null;
  notes: string | null;
  preferences: string | null;
  last_seen_at: string | null;
  created_at: string;
}

export interface FormTemplateField {
  key: string;
  label: string;
  type: "text" | "checkbox" | "dropdown";
  acro_name?: string;
  options?: string[];
  placement?: { page: number; x: number; y: number; size?: number; maxWidth?: number };
}

export interface FormTemplate {
  id: string;
  account_id: string;
  name: string;
  kind: "acroform" | "overlay";
  storage_path: string;
  fields: FormTemplateField[];
  created_by: string | null;
  created_at: string;
}

export type DocumentType = DocType | "uploaded";

export interface DocumentRecord {
  id: string;
  account_id: string;
  type: DocumentType;
  template_id: string | null;
  client_id: string | null;
  title: string;
  status: DocStatus;
  fields: Record<string, string>;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}
