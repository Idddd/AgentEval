---
name: citation-builder
description: Convert research evidence into normalized, traceable citations and identify unsupported claims. Use when drafting research briefs, reports, comparisons, or multi-agent outputs that need source URLs, document references, publication dates, quoted context, and claim-to-source mapping.
---

# Citation Builder

## Workflow

1. Split the draft into independently verifiable claims.
2. Match each claim to the strongest available primary source. Use secondary sources only when primary material is unavailable or additional interpretation is necessary.
3. Capture title, publisher or author, publication date, access date, canonical URL or document identifier, and the exact supporting location.
4. Verify that the source supports the claim's scope, date, population, and certainty.
5. Mark claims as `supported`, `partially supported`, `conflicting`, or `unsupported`.
6. Produce consistent citations in the requested style without fabricating missing metadata.

## Output

Return:

- An edited claim-to-citation list.
- A bibliography.
- Unsupported or overbroad claims.
- Source-quality and date-sensitivity notes.

## Guardrails

- Never cite a search-results page when the underlying source is available.
- Do not invent titles, authors, dates, page numbers, URLs, or quotations.
- Keep quotations short and preserve their original meaning.
- Distinguish source statements from your inference.

## Source basis

Follow provenance and citation guidance from the [W3C Data on the Web Best Practices](https://www.w3.org/TR/dwbp/).
