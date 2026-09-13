# AI Marketplace server boundary

Intentionally contains no application handlers or startup jobs. Nitro serves the
TanStack application only. The existing `server/` control-plane code is retained
for reference, but is not loaded by the Marketplace application.

Marketplace data access is defined in `src/features/marketplace/api.ts`. The
default adapter uses local preview data. A separately implemented Marketplace
backend can be configured with `VITE_MARKETPLACE_API_BASE_URL`.

See `docs/ai-marketplace-api.md` in the repository root for the future contract.
