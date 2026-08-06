import { useState } from "react";
import { Check, Copy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

export function InstanceInstructionsDialog({ managedBy, onOpenChange, open, prompt }: {
  managedBy: string;
  onOpenChange: (open: boolean) => void;
  open: boolean;
  prompt?: string;
}) {
  const [copyState, setCopyState] = useState<"idle" | "copied" | "failed">("idle");
  const copy = async () => {
    if (!prompt) return;
    try {
      await navigator.clipboard.writeText(prompt);
      setCopyState("copied");
    } catch {
      setCopyState("failed");
    }
    window.setTimeout(() => setCopyState("idle"), 1600);
  };

  return (
    <Dialog open={open} onOpenChange={(next) => { onOpenChange(next); if (!next) setCopyState("idle"); }}>
      <DialogContent className="w-[min(calc(100%-2rem),42rem)]">
        <DialogHeader>
          <DialogTitle>{managedBy} instructions</DialogTitle>
          <DialogDescription>Read-only system instructions captured when this Instance was created.</DialogDescription>
        </DialogHeader>
        <div className="min-h-0 overflow-y-auto p-6">
          {prompt ? <pre className="whitespace-pre-wrap break-words border bg-muted/30 p-4 font-mono text-xs leading-6">{prompt}</pre> : <p className="text-sm text-muted-foreground">Instruction content is not available from the current API.</p>}
        </div>
        <DialogFooter className="sm:justify-between">
          <DialogClose asChild><Button type="button" variant="outline">Close</Button></DialogClose>
          <Button type="button" variant="secondary" disabled={!prompt} onClick={() => void copy()}>
            {copyState === "copied" ? <Check /> : <Copy />}{copyState === "copied" ? "Copied" : copyState === "failed" ? "Copy failed" : "Copy instructions"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
