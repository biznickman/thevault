export interface ConversationTurn {
  concierge: string;
  direction: "inbound" | "outbound";
  message_text: string;
  created_at: string;
}

export interface MemberFact {
  category: string;
  fact: string;
  confidence: number;
  updated_at: string;
}

export interface MemberContext {
  summary: string | null;
  facts: MemberFact[];
  recentTurns: ConversationTurn[];
}
