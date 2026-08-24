import { FlaskConical } from "lucide-react";
import { Badge } from "@/components/ui/badge";

export function PreviewBadge() {
  return (
    <Badge variant="outline" className="gap-1 text-muted-foreground">
      <FlaskConical className="size-3" />
      UI preview
    </Badge>
  );
}
