import { Component, type ErrorInfo, type ReactNode } from "react";
import { RotateCcw, ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";

export class GuardGovernanceErrorBoundary extends Component<
  { children: ReactNode },
  { error: Error | null; recoveryKey: number }
> {
  state = { error: null as Error | null, recoveryKey: 0 };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("Guard Governance render failure", error, info);
  }

  private recover = () => {
    this.setState((state) => ({
      error: null,
      recoveryKey: state.recoveryKey + 1,
    }));
  };

  render() {
    if (this.state.error) {
      return (
        <section className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-6">
          <div className="flex items-start gap-3">
            <ShieldAlert className="mt-0.5 size-5 text-amber-700" />
            <div>
              <h1 className="text-lg font-semibold">Guard Governance unavailable</h1>
              <p className="mt-1 text-sm text-muted-foreground">
                The local governance workspace could not be rendered. Other
                AgentEval features are unaffected.
              </p>
              <Button className="mt-4" variant="outline" onClick={this.recover}>
                <RotateCcw />
                Reload governance fixtures
              </Button>
            </div>
          </div>
        </section>
      );
    }
    return <div key={this.state.recoveryKey}>{this.props.children}</div>;
  }
}
