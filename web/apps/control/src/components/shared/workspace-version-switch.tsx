import type { WorkspaceVersion } from "@/lib/workspace-version";

export function WorkspaceVersionSwitch({ version }: { version: WorkspaceVersion }) {
  return (
    <nav aria-label="Interface version" className="inline-flex shrink-0 gap-1 rounded-md border bg-background p-1 text-xs">
      {(["v1", "v2"] as const).map((value) => (
        <a
          key={value}
          href={`/${value}/`}
          aria-current={version === value ? "page" : undefined}
          className={`rounded px-3 py-1.5 font-medium transition-colors ${version === value ? "bg-primary text-primary-foreground" : "hover:bg-muted"}`}
        >
          {value.toUpperCase()}
        </a>
      ))}
    </nav>
  );
}
