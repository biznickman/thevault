import { NextResponse } from "next/server";
import { inngest } from "@/lib/inngest/client";
import { getSupabaseAdminClient } from "@/lib/supabase/server";
import { normalizePhone } from "@/lib/vault/text";

export async function POST(request: Request) {
  const contentType = request.headers.get("content-type") ?? "";
  const isForm = contentType.includes("application/x-www-form-urlencoded");

  const payload = isForm
    ? Object.fromEntries((await request.formData()).entries())
    : ((await request.json()) as Record<string, unknown>);

  const fromRaw = String(payload.From ?? payload.from ?? "");
  const bodyRaw = String(payload.Body ?? payload.body ?? "");
  const optOutTypeRaw = String(
    payload.OptOutType ?? payload.optOutType ?? "",
  ).toUpperCase();

  if (!fromRaw || !bodyRaw) {
    return NextResponse.json(
      { error: "Missing sender or message body." },
      { status: 400 },
    );
  }

  const from = normalizePhone(fromRaw);
  const messageText = bodyRaw.trim();
  const supabase = getSupabaseAdminClient();

  const { data: member, error: memberError } = await supabase
    .from("members")
    .select("*")
    .eq("phone", from)
    .single();

  if (memberError || !member) {
    return NextResponse.json(
      { error: "No invited member found for sender." },
      { status: 404 },
    );
  }

  await supabase.from("conversations").insert({
    member_id: member.id,
    concierge: "System",
    level: member.level,
    channel: "sms",
    direction: "inbound",
    message_text: messageText,
  });

  await inngest.send({
    name: "vault/sms.inbound.received",
    data: {
      memberId: member.id,
      from,
      messageText,
      optOutType: optOutTypeRaw || null,
    },
  });

  return new NextResponse("ok", { status: 200 });
}
