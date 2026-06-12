// Core domain types shared across the app.

export type DocType =
  | "buyer_rep"
  | "purchase"
  | "dual_agency"
  | "listing_agreement"
  | "general_addendum"
  | "escalation_addendum"
  | "mutual_release"
  | "deposit_receipt"
  | "referral_agreement"
  | "commission_disbursement"
  | "independent_contractor"
  | "lead_paint_disclosure"
  | "rental_application";

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

export type ContactRole =
  | "buyer"
  | "seller"
  | "both"
  | "agent"
  | "attorney"
  | "lender"
  | "inspector"
  | "other";

export interface Client {
  id: string;
  full_name: string;
  secondary_name: string | null;
  email: string | null;
  phone: string | null;
  role: ContactRole | null;
  /** Brokerage / firm for professional contacts (agents, attorneys, lenders). */
  company: string | null;
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

export interface ActivityRecord {
  id: string;
  account_id: string;
  actor_id: string | null;
  type: string;
  message: string;
  meta: Record<string, unknown>;
  created_at: string;
}

export interface SignatureRequest {
  id: string;
  account_id: string;
  document_id: string;
  signer_name: string;
  signer_email: string | null;
  signer_phone: string | null;
  status: "pending" | "signed" | "declined" | "canceled";
  signed_path: string | null;
  audit: Record<string, unknown>;
  created_by: string | null;
  created_at: string;
  signed_at: string | null;
}

export interface DocumentRecord {
  id: string;
  account_id: string;
  type: DocumentType;
  template_id: string | null;
  archived: boolean;
  client_id: string | null;
  title: string;
  status: DocStatus;
  fields: Record<string, string>;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}
