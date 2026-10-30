import { Agent } from "undici";
import { rootCertificates } from "node:tls";

// Per-operation trust override: never mutate process-wide TLS settings or disable verification.
export function connectionTransport(
  env: NodeJS.ProcessEnv,
  fetcher: typeof fetch,
) {
  if (!env.MARKETPLACE_CONNECTION_CA_MODE)
    return { fetcher, close: async () => {} };
  const agent = new Agent({
    connect: {
      rejectUnauthorized: true,
      ca: [
        ...rootCertificates,
        ...(env.MARKETPLACE_CONNECTION_CA_PEM
          ? [env.MARKETPLACE_CONNECTION_CA_PEM]
          : []),
      ],
    },
  });
  const trustedFetch: typeof fetch = (input, init) =>
    fetcher(input, { ...init, dispatcher: agent } as RequestInit);
  // The operation has finished; abort unread error bodies instead of waiting for them.
  return { fetcher: trustedFetch, close: () => agent.destroy() };
}
