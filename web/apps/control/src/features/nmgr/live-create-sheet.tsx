import { useState, type ComponentProps } from "react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { ResizableSheetContent } from "./resizable-sheet";
import { LiveForm } from "./live-form";

export function LiveCreateSheet({ error, onClose, ...formProps }: Omit<ComponentProps<typeof LiveForm>, "kind" | "mode" | "onCancel" | "embedded"> & {
  error: string;
  onClose: () => void;
}) {
  const [dirty, setDirty] = useState(false);
  const [confirmClose, setConfirmClose] = useState(false);
  const close = () => {
    if (formProps.busy) return;
    if (dirty) setConfirmClose(true);
    else onClose();
  };
  return <Sheet open onOpenChange={open => { if (!open) close(); }}>
    <ResizableSheetContent
      className="nm-app nm-drawer gap-4 bg-white overflow-y-auto p-6 pt-8 data-[side=right]:w-full data-[side=right]:sm:max-w-[600px]"
      showCloseButton={!formProps.busy}
      onEscapeKeyDown={event => { if (formProps.busy) event.preventDefault(); }}
      onInteractOutside={event => { if (formProps.busy) event.preventDefault(); }}
    >
      <SheetTitle>Create Guardrail</SheetTitle>
      <SheetDescription>Submit a request with its business scope and ownership.</SheetDescription>
      {confirmClose && <div role="alert" className="flex flex-wrap items-center gap-2 border-y bg-amber-50 px-3 py-3 text-sm">
        <span className="mr-auto">Discard unsaved changes?</span>
        <Button variant="outline" size="sm" disabled={formProps.busy} onClick={() => setConfirmClose(false)}>Keep editing</Button>
        <Button size="sm" disabled={formProps.busy} onClick={onClose}>Discard</Button>
      </div>}
      <div onChange={() => setDirty(true)}>
        <LiveForm {...formProps} kind="Guardrail" mode="create" embedded onCancel={close} />
      </div>
      {error && <p role="alert" className="nm-callout nm-connection-error">{error}</p>}
    </ResizableSheetContent>
  </Sheet>;
}
