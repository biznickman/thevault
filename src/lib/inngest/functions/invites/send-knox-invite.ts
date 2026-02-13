import { inngest } from "@/lib/inngest/client";
import { getSupabaseAdminClient } from "@/lib/supabase/server";
import { messagingGateway } from "@/lib/channels/sms";
import type { InviteRecord, MemberRecord } from "@/lib/vault/types";

function buildKnoxInviteText(member: MemberRecord) {
  return `Hey ${member.first_name}, ${member.nominated_by_full_name} invited you to The Vault, a private social club. Happy to provide you with more details if you're interested. If not, I will move along and will never message you again! ~ Knox (Lead onboarding concierge)`;
}

export const sendKnoxInvite = inngest.createFunction(
  { id: "invite-send-knox", retries: 2 },
  { event: "vault/invite.queued" },
  async ({ event, step }) => {
    const supabase = getSupabaseAdminClient();
    const inviteId = event.data.inviteId as string;

    const { data: invite, error: inviteError } = await supabase
      .from("invites")
      .select("*")
      .eq("id", inviteId)
      .single<InviteRecord>();

    if (inviteError || !invite || invite.status !== "queued") {
      return { ignored: true };
    }

    const { data: member, error: memberError } = await supabase
      .from("members")
      .select("*")
      .eq("id", invite.member_id)
      .single<MemberRecord>();

    if (memberError || !member) {
      throw new Error("Unable to load member for invite.");
    }

    const messageText = buildKnoxInviteText(member);

    await step.run("send-sms", async () => {
      await messagingGateway.send({
        channel: "sms",
        to: member.phone,
        body: messageText,
        metadata: { concierge: "Knox", workflow: "invite" },
        idempotencyKey: `invite:${invite.id}:knox`,
      });
    });

    await step.run("persist-knox-message", async () => {
      await supabase.from("conversations").insert({
        member_id: member.id,
        concierge: "Knox",
        level: 1,
        channel: "sms",
        direction: "outbound",
        message_text: messageText,
      });
    });

    await step.run("mark-invite-sent", async () => {
      await supabase
        .from("invites")
        .update({ status: "sent", sent_at: new Date().toISOString() })
        .eq("id", invite.id);
    });

    return { inviteId: invite.id, memberId: member.id };
  },
);
