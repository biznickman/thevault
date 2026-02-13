import { inngest } from "@/lib/inngest/client";
import { getSupabaseAdminClient } from "@/lib/supabase/server";
import { messagingGateway } from "@/lib/channels/sms";
import type { MemberRecord } from "@/lib/vault/types";

const ellisOpeningText =
  "Technically we don't need more information from you other than your location. This will enable the concierge team to curate experiences for you nearby. That said, the more I can learn about you, the better I can curate experiences and the higher likelihood you'll unlock private members-only experiences.";

export const handoffToEllis = inngest.createFunction(
  { id: "handoff-to-ellis", retries: 2 },
  { event: "vault/member.handoff.requested" },
  async ({ event, step }) => {
    const memberId = event.data.memberId as string;
    const supabase = getSupabaseAdminClient();

    const { data: member, error: memberError } = await supabase
      .from("members")
      .select("*")
      .eq("id", memberId)
      .single<MemberRecord>();

    if (memberError || !member) {
      throw new Error("Unable to load member for Ellis handoff.");
    }

    const handoffMessage =
      "Great, I am going to connect you with Ellis, who handles onboarding.";

    await step.run("send-knox-handoff", async () => {
      await messagingGateway.send({
        channel: "sms",
        to: member.phone,
        body: handoffMessage,
        metadata: { concierge: "Knox", workflow: "handoff" },
        idempotencyKey: `handoff:${member.id}:knox`,
      });

      await supabase.from("conversations").insert({
        member_id: member.id,
        concierge: "Knox",
        level: 1,
        channel: "sms",
        direction: "outbound",
        message_text: handoffMessage,
      });
    });

    await step.run("send-ellis-opening", async () => {
      await messagingGateway.send({
        channel: "sms",
        to: member.phone,
        body: ellisOpeningText,
        metadata: { concierge: "Ellis", workflow: "onboarding" },
        idempotencyKey: `handoff:${member.id}:ellis`,
      });

      await supabase.from("conversations").insert({
        member_id: member.id,
        concierge: "Ellis",
        level: 2,
        channel: "sms",
        direction: "outbound",
        message_text: ellisOpeningText,
      });
    });

    await step.run("set-member-guest", async () => {
      await supabase
        .from("members")
        .update({ status: "guest", level: 2, assigned_concierge: "Ellis" })
        .eq("id", member.id);
    });

    return { memberId, assigned: "Ellis" };
  },
);
