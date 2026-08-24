import { eventHandler, getRequestURL, proxyRequest } from "h3";

/**
 * Reverse proxy the Evaluations API to the AgentEval Python backend.
 * The Evaluations module is frontend-only in the vendored console; the real
 * implementation lives in AgentEval `src/api/` (FastAPI). Override the target
 * with EVAL_API_URL when the Python service runs elsewhere.
 */
export default eventHandler((event) => {
  const base = process.env.EVAL_API_URL ?? "http://127.0.0.1:8000";
  const path = event.context.params?.path ?? "";
  const url = new URL(getRequestURL(event));
  const target = `${base}/api/v1/evaluations/${path}${url.search}`;
  return proxyRequest(event, target);
});
