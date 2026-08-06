import type { ReactNode } from "react";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

export type CreateInstanceStep = {
  description: string;
  label: string;
};

export function CreateInstanceLayout({
  children,
  currentStep,
  onStepChange,
  progressLabel = "Create Instance progress",
  steps,
}: {
  children: ReactNode;
  currentStep: number;
  onStepChange: (step: number) => void;
  progressLabel?: string;
  steps: readonly CreateInstanceStep[];
}) {
  return (
    <div className="space-y-6">
      <section aria-label={progressLabel}>
        <ol className="grid grid-cols-3 border-b">
          {steps.map((step, index) => {
            const active = index === currentStep;
            const complete = index < currentStep;
            return (
              <li key={step.label} className="relative bg-background">
                <button
                  type="button"
                  disabled={index > currentStep}
                  onClick={() => onStepChange(index)}
                  aria-current={active ? "step" : undefined}
                  className={cn(
                    "flex min-h-20 w-full items-center gap-3 border-b-2 border-transparent px-2 py-3 text-left text-sm transition-colors focus-visible:border-primary focus-visible:bg-muted/40 focus-visible:outline-none sm:px-4",
                    active && "border-primary",
                    complete && "hover:bg-muted",
                    index > currentStep && "cursor-not-allowed text-muted-foreground/55",
                  )}
                >
                  <span
                    className={cn(
                      "grid size-7 shrink-0 place-items-center rounded-full border text-xs",
                      complete && "border-primary bg-primary text-primary-foreground",
                      active && "border-primary bg-primary text-primary-foreground",
                    )}
                  >
                    {complete ? <Check className="size-3.5" /> : index + 1}
                  </span>
                  <span className="min-w-0">
                    <strong className="block font-medium">{step.label}</strong>
                    <span className="mt-1 hidden text-xs text-muted-foreground md:block">{step.description}</span>
                  </span>
                </button>
              </li>
            );
          })}
        </ol>
      </section>

      {children}
    </div>
  );
}
