import type { GuardrailTemplate } from "../model";

export const guardTemplateFixtures = [
  {
    id: "advanced-au-pii-protection",
    name: "Advanced PII Protection (Australia)",
    description:
      "Protects Australian-specific identifiers, international employee data, financial information, credentials, protected class information, and industry-specific sensitive data.",
    purpose:
      "Protects Australian-specific identifiers, international employee data, financial information, credentials, protected class information, and industry-specific sensitive data.",
    allowedTopics: [],
    restrictedTopics: [],
    defaultControls: [
      {
        risk: "builtin_content_filter",
        action: "reject",
        enabled: true,
      },
    ],
    safetyLevel: "balanced",
    outputDelivery: "window_buffered",
    source: "LiteLLM OSS · locally built in",
    version: "1.95.0",
    domain: "Data Protection",
    collections: [
      "TALI Australia Data Protection",
      "OWASP Top 10 for LLM Applications 2025",
    ],
    tags: ["PII Protection", "Australia"],
    limitations: [
      "Keyword and pattern rules may not detect every semantic paraphrase.",
      "Adjacent integration and application security controls remain independently required.",
    ],
    controls: [
      "au-pii-tax-identifiers",
      "au-pii-passports",
      "international-pii-identifiers",
      "contact-information-pii",
      "financial-pii",
      "credentials-api-keys",
      "network-infrastructure-pii",
      "protected-class-information",
    ],
    parameters: [],
  },
  {
    id: "baseline-pii-protection",
    name: "Baseline PII Protection",
    description:
      "Baseline PII protection for internal tools and testing. Focuses on credentials and high-risk identifiers only. Suitable for non-sensitive internal use.",
    purpose:
      "Baseline PII protection for internal tools and testing. Focuses on credentials and high-risk identifiers only. Suitable for non-sensitive internal use.",
    allowedTopics: [],
    restrictedTopics: [],
    defaultControls: [
      {
        risk: "builtin_content_filter",
        action: "reject",
        enabled: true,
      },
    ],
    safetyLevel: "balanced",
    outputDelivery: "window_buffered",
    source: "LiteLLM OSS · locally built in",
    version: "1.95.0",
    domain: "Data Protection",
    collections: [
      "TALI Runtime Baseline",
      "OWASP Top 10 for LLM Applications 2025",
    ],
    tags: ["PII Protection"],
    limitations: [
      "Keyword and pattern rules may not detect every semantic paraphrase.",
      "Adjacent integration and application security controls remain independently required.",
    ],
    controls: [
      "au-pii-tax-identifiers",
      "credentials-api-keys",
      "financial-pii",
    ],
    parameters: [],
  },
  {
    id: "nsfw-content-filter-australia",
    name: "NSFW Content Filter (Australia)",
    description:
      "Blocks profanity, sexual content, NSFW requests, self-harm content, and child safety violations using English and Australian-specific slang. Protects against inappropriate content including sexual solicitation, explicit content, Australian profanity, self-harm, and content involving minors.",
    purpose:
      "Blocks profanity, sexual content, NSFW requests, self-harm content, and child safety violations using English and Australian-specific slang. Protects against inappropriate content including sexual solicitation, explicit content, Australian profanity, self-harm, and content involving minors.",
    allowedTopics: [],
    restrictedTopics: [],
    defaultControls: [
      {
        risk: "builtin_content_filter",
        action: "reject",
        enabled: true,
      },
    ],
    safetyLevel: "balanced",
    outputDelivery: "window_buffered",
    source: "LiteLLM OSS · locally built in",
    version: "1.95.0",
    domain: "Content Safety",
    collections: [
      "TALI Global Content Safety",
      "OWASP Top 10 for LLM Applications 2025",
    ],
    tags: ["Content Safety", "Australia"],
    limitations: [
      "Keyword and pattern rules may not detect every semantic paraphrase.",
      "Adjacent integration and application security controls remain independently required.",
    ],
    controls: [
      "nsfw-content-filter-english",
      "nsfw-content-filter-australian",
      "nsfw-self-harm-filter",
      "nsfw-child-safety-filter",
      "nsfw-racial-bias-filter",
    ],
    parameters: [],
  },
  {
    id: "nsfw-content-filter-basic",
    name: "NSFW Content Filter (Basic)",
    description:
      "Basic NSFW content filtering for English only. Blocks profanity, sexual content, slurs, solicitation, explicit requests, self-harm content, and child safety violations. Suitable for most applications requiring content moderation.",
    purpose:
      "Basic NSFW content filtering for English only. Blocks profanity, sexual content, slurs, solicitation, explicit requests, self-harm content, and child safety violations. Suitable for most applications requiring content moderation.",
    allowedTopics: [],
    restrictedTopics: [],
    defaultControls: [
      {
        risk: "builtin_content_filter",
        action: "reject",
        enabled: true,
      },
    ],
    safetyLevel: "balanced",
    outputDelivery: "window_buffered",
    source: "LiteLLM OSS · locally built in",
    version: "1.95.0",
    domain: "Content Safety",
    collections: [
      "TALI Runtime Baseline",
      "OWASP Top 10 for LLM Applications 2025",
    ],
    tags: ["Content Safety"],
    limitations: [
      "Keyword and pattern rules may not detect every semantic paraphrase.",
      "Adjacent integration and application security controls remain independently required.",
    ],
    controls: [
      "nsfw-content-filter-english-only",
      "nsfw-self-harm-filter-basic",
      "nsfw-child-safety-filter-basic",
      "nsfw-racial-bias-filter-basic",
    ],
    parameters: [],
  },
  {
    id: "nsfw-content-filter-all-regions",
    name: "NSFW Content Filter (All Regions)",
    description:
      "Comprehensive multi-language NSFW content filtering. Blocks profanity, sexual content, inappropriate requests, self-harm content, and child safety violations in English, Spanish, French, German, and Australian. Best for global applications.",
    purpose:
      "Comprehensive multi-language NSFW content filtering. Blocks profanity, sexual content, inappropriate requests, self-harm content, and child safety violations in English, Spanish, French, German, and Australian. Best for global applications.",
    allowedTopics: [],
    restrictedTopics: [],
    defaultControls: [
      {
        risk: "builtin_content_filter",
        action: "reject",
        enabled: true,
      },
    ],
    safetyLevel: "balanced",
    outputDelivery: "window_buffered",
    source: "LiteLLM OSS · locally built in",
    version: "1.95.0",
    domain: "Content Safety",
    collections: [
      "TALI Global Content Safety",
      "OWASP Top 10 for LLM Applications 2025",
    ],
    tags: ["Content Safety", "Global"],
    limitations: [
      "Keyword and pattern rules may not detect every semantic paraphrase.",
      "Adjacent integration and application security controls remain independently required.",
    ],
    controls: [
      "nsfw-filter-english",
      "nsfw-filter-spanish",
      "nsfw-filter-french",
      "nsfw-filter-german",
      "nsfw-filter-australian",
      "nsfw-self-harm-filter-global",
      "nsfw-child-safety-filter-global",
      "nsfw-racial-bias-filter-global",
    ],
    parameters: [],
  },
  {
    id: "gdpr-eu-pii-protection",
    name: "GDPR Art. 32 — EU PII Protection",
    description:
      "GDPR Article 32 compliance for EU personal data protection. Masks French national IDs (NIR/INSEE), EU IBANs, French phone numbers, EU VAT numbers, EU passport numbers, and email addresses. Suitable for applications processing EU citizen data requiring GDPR compliance.",
    purpose:
      "GDPR Article 32 compliance for EU personal data protection. Masks French national IDs (NIR/INSEE), EU IBANs, French phone numbers, EU VAT numbers, EU passport numbers, and email addresses. Suitable for applications processing EU citizen data requiring GDPR compliance.",
    allowedTopics: [],
    restrictedTopics: [],
    defaultControls: [
      {
        risk: "builtin_content_filter",
        action: "reject",
        enabled: true,
      },
    ],
    safetyLevel: "balanced",
    outputDelivery: "window_buffered",
    source: "LiteLLM OSS · locally built in",
    version: "1.95.0",
    domain: "Data Protection",
    collections: [
      "TALI EU AI & Data Protection",
      "OWASP Top 10 for LLM Applications 2025",
    ],
    tags: ["PII Protection", "Regulatory", "EU"],
    limitations: [
      "This template covers selected identifiers and is not a complete GDPR compliance program.",
      "Keyword and pattern rules may not detect every semantic paraphrase.",
      "Adjacent integration and application security controls remain independently required.",
    ],
    controls: [
      "gdpr-eu-national-identifiers",
      "gdpr-eu-financial-data",
      "gdpr-eu-contact-information",
      "gdpr-eu-business-identifiers",
    ],
    parameters: [],
  },
  {
    id: "eu-ai-act-article5",
    name: "EU AI Act Article 5 — Prohibited Practices",
    description:
      "Comprehensive EU AI Act Article 5 compliance covering all prohibited AI practices. Includes 5 dedicated sub-guardrails per language (English + French) for: subliminal manipulation (Art. 5.1a), vulnerability exploitation (Art. 5.1b), social scoring (Art. 5.1c), emotion recognition in workplace/education (Art. 5.1f), and biometric categorization & predictive profiling (Art. 5.1d/g/h). Uses conditional matching (identifier word + context word).",
    purpose:
      "Comprehensive EU AI Act Article 5 compliance covering all prohibited AI practices. Includes 5 dedicated sub-guardrails per language (English + French) for: subliminal manipulation (Art. 5.1a), vulnerability exploitation (Art. 5.1b), social scoring (Art. 5.1c), emotion recognition in workplace/education (Art. 5.1f), and biometric categorization & predictive profiling (Art. 5.1d/g/h). Uses conditional matching (identifier word + context word).",
    allowedTopics: [],
    restrictedTopics: [],
    defaultControls: [
      {
        risk: "builtin_content_filter",
        action: "reject",
        enabled: true,
      },
    ],
    safetyLevel: "balanced",
    outputDelivery: "window_buffered",
    source: "LiteLLM OSS · locally built in",
    version: "1.95.0",
    domain: "Content Safety",
    collections: ["TALI EU AI & Data Protection"],
    tags: ["Regulatory", "EU"],
    limitations: [
      "Runtime keyword controls cover selected prohibited-practice indicators only.",
      "Legal assessment and system-level governance remain outside this template.",
    ],
    controls: [
      "eu-ai-act-art5-manipulation",
      "eu-ai-act-art5-vulnerability",
      "eu-ai-act-art5-social-scoring",
      "eu-ai-act-art5-emotion-recognition",
      "eu-ai-act-art5-biometric-profiling",
      "eu-ai-act-art5-manipulation-fr",
      "eu-ai-act-art5-vulnerability-fr",
      "eu-ai-act-art5-social-scoring-fr",
      "eu-ai-act-art5-emotion-recognition-fr",
      "eu-ai-act-art5-biometric-profiling-fr",
    ],
    parameters: [],
  },
  {
    id: "airline-passenger-data-protection-uae",
    name: "Airline Passenger Data Protection (UAE)",
    description:
      "Protects airline passenger PII including PNR/booking references, multi-national passport numbers, frequent flyer (Skywards) numbers, payment cards, IBANs, Emirates ID, UAE phone numbers, and email addresses. Designed for UAE-based airlines operating global routes.",
    purpose:
      "Protects airline passenger PII including PNR/booking references, multi-national passport numbers, frequent flyer (Skywards) numbers, payment cards, IBANs, Emirates ID, UAE phone numbers, and email addresses. Designed for UAE-based airlines operating global routes.",
    allowedTopics: [],
    restrictedTopics: [],
    defaultControls: [
      {
        risk: "builtin_content_filter",
        action: "reject",
        enabled: true,
      },
    ],
    safetyLevel: "balanced",
    outputDelivery: "window_buffered",
    source: "LiteLLM OSS · locally built in",
    version: "1.95.0",
    domain: "Data Protection",
    collections: [
      "TALI Aviation Safety",
      "TALI UAE Data & Culture",
      "OWASP Top 10 for LLM Applications 2025",
    ],
    tags: ["PII Protection", "Aviation", "UAE"],
    limitations: [
      "Keyword and pattern rules may not detect every semantic paraphrase.",
      "Adjacent integration and application security controls remain independently required.",
    ],
    controls: [
      "airline-pnr-skywards-pii",
      "airline-passport-multinational",
      "airline-payment-financial",
      "airline-contact-info-uae",
    ],
    parameters: [],
  },
  {
    id: "aviation-operations-security",
    name: "Aviation Operations Security",
    description:
      "Prevents AI from leaking flight operations data (flight numbers, crew schedules, gate assignments, aircraft tail numbers), generating content about aviation security vulnerabilities or bypass procedures, and producing unauthorized airline statements or fake incident reports.",
    purpose:
      "Prevents AI from leaking flight operations data (flight numbers, crew schedules, gate assignments, aircraft tail numbers), generating content about aviation security vulnerabilities or bypass procedures, and producing unauthorized airline statements or fake incident reports.",
    allowedTopics: [],
    restrictedTopics: [],
    defaultControls: [
      {
        risk: "builtin_content_filter",
        action: "reject",
        enabled: true,
      },
    ],
    safetyLevel: "balanced",
    outputDelivery: "window_buffered",
    source: "LiteLLM OSS · locally built in",
    version: "1.95.0",
    domain: "Prompt & Interaction Security",
    collections: [
      "TALI Aviation Safety",
      "OWASP Top 10 for LLM Applications 2025",
    ],
    tags: ["Aviation", "Security", "Brand Protection"],
    limitations: [
      "Keyword and pattern rules may not detect every semantic paraphrase.",
      "Adjacent integration and application security controls remain independently required.",
    ],
    controls: [
      "aviation-ops-data-protection",
      "aviation-safety-topic-filter",
      "airline-brand-protection-filter",
      "competitor-name-input-blocker",
      "competitor-name-output-blocker",
      "competitor-recommendation-input-filter",
      "competitor-recommendation-output-filter",
      "competitor-comparison-input-filter",
      "competitor-comparison-output-filter",
    ],
    parameters: [
      {
        name: "brand_name",
        label: "Your Airline / Brand Name",
        kind: "text",
        required: true,
        placeholder: "e.g. Acme Airlines",
        description: "",
      },
      {
        name: "competitors",
        label: "Competitors",
        kind: "textarea",
        required: true,
        placeholder: "One competitor per line",
        description:
          "The standalone service does not call a control-plane LLM. Paste the reviewed competitor set used by this policy.",
      },
    ],
  },
  {
    id: "airline-off-topic-restriction",
    name: "Airline Off-Topic Restriction",
    description:
      "Restricts an airline chatbot to airline-related topics only. Blocks off-topic questions about news, sports, coding, politics, entertainment, finance, recipes, homework, and general knowledge using keyword-based detection with no additional LLM calls.",
    purpose:
      "Restricts an airline chatbot to airline-related topics only. Blocks off-topic questions about news, sports, coding, politics, entertainment, finance, recipes, homework, and general knowledge using keyword-based detection with no additional LLM calls.",
    allowedTopics: [],
    restrictedTopics: [],
    defaultControls: [
      {
        risk: "builtin_content_filter",
        action: "reject",
        enabled: true,
      },
    ],
    safetyLevel: "balanced",
    outputDelivery: "window_buffered",
    source: "LiteLLM OSS · locally built in",
    version: "1.95.0",
    domain: "Prompt & Interaction Security",
    collections: ["TALI Aviation Safety"],
    tags: ["Aviation", "Topic Control"],
    limitations: [
      "Keyword and pattern rules may not detect every semantic paraphrase.",
      "Adjacent integration and application security controls remain independently required.",
    ],
    controls: ["airline-off-topic-filter"],
    parameters: [],
  },
  {
    id: "uae-regulatory-compliance",
    name: "UAE Regulatory Compliance",
    description:
      "Compliance with UAE Federal Decree-Law No. 45/2021 (Data Protection) and Federal Decree-Law No. 2/2015 (Anti-Discrimination). Protects Emirates ID numbers, UAE phone numbers, and ensures cultural sensitivity including royal family references and religious content policies.",
    purpose:
      "Compliance with UAE Federal Decree-Law No. 45/2021 (Data Protection) and Federal Decree-Law No. 2/2015 (Anti-Discrimination). Protects Emirates ID numbers, UAE phone numbers, and ensures cultural sensitivity including royal family references and religious content policies.",
    allowedTopics: [],
    restrictedTopics: [],
    defaultControls: [
      {
        risk: "builtin_content_filter",
        action: "reject",
        enabled: true,
      },
    ],
    safetyLevel: "balanced",
    outputDelivery: "window_buffered",
    source: "LiteLLM OSS · locally built in",
    version: "1.95.0",
    domain: "Data Protection",
    collections: [
      "TALI UAE Data & Culture",
      "OWASP Top 10 for LLM Applications 2025",
    ],
    tags: ["Regulatory", "UAE"],
    limitations: [
      "This template is a runtime control, not a legal compliance determination.",
      "Keyword and pattern rules may not detect every semantic paraphrase.",
      "Adjacent integration and application security controls remain independently required.",
    ],
    controls: [
      "uae-data-protection-pii",
      "uae-cultural-sensitivity-filter",
      "uae-anti-discrimination-filter",
    ],
    parameters: [],
  },
  {
    id: "competitor-mention-detection",
    name: "Competitor Mention Detection",
    description:
      "Automatically detects and blocks AI from recommending or promoting competitor brands. Uses LLM-powered discovery to identify your top competitors, then monitors both inputs and outputs for competitor mentions, referrals, and comparisons that could divert business.",
    purpose:
      "Automatically detects and blocks AI from recommending or promoting competitor brands. Uses LLM-powered discovery to identify your top competitors, then monitors both inputs and outputs for competitor mentions, referrals, and comparisons that could divert business.",
    allowedTopics: [],
    restrictedTopics: [],
    defaultControls: [
      {
        risk: "builtin_content_filter",
        action: "reject",
        enabled: true,
      },
    ],
    safetyLevel: "balanced",
    outputDelivery: "window_buffered",
    source: "LiteLLM OSS · locally built in",
    version: "1.95.0",
    domain: "Prompt & Interaction Security",
    collections: ["TALI Brand Protection"],
    tags: ["Brand Protection"],
    limitations: [
      "The reviewed competitor list must be supplied when the Policy is created.",
      "Keyword and pattern rules may not detect every semantic paraphrase.",
      "Adjacent integration and application security controls remain independently required.",
    ],
    controls: [
      "competitor-input-blocker",
      "competitor-output-blocker",
      "competitor-recommendation-input-filter",
      "competitor-recommendation-output-filter",
      "competitor-comparison-input-filter",
      "competitor-comparison-output-filter",
    ],
    parameters: [
      {
        name: "brand_name",
        label: "Your Brand Name",
        kind: "text",
        required: true,
        placeholder: "e.g. Acme Airlines",
        description: "",
      },
      {
        name: "competitors",
        label: "Competitors",
        kind: "textarea",
        required: true,
        placeholder: "One competitor per line",
        description:
          "The standalone service does not call a control-plane LLM. Paste the reviewed competitor set used by this policy.",
      },
    ],
  },
  {
    id: "topic-filtering",
    name: "Topic Filtering",
    description:
      "Restricts AI responses to only approved topics. Blocks off-topic requests like news, politics, entertainment, and general knowledge questions. Useful for chatbots that should stay focused on a specific domain.",
    purpose:
      "Restricts AI responses to only approved topics. Blocks off-topic requests like news, politics, entertainment, and general knowledge questions. Useful for chatbots that should stay focused on a specific domain.",
    allowedTopics: [],
    restrictedTopics: [],
    defaultControls: [
      {
        risk: "builtin_content_filter",
        action: "reject",
        enabled: true,
      },
    ],
    safetyLevel: "balanced",
    outputDelivery: "window_buffered",
    source: "LiteLLM OSS · locally built in",
    version: "1.95.0",
    domain: "Prompt & Interaction Security",
    collections: ["TALI Runtime Baseline"],
    tags: ["Topic Control"],
    limitations: [
      "Keyword and pattern rules may not detect every semantic paraphrase.",
      "Adjacent integration and application security controls remain independently required.",
    ],
    controls: ["topic-restriction-filter"],
    parameters: [],
  },
  {
    id: "prompt-injection-protection",
    name: "Prompt Injection Protection",
    description:
      "Detects and blocks prompt injection attacks, SQL injection attempts, code injection, and jailbreak attempts. Protects against adversarial inputs that try to override system instructions or extract sensitive information.",
    purpose:
      "Detects and blocks prompt injection attacks, SQL injection attempts, code injection, and jailbreak attempts. Protects against adversarial inputs that try to override system instructions or extract sensitive information.",
    allowedTopics: [],
    restrictedTopics: [],
    defaultControls: [
      {
        risk: "builtin_content_filter",
        action: "reject",
        enabled: true,
      },
    ],
    safetyLevel: "balanced",
    outputDelivery: "window_buffered",
    source: "LiteLLM OSS · locally built in",
    version: "1.95.0",
    domain: "Prompt & Interaction Security",
    collections: [
      "TALI Runtime Baseline",
      "OWASP Top 10 for LLM Applications 2025",
    ],
    tags: ["Security", "Injection Protection"],
    limitations: [
      "Pattern detection is a first-pass defense and should be paired with semantic jailbreak detection.",
      "Indirect injection requires retrieved content to be supplied for inspection.",
    ],
    controls: [
      "prompt-injection-blocker",
      "sql-injection-blocker",
      "code-injection-blocker",
    ],
    parameters: [],
  },
  {
    id: "pdpa-singapore",
    name: "Singapore PDPA — Personal Data Protection",
    description:
      "Singapore Personal Data Protection Act (PDPA) compliance. Covers 5 obligation areas: personal identifier collection (s.13 Consent), sensitive data profiling (Advisory Guidelines), Do Not Call Registry violations (Part IX), overseas data transfers (s.26), and automated profiling without human oversight (Model AI Governance Framework). Also includes regex-based PII detection for NRIC/FIN, Singapore phone numbers, postal codes, passports, UEN, and bank account numbers. Zero-cost keyword-based detection.",
    purpose:
      "Singapore Personal Data Protection Act (PDPA) compliance. Covers 5 obligation areas: personal identifier collection (s.13 Consent), sensitive data profiling (Advisory Guidelines), Do Not Call Registry violations (Part IX), overseas data transfers (s.26), and automated profiling without human oversight (Model AI Governance Framework). Also includes regex-based PII detection for NRIC/FIN, Singapore phone numbers, postal codes, passports, UEN, and bank account numbers. Zero-cost keyword-based detection.",
    allowedTopics: [],
    restrictedTopics: [],
    defaultControls: [
      {
        risk: "builtin_content_filter",
        action: "reject",
        enabled: true,
      },
    ],
    safetyLevel: "balanced",
    outputDelivery: "window_buffered",
    source: "LiteLLM OSS · locally built in",
    version: "1.95.0",
    domain: "Data Protection",
    collections: [
      "TALI Singapore Data & AI Compliance",
      "OWASP Top 10 for LLM Applications 2025",
    ],
    tags: ["PII Protection", "Regulatory", "Singapore"],
    limitations: [
      "This template covers selected PDPA indicators and is not a complete compliance program.",
      "Keyword and pattern rules may not detect every semantic paraphrase.",
      "Adjacent integration and application security controls remain independently required.",
    ],
    controls: [
      "sg-pdpa-pii-identifiers",
      "sg-pdpa-contact-information",
      "sg-pdpa-financial-data",
      "sg-pdpa-business-identifiers",
      "sg-pdpa-personal-identifiers",
      "sg-pdpa-sensitive-data",
      "sg-pdpa-do-not-call",
      "sg-pdpa-data-transfer",
      "sg-pdpa-profiling-automated-decisions",
    ],
    parameters: [],
  },
  {
    id: "mas-ai-risk-management",
    name: "Singapore MAS — AI Risk Management for Financial Institutions",
    description:
      "Monetary Authority of Singapore (MAS) AI Risk Management for Financial Institutions alignment. Covers 5 enforceable obligation areas: fairness & bias in financial decisions, transparency & explainability of AI models, human oversight for consequential actions, data governance for financial customer data, and model security against adversarial attacks. Based on Guidelines on Artificial Intelligence Risk Management (MAS), and aligned with the 2018 FEAT Principles and Project MindForge. Zero-cost keyword-based detection.",
    purpose:
      "Monetary Authority of Singapore (MAS) AI Risk Management for Financial Institutions alignment. Covers 5 enforceable obligation areas: fairness & bias in financial decisions, transparency & explainability of AI models, human oversight for consequential actions, data governance for financial customer data, and model security against adversarial attacks. Based on Guidelines on Artificial Intelligence Risk Management (MAS), and aligned with the 2018 FEAT Principles and Project MindForge. Zero-cost keyword-based detection.",
    allowedTopics: [],
    restrictedTopics: [],
    defaultControls: [
      {
        risk: "builtin_content_filter",
        action: "reject",
        enabled: true,
      },
    ],
    safetyLevel: "balanced",
    outputDelivery: "window_buffered",
    source: "LiteLLM OSS · locally built in",
    version: "1.95.0",
    domain: "Platform & Consumption Security",
    collections: [
      "TALI Singapore Data & AI Compliance",
      "OWASP Top 10 for LLM Applications 2025",
    ],
    tags: ["Financial Services", "Regulatory", "Singapore"],
    limitations: [
      "Runtime checks do not validate training data, model provenance, or human governance processes.",
      "Keyword and pattern rules may not detect every semantic paraphrase.",
      "Adjacent integration and application security controls remain independently required.",
    ],
    controls: [
      "sg-mas-fairness-bias",
      "sg-mas-transparency-explainability",
      "sg-mas-human-oversight",
      "sg-mas-data-governance",
      "sg-mas-model-security",
    ],
    parameters: [],
  },
  {
    id: "claims-agent-safety",
    name: "Claims Agent Chatbot Safety",
    description:
      "Comprehensive safety guardrails for healthcare claims agent chatbots. Blocks fraud coaching (exaggeration, document forgery), PHI disclosure without authorization, prior-auth gaming (code manipulation, medical necessity misrepresentation), system override injection (prompt injection, role impersonation), and medical advice in claims context (diagnosis, treatment recommendations). Evaluated on 243 test cases with 100% precision and 100% recall across all 5 categories.",
    purpose:
      "Comprehensive safety guardrails for healthcare claims agent chatbots. Blocks fraud coaching (exaggeration, document forgery), PHI disclosure without authorization, prior-auth gaming (code manipulation, medical necessity misrepresentation), system override injection (prompt injection, role impersonation), and medical advice in claims context (diagnosis, treatment recommendations). Evaluated on 243 test cases with 100% precision and 100% recall across all 5 categories.",
    allowedTopics: [],
    restrictedTopics: [],
    defaultControls: [
      {
        risk: "builtin_content_filter",
        action: "reject",
        enabled: true,
      },
    ],
    safetyLevel: "balanced",
    outputDelivery: "window_buffered",
    source: "LiteLLM OSS · locally built in",
    version: "1.95.0",
    domain: "Content Safety",
    collections: [
      "TALI Healthcare Claims Safety",
      "OWASP Top 10 for LLM Applications 2025",
    ],
    tags: ["Healthcare", "Claims", "Content Safety"],
    limitations: [
      "This template is scoped to claims conversations and is not clinical decision support.",
      "Keyword and pattern rules may not detect every semantic paraphrase.",
      "Adjacent integration and application security controls remain independently required.",
    ],
    controls: [
      "claims-fraud-coaching-filter",
      "claims-phi-disclosure-filter",
      "claims-prior-auth-gaming-filter",
      "claims-system-override-filter",
      "claims-medical-advice-filter",
    ],
    parameters: [],
  },
] satisfies GuardrailTemplate[];
