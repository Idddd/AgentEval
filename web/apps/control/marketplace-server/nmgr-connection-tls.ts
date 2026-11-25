import { lookup } from "node:dns";
import { BlockList, type LookupFunction } from "node:net";
import { Agent } from "undici";
import { rootCertificates } from "node:tls";
import { evaluationApiBase } from "./evaluation-connection";

// Manual setup supports private intranet services. Validate the addresses used
// by the actual socket, including on reconnect, before accepting DNS results.
const excluded = new BlockList();
for (const [network, bits] of [["0.0.0.0", 8], ["127.0.0.0", 8], ["169.254.0.0", 16], ["224.0.0.0", 3]] as const)
  excluded.addSubnet(network, bits, "ipv4");
for (const [network, bits] of [["::", 96], ["fe80::", 10], ["ff00::", 8], ["64:ff9b::", 96], ["2002::", 16]] as const)
  excluded.addSubnet(network, bits, "ipv6");
const evaluationLookup: LookupFunction = (hostname, options, callback) => {
  lookup(hostname, { ...options, all: true }, (error, addresses) => {
    if (error) return callback(error, "", 0);
    if (!addresses.length || addresses.some(a => excluded.check(a.address, a.family === 6 ? "ipv6" : "ipv4")))
      return callback(new Error("Evaluate hostname resolved to a reserved destination"), "", 0);
    const first = addresses[0]!;
    return options.all ? callback(null, addresses) : callback(null, first.address, first.family);
  });
};

// Per-operation TLS policy. The demo bypass is scoped to the configured NeMo API;
// never change process-wide TLS, F5, database, or Mock behavior.
export function connectionTransport(
  env: NodeJS.ProcessEnv,
  fetcher: typeof fetch,
) {
  const skip = env.MARKETPLACE_V3_DEMO === "true" && env.MARKETPLACE_NEMO_TLS === "skip";
  const manual = env.MARKETPLACE_EVALUATION_MANUAL_TLS === "true";
  if (!env.MARKETPLACE_CONNECTION_CA_MODE && !manual && !skip)
    return { fetcher, close: async () => {} };
  const verified = {
    rejectUnauthorized: true,
    ...(env.MARKETPLACE_CONNECTION_CA_PEM ? { ca: [...rootCertificates, env.MARKETPLACE_CONNECTION_CA_PEM] } : {}),
  };
  const agent = new Agent({ connect: verified });
  const manualAgent = manual ? new Agent({ connect: { ...verified, lookup: evaluationLookup } }) : undefined;
  const insecure = skip ? new Agent({ connect: { rejectUnauthorized: false } }) : undefined;
  const trustedFetch: typeof fetch = (input, init) => {
    const target = new URL(input instanceof Request ? input.url : String(input));
    let isNemo = false;
    try {
      const base = new URL(env.GUARD_API_URL!);
      isNemo = target.origin === base.origin && target.pathname.startsWith(base.pathname.replace(/\/+$/, "") + "/");
    } catch { /* Configuration validation reports malformed URLs. */ }
    try {
      const f5 = new URL(env.F5_API_URL!);
      if (target.origin === f5.origin && target.pathname.startsWith(f5.pathname.replace(/\/+$/, "") + "/")) isNemo = false;
    } catch { /* F5 is optional; never apply its configuration to a NeMo request. */ }
    try {
      if (target.href.startsWith(evaluationApiBase(env.MARKETPLACE_EVALUATION_URL!) + "/")) {
        if (manualAgent) return fetcher(input, { ...init, dispatcher: manualAgent } as RequestInit);
        isNemo = false;
      }
    } catch { /* Evaluate is optional; it never uses the NeMo TLS bypass. */ }
    if (!isNemo && !env.MARKETPLACE_CONNECTION_CA_MODE) return fetcher(input, init);
    return fetcher(input, { ...init, ...(isNemo && insecure ? { redirect: "manual" } : {}), dispatcher: isNemo && insecure ? insecure : agent } as RequestInit);
  };
  // The operation has finished; abort unread error bodies instead of waiting for them.
  return { fetcher: trustedFetch, close: async () => { await Promise.all([agent.destroy(), insecure?.destroy(), manualAgent?.destroy()]); } };
}
