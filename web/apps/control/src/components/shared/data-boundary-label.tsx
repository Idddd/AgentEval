import {
  complianceDomainCatalog,
  type ComplianceDomain,
} from "@tasklattice/contracts";
import { cn } from "@/lib/utils";

const dataBoundarySymbols: Record<ComplianceDomain, string> = {
  GLOBAL: "🌐",
  CN_MAINLAND: "🇨🇳",
  EU_EEA: "🇪🇺",
  US: "🇺🇸",
  UK: "🇬🇧",
  APAC_EX_CN: "🌏",
};

export function dataBoundaryLabel(domain: ComplianceDomain): string {
  return (
    complianceDomainCatalog.find((item) => item.id === domain)?.label ?? domain
  );
}

export function dataBoundaryOptionLabel(domain: ComplianceDomain): string {
  return `${dataBoundarySymbols[domain]}  ${dataBoundaryLabel(domain)}`;
}

export function DataBoundaryLabel({
  className,
  domain,
}: {
  className?: string;
  domain: ComplianceDomain;
}) {
  return (
    <span className={cn("inline-flex items-center gap-2", className)}>
      <span aria-hidden="true" className="text-sm leading-none">
        {dataBoundarySymbols[domain]}
      </span>
      <span>{dataBoundaryLabel(domain)}</span>
    </span>
  );
}
