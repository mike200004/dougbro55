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
  created_at: string;
}

export interface DocumentRecord {
  id: string;
  type: DocType;
  client_id: string | null;
  title: string;
  status: DocStatus;
  fields: Record<string, string>;
  created_at: string;
  updated_at: string;
}
