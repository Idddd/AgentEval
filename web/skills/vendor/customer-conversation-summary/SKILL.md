---
name: customer-conversation-summary
description: Summarize customer conversations into accurate, privacy-aware support handoffs. Use for chat, email, call transcripts, escalations, shift changes, and case updates that need the customer's goal, symptoms, actions attempted, commitments, sentiment, and next owner.
---

# Customer Conversation Summary

## Workflow

1. Identify the customer's requested outcome and the current blocker.
2. Extract confirmed facts, environment details, timestamps, error messages, reproduction steps, actions attempted, and their results.
3. Record commitments exactly, including who promised what and by when.
4. Separate customer statements, support observations, and unresolved hypotheses.
5. Remove greetings, repetition, internal chatter, and personal data that the receiving team does not need.
6. State the next action, owner, urgency, and required customer follow-up.

## Output

Return `Customer goal`, `Current state`, `Evidence`, `Actions attempted`, `Commitments`, `Open questions`, and `Next owner`.

## Guardrails

- Do not invent product behavior, account state, root cause, refunds, credits, or commitments.
- Preserve the customer's meaning without character judgments.
- Redact payment data, credentials, tokens, and unrelated personal information.
- Flag legal, safety, abuse, or security matters for the defined escalation path.

## Quality check

Ensure a receiving support owner can continue the case without rereading the whole conversation, while still being able to distinguish evidence from interpretation.
