import { BriefcaseBusiness, Eye, Headphones, Settings2, Sparkles, Telescope, Users, type LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { Specialization, SpecializationId } from "./specializations";

const icons: Record<Specialization["icon"], LucideIcon> = {
  briefcase: BriefcaseBusiness,
  headphones: Headphones,
  settings: Settings2,
  sparkles: Sparkles,
  telescope: Telescope,
  users: Users,
};

export function SpecializationIcon({ specialization, className = "size-4" }: { specialization: Specialization; className?: string }) {
  const Icon = icons[specialization.icon];
  return <Icon className={className} />;
}

export function SpecializationSelector({ items, onChange, value }: { items: readonly Specialization[]; onChange: (id: SpecializationId) => void; value: Specialization }) {
  return (
    <div className="space-y-2">
      <label htmlFor="specialization-select" className="text-sm font-medium">Choose a specialization</label>
      <Select value={value.id} onValueChange={(id) => onChange(id as SpecializationId)}>
        <SelectTrigger id="specialization-select" className="min-h-12 h-auto">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {items.map((item) => (
            <SelectItem key={item.id} value={item.id} className="py-2.5">
              <span className="flex items-center gap-2"><SpecializationIcon specialization={item} /><span>{item.name}</span></span>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <p className="text-xs leading-5 text-muted-foreground">{value.description}</p>
    </div>
  );
}

export function SpecializationSummary({ knowledgeCount, mcpCount, onViewPrompt, skillCount, specialization }: {
  knowledgeCount: number;
  mcpCount: number;
  onViewPrompt: () => void;
  skillCount: number;
  specialization: Specialization;
}) {
  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-sm font-semibold">{specialization.name} specialization summary</h3>
        <p className="mt-1 text-xs leading-5 text-muted-foreground">{specialization.description}</p>
      </div>
      <div className="flex flex-wrap gap-2 text-xs">
        <span className="rounded-full bg-muted px-3 py-1">{skillCount} {skillCount === 1 ? "Skill" : "Skills"}</span>
        <span className="rounded-full bg-muted px-3 py-1">{mcpCount} MCP {mcpCount === 1 ? "Server" : "Servers"}</span>
        <span className="rounded-full bg-muted px-3 py-1">{knowledgeCount} Knowledge {knowledgeCount === 1 ? "Base" : "Bases"}</span>
      </div>
      <div className="flex min-h-14 items-center justify-between gap-4 rounded-md border px-4 py-3">
        <div>
          <strong className="block text-xs">System instructions</strong>
          <span className="mt-0.5 block text-xs text-muted-foreground">{specialization.id === "general-purpose" ? "Uses the default Agent instructions" : `Managed by ${specialization.name} specialization`}</span>
        </div>
        <Button type="button" variant="ghost" size="sm" onClick={onViewPrompt}><Eye /> View prompt</Button>
      </div>
    </div>
  );
}
