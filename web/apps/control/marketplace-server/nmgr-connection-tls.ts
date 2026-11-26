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

function apiBase(value: string | undefined, normalize = (url: string) => new URL(url).href) {
  if (!value) return undefined;
  try { return normalize(value).replace(/\/+$/, ""); }
  catch { return undefined; } // Provider configuration validation reports malformed URLs.
}

export function connectionTransport(env: NodeJS.ProcessEnv, fetcher: typeof fetch) {
  const demo = env.MARKETPLACE_V3_DEMO === "true";
  const skipNemo = demo && env.MARKETPLACE_NEMO_TLS === "skip";
  const skipF5 = demo && env.MARKETPLACE_F5_TLS === "skip";
  const skipEvaluate = demo && env.MARKETPLACE_EVALUATION_TLS === "skip";
  const manual = env.MARKETPLACE_EVALUATION_MANUAL_TLS === "true";
  if (!env.MARKETPLACE_CONNECTION_CA_MODE && !manual && !skipNemo && !skipF5 && !skipEvaluate)
    return { fetcher, close: async () => {} };

  const verified = {
    rejectUnauthorized: true,
    ...(env.MARKETPLACE_CONNECTION_CA_PEM ? { ca: [...rootCertificates, env.MARKETPLACE_CONNECTION_CA_PEM] } : {}),
  };
  const agent = env.MARKETPLACE_CONNECTION_CA_MODE ? new Agent({ connect: verified }) : undefined;
  const insecure = skipNemo || skipF5 || skipEvaluate ? new Agent({ connect: { rejectUnauthorized: false } }) : undefined;
  const manualAgent = manual ? new Agent({ connect: { ...verified, rejectUnauthorized: !skipEvaluate, lookup: evaluationLookup } }) : undefined;
  const bases = [
    { base: apiBase(env.MARKETPLACE_EVALUATION_URL, evaluationApiBase), skip: skipEvaluate, manualAgent },
    { base: apiBase(env.F5_API_URL), skip: skipF5 },
    { base: apiBase(env.GUARD_API_URL), skip: skipNemo },
  ];
  const trustedFetch: typeof fetch = (input, init) => {
    const url = new URL(input instanceof Request ? input.url : String(input));
    const path = url.origin + url.pathname;
    const provider = bases.find(({ base }) => base && (path === base || path.startsWith(base + "/")));
    const dispatcher = provider?.manualAgent ?? (provider?.skip ? insecure : agent);
    if (!dispatcher) return fetcher(input, init);
    return fetcher(input, { ...init, ...(provider?.skip || provider?.manualAgent ? { redirect: "manual" } : {}), dispatcher } as RequestInit);
  };
  return { fetcher: trustedFetch, close: async () => { await Promise.all([agent?.destroy(), insecure?.destroy(), manualAgent?.destroy()]); } };
}
