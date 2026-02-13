export type MessagingChannel = "sms";

export interface OutboundMessage {
  channel: MessagingChannel;
  to: string;
  body: string;
  metadata?: Record<string, string>;
  idempotencyKey?: string;
}

export interface SendResult {
  provider: "twilio";
  providerMessageId?: string;
  mock: boolean;
}

export interface MessagingGateway {
  send(message: OutboundMessage): Promise<SendResult>;
}
