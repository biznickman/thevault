import { embedTexts, extractMemoryFromConversation } from "@/lib/ai/client";
import { inngest } from "@/lib/inngest/client";
import { getSupabaseAdminClient } from "@/lib/supabase/server";
import type { ConversationTurn } from "@/lib/memory/types";

function formatTranscript(turns: ConversationTurn[]): string {
  return turns
    .map((turn) => {
      const speaker = turn.direction === "inbound" ? "Member" : turn.concierge;
      return `[${speaker}] ${turn.message_text}`;
    })
    .join("\n");
}

export const refreshMemberMemory = inngest.createFunction(
  {
    id: "memory-refresh-member",
    retries: 1,
    concurrency: { key: "event.data.memberId", limit: 1 },
  },
  { event: "vault/memory.refresh.requested" },
  async ({ event, step }) => {
    const memberId = event.data.memberId as string;
    const supabase = getSupabaseAdminClient();

    const turns = await step.run("load-turns", async () => {
      const { data, error } = await supabase
        .from("conversations")
        .select("concierge, direction, message_text, created_at")
        .eq("member_id", memberId)
        .order("created_at", { ascending: false })
        .limit(16);

      if (error) {
        throw new Error(`Unable to load conversation turns: ${error.message}`);
      }

      return ((data ?? []) as ConversationTurn[]).reverse();
    });

    if (turns.length === 0) {
      return { refreshed: false, reason: "no_turns" };
    }

    const extraction = await step.run("extract-memory", async () => {
      return extractMemoryFromConversation(formatTranscript(turns));
    });

    if (!extraction) {
      await step.run("log-memory-skipped", async () => {
        await supabase.from("memory_events").insert({
          member_id: memberId,
          event_type: "memory_refresh_skipped",
          payload: { reason: "no_extraction" },
        });
      });

      return { refreshed: false, reason: "no_extraction" };
    }

    await step.run("persist-summary", async () => {
      const summaryEmbedding = await embedTexts([extraction.summary]);

      await supabase.from("conversation_summaries").insert({
        member_id: memberId,
        summary_text: extraction.summary,
        source_message_count: turns.length,
        summary_embedding: summaryEmbedding?.[0] ?? null,
      });
    });

    await step.run("persist-facts", async () => {
      const topFacts = extraction.facts.slice(0, 12);
      const factTexts = topFacts.map((fact) => fact.fact);
      const embeddings = await embedTexts(factTexts);

      for (const [index, fact] of topFacts.entries()) {
        const embedding = embeddings?.[index] ?? null;

        const { data: existing } = await supabase
          .from("member_facts")
          .select("id")
          .eq("member_id", memberId)
          .eq("category", fact.category)
          .eq("fact", fact.fact)
          .limit(1);

        if (existing && existing.length > 0) {
          await supabase
            .from("member_facts")
            .update({
              confidence: fact.confidence,
              is_active: true,
              fact_embedding: embedding,
              updated_at: new Date().toISOString(),
              last_confirmed_at: new Date().toISOString(),
            })
            .eq("id", existing[0].id);
        } else {
          await supabase.from("member_facts").insert({
            member_id: memberId,
            category: fact.category,
            fact: fact.fact,
            confidence: fact.confidence,
            source: "llm_extraction",
            is_active: true,
            fact_embedding: embedding,
          });
        }
      }
    });

    await step.run("log-memory-refreshed", async () => {
      await supabase.from("memory_events").insert({
        member_id: memberId,
        event_type: "memory_refreshed",
        payload: {
          summaryLength: extraction.summary.length,
          factsCount: extraction.facts.length,
        },
      });
    });

    return { refreshed: true, factsCount: extraction.facts.length };
  },
);
