import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { useEvaluationStore } from "../mock-provider";

const example = `[
  {
    "input": { "query": "Read customer record", "headers": { "role": "viewer" } },
    "expected": { "outcome": "DENY", "tool": "CustomerLookup", "reason": "Viewer role is insufficient." },
    "source": "IMPORTED"
  }
]`;

export function ImportCasesDialog({ datasetId, onOpenChange, open }: { datasetId: string; onOpenChange: (open: boolean) => void; open: boolean }) {
  const store = useEvaluationStore();
  const [json, setJson] = useState(example);
  const [error, setError] = useState("");
  function submit() {
    const result = store.importCases(datasetId, json);
    if (!result.ok) { setError(result.error); return; }
    setError("");
    onOpenChange(false);
  }
  return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent className="sm:max-w-2xl"><DialogHeader><DialogTitle>Import Cases from JSON</DialogTitle><DialogDescription>Paste an array of input and expected-behavior objects. Nothing is uploaded.</DialogDescription></DialogHeader><Textarea value={json} onChange={(event) => setJson(event.target.value)} rows={16} className="font-mono text-xs" />{error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}<DialogFooter><Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button><Button onClick={submit}>Import Cases</Button></DialogFooter></DialogContent></Dialog>;
}
