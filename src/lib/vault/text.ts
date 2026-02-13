const declinePatterns = [
  "stop",
  "unsubscribe",
  "not interested",
  "no thanks",
  "leave me alone",
  "dont text",
  "don't text",
];

const interestPatterns = [
  "yes",
  "yeah",
  "interested",
  "tell me more",
  "sounds good",
  "im in",
  "i'm in",
  "sure",
];

export function classifyReply(text: string): "decline" | "interest" | "other" {
  const normalized = text.toLowerCase();

  if (declinePatterns.some((p) => normalized.includes(p))) {
    return "decline";
  }

  if (interestPatterns.some((p) => normalized.includes(p))) {
    return "interest";
  }

  return "other";
}

export function isInfoSeekingReply(text: string): boolean {
  const normalized = text.toLowerCase();
  const patterns = [
    "what is this",
    "what's this",
    "who is this",
    "why are you texting",
    "why are you messaging",
    "how did you get my number",
    "more details",
    "?",
  ];

  return patterns.some((pattern) => normalized.includes(pattern));
}

export function normalizePhone(input: string): string {
  const digits = input.replace(/[^\d]/g, "");
  if (digits.length === 10) {
    return `+1${digits}`;
  }
  if (digits.length === 11 && digits.startsWith("1")) {
    return `+${digits}`;
  }
  if (input.startsWith("+")) {
    return input;
  }
  return `+${digits}`;
}
