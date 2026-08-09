---
name: skill-sql-query
description: Translate reporting questions into governed, read-only SQL with explicit assumptions, row limits, and result interpretation. Use for approved relational databases when users need aggregates, filtered records, joins, trends, or structured data for another workflow.
---

# SQL Query

## Workflow

1. Resolve the business metric, grain, time zone, date range, filters, and expected output before writing SQL.
2. Inspect the approved schema, relationships, semantic definitions, and data-access policy.
3. Generate a single read-only query using explicit columns, qualified names, parameterized values, deterministic ordering, and a bounded result size.
4. Review join cardinality, null behavior, time boundaries, duplicate risk, aggregation grain, and units.
5. Explain the query and request review before execution when results affect decisions.
6. Validate returned rows against the requested grain and report data-quality limitations.

## Guardrails

- Permit only read-only access. Reject DDL, DML, transaction control, stored procedure calls, file access, and privilege changes.
- Use parameterized queries; never concatenate untrusted values.
- Apply least privilege and query only approved schemas and columns.
- Avoid `SELECT *`, unbounded scans, and disclosure of unnecessary personal data.

## Output

Return `Assumptions`, `SQL`, `Parameters`, `Validation`, and `Result interpretation`.

## Source basis

Follow the [OWASP SQL Injection Prevention Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/SQL_Injection_Prevention_Cheat_Sheet.html).
