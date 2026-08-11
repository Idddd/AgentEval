import type { ReactNode } from "react";

export function FormSection({
  children,
  description,
  number,
  title,
}: {
  children: ReactNode;
  description: string;
  number: number;
  title: string;
}) {
  return (
    <section className="grid gap-4 border-b pb-6 last:border-b-0 last:pb-0 sm:grid-cols-[2.5rem_minmax(0,1fr)]">
      <span className="grid size-8 place-items-center rounded-full bg-primary/10 text-sm font-semibold text-primary">{number}</span>
      <div>
        <h2 className="text-base font-medium">{title}</h2>
        <p className="mt-1 text-sm text-muted-foreground">{description}</p>
        <div className="mt-4 space-y-4">{children}</div>
      </div>
    </section>
  );
}
