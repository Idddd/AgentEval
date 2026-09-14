# AI Marketplace server boundary

Contains runtime branding, connection configuration, an allowlisted Guard proxy
and a lightweight health check, with no database startup jobs. Nitro serves the TanStack application. The existing `server/` control-plane code is retained
for reference, but is not loaded by the Marketplace application.

Marketplace data access for active pages is defined in
`src/features/business-demo/guard-api.ts` and `provider.tsx`. The old
`src/features/marketplace/api.ts` facade proposal is not wired to these pages.

## Guard connection

The standalone server also provides runtime `/api/marketplace-config` and a
per-user authenticated, allowlisted `/api/guard/*` proxy. See
[`docs/guard-openapi-connection.md`](../../../../docs/guard-openapi-connection.md).
