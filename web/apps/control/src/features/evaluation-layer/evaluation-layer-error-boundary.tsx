import { Component, type ErrorInfo, type ReactNode } from "react";
import { TriangleAlert } from "lucide-react";
import { EmptyState } from "@/components/shared/empty-state";
import { Button } from "@/components/ui/button";
import {
  useEvaluationLayerStore,
} from "./mock-provider";
import type { EvaluationLayerStore } from "./mock-store";

class EvaluationLayerErrorBoundaryInner extends Component<
  { children: ReactNode; store: EvaluationLayerStore },
  { error: Error | null }
> {
  state: { error: Error | null } = { error: null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("Evaluation demo UI failed", error, info);
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <EmptyState
        icon={TriangleAlert}
        title="Evaluation demo could not be displayed"
        description={this.state.error.message}
        action={
          <Button
            variant="outline"
            onClick={() => {
              this.props.store.resetDemo();
              this.setState({ error: null });
            }}
          >
            Reset Evaluation demo
          </Button>
        }
      />
    );
  }
}

export function EvaluationLayerErrorBoundary({
  children,
}: {
  children: ReactNode;
}) {
  const store = useEvaluationLayerStore();
  return (
    <EvaluationLayerErrorBoundaryInner store={store}>
      {children}
    </EvaluationLayerErrorBoundaryInner>
  );
}
