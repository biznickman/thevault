import {
  classifyIntentWithModel,
  generateEllisReplyWithContext,
} from "@/lib/ai/client";
import { runAgentLoop } from "@/lib/agent-loop/runtime";
import { messagingGateway } from "@/lib/channels/sms";
import { inngest } from "@/lib/inngest/client";
import { loadAgentInstructionPack } from "@/lib/agents/instructions";
import { buildMemberContext } from "@/lib/memory/context";
import { getSupabaseAdminClient } from "@/lib/supabase/server";
import { classifyReply, isInfoSeekingReply } from "@/lib/vault/text";
import type { MemberRecord } from "@/lib/vault/types";

type RouteDecision = "affirmative" | "negative" | "clarify";

const MODEL_CONFIDENCE_THRESHOLD = 0.8;

function toRouteDecisionFromDeterministic(text: string): RouteDecision | null {
  const deterministic = classifyReply(text);
  if (deterministic === "interest") {
    return "affirmative";
  }
  if (deterministic === "decline") {
    return "negative";
  }
  return null;
}

async function sendConciergeMessage(params: {
  memberId: string;
  phone: string;
  concierge: "Knox" | "Ellis";
  level: number;
  body: string;
  workflow: string;
  idempotencyKey: string;
}) {
  const supabase = getSupabaseAdminClient();

  await messagingGateway.send({
    channel: "sms",
    to: params.phone,
    body: params.body,
    metadata: { concierge: params.concierge, workflow: params.workflow },
    idempotencyKey: params.idempotencyKey,
  });

  await supabase.from("conversations").insert({
    member_id: params.memberId,
    concierge: params.concierge,
    level: params.level,
    channel: "sms",
    direction: "outbound",
    message_text: params.body,
  });
}

export const routeInboundMessage = inngest.createFunction(
  {
    id: "inbound-route",
    retries: 1,
    concurrency: { key: "event.data.memberId", limit: 1 },
  },
  { event: "vault/sms.inbound.received" },
  async ({ event, step }) => {
    return runAgentLoop(
      { memberId: event.data.memberId as string, eventName: event.name },
      async (hooks) => {
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

        await step.sendEvent("request-memory-refresh", {
          name: "vault/memory.refresh.requested",
          data: {
            memberId,
            sourceEvent: event.name,
          },
        });

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

        let decision = toRouteDecisionFromDeterministic(messageText);

        if (!decision) {
          await hooks.beforeModelCall({ memberId, eventName: event.name });
          const modelResult = await step.run("model-intent-classification", async () => {
            return classifyIntentWithModel(messageText);
          });

          if (modelResult && modelResult.confidence >= MODEL_CONFIDENCE_THRESHOLD) {
            if (modelResult.label === "affirmative") {
              decision = "affirmative";
            }
            if (modelResult.label === "negative") {
              decision = "negative";
            }
          }
        }

        if (decision === "negative") {
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

        if (decision === "affirmative") {
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
          const context = await step.run("load-member-context", async () => {
            return buildMemberContext(member.id, { queryText: messageText });
          });

          const instructionPack = await step.run(
            "load-ellis-instruction-pack",
            async () => {
              return loadAgentInstructionPack("ellis");
            },
          );

          const generatedReply = await step.run("generate-ellis-reply", async () => {
            return generateEllisReplyWithContext({
              memberFirstName: member.first_name,
              incomingMessage: messageText,
              context,
              instructionPack,
            });
          });

          const ellisFollowup =
            generatedReply ??
            "Thanks for sharing that. To start curating well for you, what city are you based in?";

          await step.run("ellis-continue-conversation", async () => {
            await sendConciergeMessage({
              memberId: member.id,
              phone: member.phone,
              concierge: "Ellis",
              level: 2,
              body: ellisFollowup,
              workflow: "onboarding_followup",
              idempotencyKey: `ellis-followup:${member.id}:${messageText.toLowerCase()}`,
            });
          });

          await hooks.messageSent({ memberId, eventName: event.name });
          return { routed: "ellis_followup" };
        }

        const infoReply =
          'The Vault is a private, invite-only social club run through concierge messaging. If you want to continue, reply "Yes". If not, reply "No" and I will move along.';
        const clarificationReply =
          'I could not determine if you want to continue. Please reply "Yes" to continue or "No" and I will move along.';

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
          await sendConciergeMessage({
            memberId: member.id,
            phone: member.phone,
            concierge: "Knox",
            level: member.level,
            body: replyText,
            workflow: "clarification",
            idempotencyKey: `knox-clarification:${member.id}`,
          });
        });

        await hooks.messageSent({ memberId, eventName: event.name });
        return { routed: "knox_clarification_sent" };
      },
      {
        messageReceived: async ({ memberId, eventName }) => {
          console.info("[agent-loop] message_received", { memberId, eventName });
        },
        beforeModelCall: async ({ memberId, eventName }) => {
          console.info("[agent-loop] before_model_call", { memberId, eventName });
        },
        messageSent: async ({ memberId, eventName }) => {
          console.info("[agent-loop] message_sent", { memberId, eventName });
        },
        loopErrored: async ({ memberId, eventName }, error) => {
          console.error("[agent-loop] errored", { memberId, eventName, error });
        },
      },
    );
  },
);
