import { NextResponse } from "next/server";
import { inngest } from "@/lib/inngest/client";
import { getSupabaseAdminClient } from "@/lib/supabase/server";
import { normalizePhone } from "@/lib/vault/text";

interface CreateInvitePayload {
  firstName: string;
  lastName: string;
  phone: string;
  nominatorFullName: string;
  nominatorContext?: string;
}

export async function POST(request: Request) {
  const payload = (await request.json()) as Partial<CreateInvitePayload>;

  if (
    !payload.firstName ||
    !payload.lastName ||
    !payload.phone ||
    !payload.nominatorFullName
  ) {
    return NextResponse.json(
      { error: "firstName, lastName, phone, and nominatorFullName are required" },
      { status: 400 },
    );
  }

  const supabase = getSupabaseAdminClient();
  const normalizedPhone = normalizePhone(payload.phone);

  const { data: member, error: memberError } = await supabase
    .from("members")
    .insert({
      first_name: payload.firstName,
      last_name: payload.lastName,
      phone: normalizedPhone,
      nominated_by_full_name: payload.nominatorFullName,
      nominator_context: payload.nominatorContext ?? null,
      status: "prospect",
      level: 1,
      assigned_concierge: "Knox",
    })
    .select("*")
    .single();

  if (memberError || !member) {
    return NextResponse.json(
      { error: memberError?.message ?? "Unable to create member." },
      { status: 500 },
    );
  }

  const { data: invite, error: inviteError } = await supabase
    .from("invites")
    .insert({
      member_id: member.id,
      status: "queued",
      channel: "sms",
    })
    .select("*")
    .single();

  if (inviteError || !invite) {
    return NextResponse.json(
      { error: inviteError?.message ?? "Unable to create invite." },
      { status: 500 },
    );
  }

  await inngest.send({
    name: "vault/invite.queued",
    data: { memberId: member.id, inviteId: invite.id },
  });

  return NextResponse.json({
    ok: true,
    memberId: member.id,
    inviteId: invite.id,
  });
}
