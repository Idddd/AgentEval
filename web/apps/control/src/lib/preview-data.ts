export type QuotaPreview = {
  endpoint: string;
  id: string;
  limit: string;
  model: string;
  status: "ACTIVE" | "DRAFT";
  usage: string;
};

export const quotaPreviews: QuotaPreview[] = [
  { endpoint: "api.deepseek.internal", id: "quota-deepseek-chat", limit: "600 RPM · 2M TPM", model: "deepseek-chat", status: "ACTIVE", usage: "68%" },
  { endpoint: "api.deepseek.internal", id: "quota-deepseek-reasoner", limit: "120 RPM · 800K TPM", model: "deepseek-reasoner", status: "DRAFT", usage: "—" },
  { endpoint: "embedding.platform.internal", id: "quota-embedding-v3", limit: "1K RPM · 5M TPM", model: "embedding-v3", status: "ACTIVE", usage: "42%" },
];

export type TicketPreview = {
  actionOwner: string;
  completedAt?: string;
  currentStep: string;
  id: string;
  kind: string;
  status: "PENDING" | "APPROVED" | "REJECTED";
  target: string;
};

export const pendingTicketPreviews: TicketPreview[] = [
  { actionOwner: "Platform Quota Approvers", currentStep: "Quota approval", id: "REQ-2026-0715", kind: "Quota increase", status: "PENDING", target: "deepseek-chat" },
  { actionOwner: "Security Review", currentStep: "Security review", id: "REQ-2026-0712", kind: "Skill binding", status: "PENDING", target: "SQL Query" },
];

export const historyTicketPreviews: TicketPreview[] = [
  { actionOwner: "Platform Operations", completedAt: "Jul 12", currentStep: "Completed", id: "REQ-2026-0688", kind: "Instance update", status: "APPROVED", target: "Research Assistant" },
  { actionOwner: "Platform Quota Approvers", completedAt: "Jul 08", currentStep: "Closed", id: "REQ-2026-0661", kind: "Quota request", status: "REJECTED", target: "embedding-v3" },
];
