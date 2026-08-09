import { useEffect, useState } from "react";
import { AlertTriangle, LoaderCircle, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function DeleteInstanceDialog({ deleting, error, instanceName, onConfirm, onOpenChange, open }: {
  deleting: boolean;
  error?: string;
  instanceName: string;
  onConfirm: () => void;
  onOpenChange: (open: boolean) => void;
  open: boolean;
}) {
  const [confirmation, setConfirmation] = useState("");
  useEffect(() => { if (!open) setConfirmation(""); }, [open]);
  const confirmed = confirmation === instanceName;

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!deleting) onOpenChange(next); }}>
      <DialogContent aria-describedby="delete-instance-description">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><AlertTriangle className="size-5 text-destructive" />Delete Instance?</DialogTitle>
          <DialogDescription id="delete-instance-description">This queues background cleanup of the Agent Instance and its OpenShell runtime resources. This action cannot be undone.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4 px-6 py-5">
          <div className="space-y-2">
            <Label htmlFor="delete-instance-confirmation">Type <strong>{instanceName}</strong> to confirm.</Label>
            <Input id="delete-instance-confirmation" value={confirmation} onChange={(event) => setConfirmation(event.target.value)} disabled={deleting} autoComplete="off" />
          </div>
          {error ? <p role="alert" className="border-l-2 border-destructive bg-destructive/5 px-3 py-2 text-sm text-destructive">{error}</p> : null}
        </div>
        <DialogFooter>
          <DialogClose asChild><Button type="button" variant="outline" disabled={deleting}>Cancel</Button></DialogClose>
          <Button type="button" variant="destructive" disabled={!confirmed || deleting} onClick={onConfirm}>
            {deleting ? <LoaderCircle className="animate-spin motion-reduce:animate-none" /> : <Trash2 />}
            {deleting ? "Deleting…" : "Delete Instance"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
