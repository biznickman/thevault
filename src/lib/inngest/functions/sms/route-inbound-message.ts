import { inngest } from "@/lib/inngest/client";
import { getSupabaseAdminClient } from "@/lib/supabase/server";
import { messagingGateway } from "@/lib/channels/sms";
import { classifyReply, isInfoSeekingReply } from "@/lib/vault/text";
import type { MemberRecord } from "@/lib/vault/types";

export const routeInboundMessage = inngest.createFunction(
  { id: "inbound-route", retries: 1 },
  { event: "vault/sms.inbound.received" },
  async ({ event, step }) => {
    const memberId = event.data.memberId as string;
    const messageText = event.data.messageText as string;
    const optOutType = (event.data.optOutType as string | null) ?? null;
    const supabase = getSupabaseAdminClient();

    const { data: member, error: memberError } = await supabase
      .from("members")
      .select("*")
      .eq("id", memberId)
      .single<MemberRecord>();

    if (memberError || !member) {
      throw new Error("Unable to load member for inbound route.");
    }

    if (optOutType === "STOP") {
      await step.run("twilio-stop-do-not-contact", async () => {
        await supabase
          .from("members")
          .update({ status: "do_not_contact", assigned_concierge: "System" })
          .eq("id", memberId);

        await supabase
          .from("invites")
          .update({ status: "declined", responded_at: new Date().toISOString() })
          .eq("member_id", memberId)
          .in("status", ["queued", "sent"]);
      });

      return { routed: "twilio_opt_out" };
    }

    const intent = classifyReply(messageText);

    if (intent === "decline") {
      await step.run("set-do-not-contact", async () => {
        await supabase
          .from("members")
          .update({ status: "do_not_contact", assigned_concierge: "System" })
          .eq("id", memberId);
      });

      await step.run("decline-invite", async () => {
        await supabase
          .from("invites")
          .update({ status: "declined", responded_at: new Date().toISOString() })
          .eq("member_id", memberId)
          .in("status", ["queued", "sent"]);
      });

      return { routed: "decline" };
    }

    if (intent === "interest") {
      await step.run("mark-invite-responded", async () => {
        await supabase
          .from("invites")
          .update({ status: "responded", responded_at: new Date().toISOString() })
          .eq("member_id", memberId)
          .eq("status", "sent");
      });

      await step.sendEvent("handoff-to-ellis", {
        name: "vault/member.handoff.requested",
        data: {
          memberId,
          fromConcierge: "Knox",
          toConcierge: "Ellis",
        },
      });

      return { routed: "handoff_requested" };
    }

    if (member.assigned_concierge === "Ellis") {
      const ellisFollowup =
        "Thanks for sharing that. To start curating well for you, what city are you based in?";

      await step.run("ellis-continue-conversation", async () => {
        await messagingGateway.send({
          channel: "sms",
          to: member.phone,
          body: ellisFollowup,
          metadata: { concierge: "Ellis", workflow: "onboarding_followup" },
          idempotencyKey: `ellis-followup:${member.id}:${Date.now()}`,
        });

        await supabase.from("conversations").insert({
          member_id: member.id,
          concierge: "Ellis",
          level: 2,
          channel: "sms",
          direction: "outbound",
          message_text: ellisFollowup,
        });
      });

      return { routed: "ellis_followup" };
    }

    const infoReply =
      "The Vault is a private, invite-only social club run through concierge messaging. If you want to continue, reply \"Yes\". If not, reply \"No\" and I will move along.";
    const clarificationReply =
      "I couldn't determine if you want to continue. Please reply \"Yes\" to continue or \"No\" and I will move along.";

    const shouldSendInfoReply = isInfoSeekingReply(messageText);

    const priorClarification = await step.run("load-prior-clarification", async () => {
      const { count } = await supabase
        .from("conversations")
        .select("*", { count: "exact", head: true })
        .eq("member_id", member.id)
        .eq("concierge", "Knox")
        .eq("direction", "outbound")
        .ilike("message_text", "%reply \"Yes\"%");

      return count ?? 0;
    });

    if (priorClarification > 0) {
      await step.run("mark-no-response-after-clarification", async () => {
        await supabase
          .from("invites")
          .update({ status: "no_response" })
          .eq("member_id", member.id)
          .eq("status", "sent");
      });

      return { routed: "awaiting_explicit_reply" };
    }

    const replyText = shouldSendInfoReply ? infoReply : clarificationReply;

    await step.run("send-knox-clarification", async () => {
      await messagingGateway.send({
        channel: "sms",
        to: member.phone,
        body: replyText,
        metadata: { concierge: "Knox", workflow: "clarification" },
        idempotencyKey: `knox-clarification:${member.id}`,
      });

      await supabase.from("conversations").insert({
        member_id: member.id,
        concierge: "Knox",
        level: member.level,
        channel: "sms",
        direction: "outbound",
        message_text: replyText,
      });
    });

    return { routed: "knox_clarification_sent" };
  },
);
