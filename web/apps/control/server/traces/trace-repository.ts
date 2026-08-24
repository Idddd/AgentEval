import type { TraceDetail, TraceSummary } from "@tasklattice/contracts";

export interface TraceRepository {
  list(): Promise<TraceSummary[]>;
  getById(traceId: string): Promise<TraceDetail | undefined>;
}
