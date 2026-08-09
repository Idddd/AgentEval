import { useEffect, useState } from "react";
import { AlertTriangle, Boxes, LoaderCircle, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function DeleteModelRoutingDialog({
  consumers,
  deleting,
  error,
  onConfirm,
  onOpenChange,
  onViewConsumers,
  open,
  routingName,
}: {
  consumers: number;
  deleting: boolean;
  error?: string;
  onConfirm: () => void;
  onOpenChange: (open: boolean) => void;
  onViewConsumers: () => void;
  open: boolean;
  routingName: string;
}) {
  const [confirmation, setConfirmation] = useState("");
  useEffect(() => { if (!open) setConfirmation(""); }, [open]);
  const blocked = consumers > 0;
  const confirmed = confirmation === routingName;

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!deleting) onOpenChange(next); }}>
      <DialogContent aria-describedby="delete-model-routing-description">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertTriangle className="size-5 text-destructive" />
            {blocked ? "Routing cannot be deleted" : "Delete routing?"}
          </DialogTitle>
          <DialogDescription id="delete-model-routing-description">
            {blocked
              ? `${consumers} active ${consumers === 1 ? "Instance is" : "Instances are"} still using this routing. Reassign or remove them before deleting it.`
              : "This permanently removes the routing identity, binding, and policy. Provider connections and registered models are kept."}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 px-6 py-5">
          {blocked ? (
            <div role="alert" className="flex gap-3 border-l-2 border-amber-500 bg-amber-500/5 px-3 py-3 text-sm">
              <Boxes className="mt-0.5 size-5 shrink-0 text-amber-700" />
              <span>
                <strong className="block">Move {consumers} active {consumers === 1 ? "consumer" : "consumers"} first</strong>
                <span className="mt-1 block leading-5 text-muted-foreground">Open Consumers to find every Instance that must be reassigned.</span>
              </span>
            </div>
          ) : (
            <div className="space-y-2">
              <Label htmlFor="delete-model-routing-confirmation">Type <strong>{routingName}</strong> to confirm.</Label>
              <Input id="delete-model-routing-confirmation" value={confirmation} onChange={(event) => setConfirmation(event.target.value)} disabled={deleting} autoComplete="off" />
            </div>
          )}
          {error ? <p role="alert" className="border-l-2 border-destructive bg-destructive/5 px-3 py-2 text-sm text-destructive">{error}</p> : null}
        </div>
        <DialogFooter>
          <DialogClose asChild><Button type="button" variant="outline" disabled={deleting}>Cancel</Button></DialogClose>
          {blocked ? (
            <Button type="button" onClick={() => { onOpenChange(false); onViewConsumers(); }}><Boxes />View consumers</Button>
          ) : (
            <Button type="button" variant="destructive" disabled={!confirmed || deleting} onClick={onConfirm}>
              {deleting ? <LoaderCircle className="animate-spin motion-reduce:animate-none" /> : <Trash2 />}
              {deleting ? "Deleting…" : "Delete routing"}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
