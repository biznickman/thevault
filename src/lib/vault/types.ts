export type MemberStatus = "prospect" | "guest" | "vaulted" | "do_not_contact";

export type ConciergeName = "Knox" | "Ellis" | "Sloane" | "Vaughn" | "System";

export type InviteStatus = "queued" | "sent" | "responded" | "declined" | "no_response";

export interface MemberRecord {
  id: string;
  first_name: string;
  last_name: string;
  phone: string;
  nominated_by_full_name: string;
  nominator_context: string | null;
  status: MemberStatus;
  level: number;
  assigned_concierge: ConciergeName;
  created_at: string;
}

export interface InviteRecord {
  id: string;
  member_id: string;
  status: InviteStatus;
  channel: "sms";
  sent_at: string | null;
  responded_at: string | null;
  created_at: string;
}
