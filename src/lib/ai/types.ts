export type IntentLabel = "affirmative" | "negative" | "neutral" | "ambiguous";

export interface IntentClassification {
  label: IntentLabel;
  confidence: number;
  rationale?: string;
}

export interface ExtractedFact {
  category: string;
  fact: string;
  confidence: number;
}

export interface MemoryExtraction {
  summary: string;
  facts: ExtractedFact[];
}
