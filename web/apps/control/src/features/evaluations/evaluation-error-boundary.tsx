import { Component, type ErrorInfo, type ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { TriangleAlert } from "lucide-react";
import { EmptyState } from "@/components/shared/empty-state";
import { Button } from "@/components/ui/button";
import { useCurrentProjectId } from "@/hooks/use-project";

class EvaluationErrorBoundaryInner extends Component<
  { children: ReactNode; projectId: string },
  { error?: Error }
> {
  state: { error?: Error } = {};

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("Evaluations UI failed", error, info);
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <EmptyState
        icon={TriangleAlert}
        title="Evaluations could not be displayed"
        description={this.state.error.message}
        action={
          <Button asChild variant="outline">
            <Link
              to="/$projectId/evaluations"
              params={{ projectId: this.props.projectId }}
            >
              Back to Evaluations
            </Link>
          </Button>
        }
      />
    );
  }
}

export function EvaluationErrorBoundary({ children }: { children: ReactNode }) {
  const projectId = useCurrentProjectId();
  return (
    <EvaluationErrorBoundaryInner projectId={projectId}>
      {children}
    </EvaluationErrorBoundaryInner>
  );
}
