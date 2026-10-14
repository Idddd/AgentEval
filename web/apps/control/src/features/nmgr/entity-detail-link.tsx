import { ArrowRight } from "lucide-react";
import type { Entity } from "./model";
import type { View } from "./workbench";

export function EntityDetailLink({ item, view, onOpen, arrow = false }: {
  item: Pick<Entity, "id" | "name" | "kind">;
  view: View;
  onOpen: () => void;
  arrow?: boolean;
}) {
  return <a
    className={arrow ? "nm-entity-open-link" : "nm-entity-name-link"}
    href={`#${item.kind}/${view}/${encodeURIComponent(item.id)}`}
    aria-label={arrow ? `View ${item.name}` : undefined}
    title={arrow ? "View details" : undefined}
    onClick={(event) => {
      if (event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
      event.preventDefault();
      onOpen();
    }}
  >{arrow ? <ArrowRight size={17} aria-hidden="true" /> : item.name}</a>;
}
