# Catalog Next-Step Guidance Design

## Goal

Make the Catalog workflow drawer tell users what to do next and provide a direct, prominent route to that step.

## Interaction

The Workflow tab adds a prominent **Next step** callout below the lifecycle grid. It contains a short status-aware explanation and one primary action. The four lifecycle nodes also become keyboard-accessible buttons that open their matching drawer tabs.

The recommended node receives stronger border, background, and arrow treatment. Completed and waiting nodes retain their existing status tone so the overall lifecycle remains readable.

## State Rules

| State | Next-step label | Destination |
| --- | --- | --- |
| Dataset missing or unpublished | Prepare and publish Test Cases | Dataset |
| Dataset published, no run | Start evaluation | Evaluation |
| Evaluation queued or running | View evaluation progress | Evaluation |
| Evaluation failed | Review failure and retry | Evaluation |
| Completed run with report | Review results | Result |
| Result stale after Target or Dataset change | Run evaluation again | Evaluation |

Revision, Dataset, Evaluation, and Result nodes always open their corresponding tabs. If a destination has no content yet, the existing empty state remains visible.

## Architecture

The workspace view model exposes a small next-step descriptor containing the destination, label, and supporting message. The Catalog page consumes that descriptor for the callout, node emphasis, and tab switching. This keeps state decisions out of the JSX and makes the lifecycle matrix independently testable.

## Accessibility

Clickable lifecycle nodes use native buttons, visible focus styles, and descriptive labels. The primary call-to-action remains usable by keyboard and does not rely on color alone.

## Verification

Use focused view-model and Catalog component tests to cover the lifecycle destinations and click behavior, followed by the Control app TypeScript check. Per request, do not run the full repository test suite.
