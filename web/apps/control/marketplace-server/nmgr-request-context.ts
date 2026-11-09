import { AsyncLocalStorage } from "node:async_hooks";

export type RequestContext = { requestId: string; operationId: string; route: string; resourceId?: string; commandId?: string; jobStatus?: string; operationReference?: string };
export const nmgrRequestContext = new AsyncLocalStorage<RequestContext>();
export function addRequestMetadata(value: Partial<Pick<RequestContext, "resourceId" | "commandId" | "jobStatus" | "operationReference">>) {
  const context = nmgrRequestContext.getStore();
  if (context) Object.assign(context, value);
}
