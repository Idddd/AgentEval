import { useEffect, useRef, useState } from "react";
import { Check, FileText, FileUp, LoaderCircle, Sparkles, Trash2 } from "lucide-react";
import { useTranslation } from "react-i18next";

import { InfoNotice } from "./product-shell";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import type { Policy } from "../lib/source-api";
import { cn } from "../lib/utils";

const MAX_FILES = 3;
const MAX_FILE_BYTES = 5 * 1024 * 1024;
const SUPPORTED_EXTENSIONS = [".doc", ".docx", ".txt"];

export type ComplianceDocumentAnalysis = {
  summary: string;
  recommended_policy_ids: string[];
  requirements: Array<{ title: string; description: string; effect: "block" | "redact" | "allow"; source_refs: string[] }>;
  review_notes: string[];
};

export function ComplianceDocumentImport({
  policies,
  resetKey,
  onApply,
}: {
  policies: Policy[];
  resetKey: number;
  onApply: (analysis: ComplianceDocumentAnalysis) => void;
}) {
  const { t, i18n } = useTranslation();
  const inputRef = useRef<HTMLInputElement>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [analysis, setAnalysis] = useState<ComplianceDocumentAnalysis | null>(null);
  const [applied, setApplied] = useState(false);
  const [selectionError, setSelectionError] = useState("");
  const [analyzing, setAnalyzing] = useState(false);

  useEffect(() => {
    setFiles([]);
    setAnalysis(null);
    setApplied(false);
    setSelectionError("");
    if (inputRef.current) inputRef.current.value = "";
  }, [resetKey]);

  function selectFiles(selected: File[]) {
    const next = [...files];
    for (const file of selected) {
      const extension = file.name.slice(file.name.lastIndexOf(".")).toLocaleLowerCase();
      if (!SUPPORTED_EXTENSIONS.includes(extension)) {
        setSelectionError(t("guardrailWizard.documentUnsupported", { name: file.name }));
        return;
      }
      if (file.size > MAX_FILE_BYTES) {
        setSelectionError(t("guardrailWizard.documentTooLarge", { name: file.name }));
        return;
      }
      if (!next.some((item) => item.name === file.name && item.size === file.size && item.lastModified === file.lastModified)) next.push(file);
    }
    if (next.length > MAX_FILES) {
      setSelectionError(t("guardrailWizard.documentLimit", { count: MAX_FILES }));
      return;
    }
    setFiles(next);
    setAnalysis(null);
    setApplied(false);
    setSelectionError("");
  }

  function analyze() {
    setAnalyzing(true);
    globalThis.setTimeout(() => {
      setAnalysis({
        summary: "Protect customer-facing conversations from instruction override and sensitive data disclosure.",
        recommended_policy_ids: policies.filter((policy) => ["policy-prompt-injection", "policy-sensitive-data"].includes(policy.id)).map((policy) => policy.id),
        requirements: [
          { title: "Resist instruction override", description: "Block attempts to replace approved operating instructions.", effect: "block", source_refs: [files[0]?.name ?? "document"] },
          { title: "Protect sensitive data", description: "Redact personal or confidential values before delivery.", effect: "redact", source_refs: [files[0]?.name ?? "document"] },
        ],
        review_notes: ["Recommendations are draft-only and must be reviewed before validation."],
      });
      setAnalyzing(false);
    }, 250);
  }

  const policyNames = new Map(policies.map((policy) => [policy.id, policy.name]));
  return (
    <section className="overflow-hidden rounded-xl border bg-card" aria-labelledby="compliance-document-title">
      <header className="flex flex-col gap-3 border-b bg-muted/20 p-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex min-w-0 items-center gap-2">
          <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary"><FileText className="size-4" /></span>
          <div><h4 id="compliance-document-title" className="text-sm font-semibold">{t("guardrailWizard.documentImportTitle")}</h4><p className="mt-0.5 text-xs leading-5 text-muted-foreground">{t("guardrailWizard.documentImportDescription")}</p></div>
        </div>
        <Button type="button" variant="outline" className="min-h-11 self-start" disabled={files.length >= MAX_FILES || analyzing} onClick={() => inputRef.current?.click()}><FileUp />{t(files.length ? "guardrailWizard.documentAdd" : "guardrailWizard.documentChoose")}</Button>
        <input ref={inputRef} hidden type="file" multiple accept=".doc,.docx,.txt,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain" onChange={(event) => { selectFiles(Array.from(event.target.files ?? [])); event.target.value = ""; }} />
      </header>
      <div className="space-y-4 p-4">
        {!files.length ? <div className="rounded-lg border border-dashed p-5 text-center"><p className="text-sm font-medium">{t("guardrailWizard.documentEmpty")}</p><p className="mt-1 text-xs leading-5 text-muted-foreground">{t("guardrailWizard.documentFormats", { count: MAX_FILES })}</p></div> : null}
        {files.length ? <div className="divide-y rounded-lg border" aria-label={t("guardrailWizard.documentSelectedFiles")}>{files.map((file) => <div key={`${file.name}-${file.size}-${file.lastModified}`} className="flex min-w-0 items-center gap-3 px-3 py-2.5"><FileText className="size-4 shrink-0 text-muted-foreground" /><span className="min-w-0 flex-1"><strong className="block truncate text-xs font-medium">{file.name}</strong><span className="mt-0.5 block text-[11px] text-muted-foreground">{formatBytes(file.size, i18n.language)}</span></span><Button type="button" size="icon" variant="ghost" className="size-11" disabled={analyzing} aria-label={t("guardrailWizard.documentRemove", { name: file.name })} onClick={() => { setFiles((current) => current.filter((item) => item !== file)); setAnalysis(null); }}><Trash2 /></Button></div>)}</div> : null}
        {selectionError ? <p role="alert" className="text-sm text-destructive">{selectionError}</p> : null}
        {files.length && !analysis ? <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between"><p className="text-xs leading-5 text-muted-foreground">{t("guardrailWizard.documentPrivacy", { analyst: "Demo analyst · local session" })}</p><Button type="button" className="min-h-11" disabled={analyzing} onClick={analyze}>{analyzing ? <LoaderCircle className="animate-spin" /> : <Sparkles />}{t(analyzing ? "guardrailWizard.documentAnalyzing" : "guardrailWizard.documentAnalyze")}</Button></div> : null}
        {analysis ? <section className="overflow-hidden rounded-lg border" aria-live="polite"><header className="flex flex-wrap items-start justify-between gap-3 border-b bg-muted/20 p-3"><div><h5 className="text-sm font-semibold">{t("guardrailWizard.documentDraftReady")}</h5><p className="mt-1 text-xs text-muted-foreground">{t("guardrailWizard.documentDraftSummary", { requirements: analysis.requirements.length, policies: analysis.recommended_policy_ids.length })}</p></div><Badge variant="outline" className={cn(applied && "border-emerald-200 bg-emerald-50 text-emerald-700")}>{applied ? <Check /> : <Sparkles />}{t(applied ? "guardrailWizard.documentApplied" : "guardrailWizard.documentDraft")}</Badge></header><div className="space-y-4 p-4"><div><p className="text-xs font-medium text-muted-foreground">{t("guardrailWizard.documentPurpose")}</p><p className="mt-1 text-sm leading-6">{analysis.summary}</p></div><div><p className="text-xs font-medium text-muted-foreground">{t("guardrailWizard.documentRecommendedPolicies")}</p><div className="mt-2 flex flex-wrap gap-2">{analysis.recommended_policy_ids.map((id) => <Badge key={id} variant="secondary">{policyNames.get(id) ?? id}</Badge>)}</div></div><details className="group rounded-lg border" open><summary className="min-h-11 cursor-pointer list-none px-3 py-2.5 text-sm font-medium outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring">{t("guardrailWizard.documentRequirements", { count: analysis.requirements.length })}</summary><div className="divide-y border-t">{analysis.requirements.map((requirement, index) => <article key={`${requirement.title}-${index}`} className="p-3"><div className="flex flex-wrap items-center gap-2"><strong className="text-xs">{requirement.title}</strong><Badge variant="outline">{t(`guardrailWizard.documentEffects.${requirement.effect}`)}</Badge></div><p className="mt-1 text-xs leading-5 text-muted-foreground">{requirement.description}</p></article>)}</div></details><InfoNotice title={t("guardrailWizard.documentReviewNotes")}>{analysis.review_notes.join(" · ")}</InfoNotice><div className="flex flex-col gap-2 border-t pt-4 sm:flex-row sm:items-center sm:justify-between"><p className="text-xs leading-5 text-muted-foreground">{t("guardrailWizard.documentApplyDescription")}</p><Button type="button" className="min-h-11" disabled={applied} onClick={() => { onApply(analysis); setApplied(true); }}><Check />{t(applied ? "guardrailWizard.documentApplied" : "guardrailWizard.documentApply")}</Button></div></div></section> : null}
      </div>
    </section>
  );
}

function formatBytes(value: number, locale: string) {
  if (value < 1024) return `${value} B`;
  return `${new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(value / 1024)} KB`;
}
