import { embedText } from "@/lib/ai/client";
import { getSupabaseAdminClient } from "@/lib/supabase/server";
import type { ConversationTurn, MemberContext, MemberFact } from "@/lib/memory/types";

export async function buildMemberContext(
  memberId: string,
  options?: { queryText?: string },
): Promise<MemberContext> {
  const supabase = getSupabaseAdminClient();
  const queryText = options?.queryText?.trim();
  const queryEmbedding = queryText ? await embedText(queryText) : null;

  const [{ data: summaries }, { data: recentFacts }, { data: turns }, semanticFactsResult] =
    await Promise.all([
    supabase
      .from("conversation_summaries")
      .select("summary_text, created_at")
      .eq("member_id", memberId)
      .order("created_at", { ascending: false })
      .limit(1),
    supabase
      .from("member_facts")
      .select("category, fact, confidence, updated_at")
      .eq("member_id", memberId)
      .eq("is_active", true)
      .order("updated_at", { ascending: false })
      .limit(8),
    supabase
      .from("conversations")
      .select("concierge, direction, message_text, created_at")
      .eq("member_id", memberId)
      .order("created_at", { ascending: false })
      .limit(12),
    queryEmbedding
      ? supabase.rpc("match_member_facts_by_embedding", {
          p_member_id: memberId,
          p_query_embedding: queryEmbedding,
          p_limit: 5,
        })
      : Promise.resolve({ data: null, error: null }),
  ]);

  const semanticFacts = semanticFactsResult.data as MemberFact[] | null;
  const selectedFacts =
    semanticFacts && semanticFacts.length > 0
      ? semanticFacts
      : ((recentFacts ?? []) as MemberFact[]);

  return {
    summary: summaries?.[0]?.summary_text ?? null,
    facts: selectedFacts,
    recentTurns: ((turns ?? []) as ConversationTurn[]).reverse(),
  };
}
