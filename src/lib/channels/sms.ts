import type { MessagingGateway, OutboundMessage, SendResult } from "@/lib/channels/gateway";

const twilioAccountSid = process.env.TWILIO_ACCOUNT_SID;
const twilioAuthToken = process.env.TWILIO_AUTH_TOKEN;
const twilioFromNumber = process.env.TWILIO_PHONE_NUMBER;

async function sendViaTwilio(message: OutboundMessage): Promise<SendResult> {
  const { to, body } = message;

  if (!twilioAccountSid || !twilioAuthToken || !twilioFromNumber) {
    console.info("[sms.mock] outbound", { to, body, metadata: message.metadata });
    return { provider: "twilio", mock: true };
  }

  const endpoint = `https://api.twilio.com/2010-04-01/Accounts/${twilioAccountSid}/Messages.json`;
  const payload = new URLSearchParams({
    To: to,
    From: twilioFromNumber,
    Body: body,
  });
  const auth = Buffer.from(`${twilioAccountSid}:${twilioAuthToken}`).toString(
    "base64",
  );

  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      Authorization: `Basic ${auth}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: payload,
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Twilio send failed: ${response.status} ${text}`);
  }

  const data = (await response.json()) as { sid?: string };
  return { provider: "twilio", providerMessageId: data.sid, mock: false };
}

export const messagingGateway: MessagingGateway = {
  async send(message) {
    if (message.channel !== "sms") {
      throw new Error(`Unsupported channel: ${message.channel}`);
    }

    return sendViaTwilio(message);
  },
};
