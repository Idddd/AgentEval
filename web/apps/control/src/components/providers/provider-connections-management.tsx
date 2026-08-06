import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  providerPresets,
  type ModelDeployment,
  type ProviderAccount,
  type ProviderResourceStatus,
} from "@tasklattice/contracts";
import {
  Cable,
  Ellipsis,
  Plus,
  RefreshCw,
  Trash2,
} from "lucide-react";
import { ProviderIcon } from "./provider-icon";
import { DataBoundaryLabel } from "@/components/shared/data-boundary-label";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Spinner } from "@/components/ui/spinner";
import { useProjectQueryScope } from "@/hooks/use-project-query-scope";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";

export function ProviderConnectionsManagement({
  accounts,
  canManage,
  models,
  onRegisterModels,
}: {
  accounts: ProviderAccount[];
  canManage: boolean;
  models: ModelDeployment[];
  onRegisterModels: (account: ProviderAccount) => void;
}) {
  const [actionError, setActionError] = useState("");

  return (
    <section aria-labelledby="provider-connections-title">
      <div className="p-5 pb-4">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h3
              id="provider-connections-title"
              className="text-sm font-semibold"
            >
              Provider connections
            </h3>
            <Badge variant="outline">{accounts.length}</Badge>
          </div>
          <p className="mt-1 max-w-2xl text-xs leading-5 text-muted-foreground">
            Stored credentials and endpoints used to discover and register
            models for this Project.
          </p>
        </div>
      </div>

      {actionError ? (
        <p
          role="alert"
          className="border-y border-destructive/20 bg-destructive/5 px-5 py-3 text-sm text-destructive"
        >
          {actionError}
        </p>
      ) : null}

      {accounts.length ? (
        <>
          <div className="hidden overflow-x-auto border-t md:block">
            <table className="w-full min-w-[780px] text-left">
              <thead className="border-b bg-muted/20 text-xs text-muted-foreground">
                <tr>
                  <th className="px-5 py-2.5 font-medium">Connection</th>
                  <th className="px-4 py-2.5 font-medium">Provider</th>
                  <th className="px-4 py-2.5 font-medium">Registered models</th>
                  <th className="px-4 py-2.5 font-medium">Status</th>
                  <th className="px-4 py-2.5 font-medium">Data boundary</th>
                  <th className="w-14">
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {accounts.map((account) => {
                  const accountModels = models.filter(
                    (model) => model.providerAccountId === account.id,
                  );
                  return (
                    <tr key={account.id} className="hover:bg-muted/[0.12]">
                      <td className="px-5 py-3">
                        <strong className="block text-sm font-medium">
                          {account.name}
                        </strong>
                        <span className="mt-0.5 block max-w-xs truncate text-[11px] text-muted-foreground">
                          {account.endpoint}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <ProviderIdentity account={account} />
                      </td>
                      <td className="px-4 py-3">
                        <strong className="block text-xs font-medium">
                          {accountModels.length} model
                          {accountModels.length === 1 ? "" : "s"}
                        </strong>
                        <span className="mt-0.5 block max-w-60 truncate text-[11px] text-muted-foreground">
                          {accountModels
                            .map((model) => model.displayName)
                            .join(", ") || "No models registered"}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <ProviderStatus status={account.status} />
                      </td>
                      <td className="px-4 py-3 text-xs">
                        <DataBoundaryLabel
                          domain={account.complianceDomain}
                        />
                      </td>
                      <td className="px-2 py-3">
                        <ProviderActions
                          account={account}
                          canManage={canManage}
                          onError={setActionError}
                          onRegisterModels={() => onRegisterModels(account)}
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="divide-y border-t md:hidden">
            {accounts.map((account) => {
              const accountModels = models.filter(
                (model) => model.providerAccountId === account.id,
              );
              return (
                <article key={account.id} className="space-y-3 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <span className="min-w-0">
                      <strong className="block truncate text-sm">
                        {account.name}
                      </strong>
                      <span className="mt-1 block truncate text-xs text-muted-foreground">
                        {accountModels.length} registered model
                        {accountModels.length === 1 ? "" : "s"}
                      </span>
                    </span>
                    <ProviderActions
                      account={account}
                      canManage={canManage}
                      onError={setActionError}
                      onRegisterModels={() => onRegisterModels(account)}
                    />
                  </div>
                  <ProviderIdentity account={account} />
                  <div className="flex items-center justify-between border-t pt-3 text-xs">
                    <ProviderStatus status={account.status} />
                    <DataBoundaryLabel
                      className="text-muted-foreground"
                      domain={account.complianceDomain}
                    />
                  </div>
                </article>
              );
            })}
          </div>
        </>
      ) : (
        <div className="grid min-h-40 place-items-center border-t bg-muted/[0.08] p-6 text-center">
          <div>
            <span className="mx-auto grid size-9 place-items-center rounded-md border bg-background text-muted-foreground">
              <Cable className="size-4" />
            </span>
            <h4 className="mt-3 text-sm font-semibold">
              No Provider connections
            </h4>
            <p className="mt-1 max-w-md text-xs leading-5 text-muted-foreground">
              Connect a Provider to discover its catalog and register models.
            </p>
          </div>
        </div>
      )}
    </section>
  );
}

function ProviderActions({
  account,
  canManage,
  onError,
  onRegisterModels,
}: {
  account: ProviderAccount;
  canManage: boolean;
  onError: (message: string) => void;
  onRegisterModels: () => void;
}) {
  const scope = useProjectQueryScope();
  const queryClient = useQueryClient();
  const invalidateRegistry = async () =>
    Promise.all([
      queryClient.invalidateQueries({
        queryKey: scope.key("provider-accounts"),
      }),
      queryClient.invalidateQueries({
        queryKey: scope.key("model-deployments"),
      }),
    ]);
  const revalidate = useMutation({
    mutationFn: () => api.revalidateProviderAccount(account.id),
    onMutate: () => onError(""),
    onSuccess: invalidateRegistry,
    onError: (error) => onError(error.message),
  });
  const remove = useMutation({
    mutationFn: () => api.deleteProviderAccount(account.id),
    onMutate: () => onError(""),
    onSuccess: invalidateRegistry,
    onError: (error) => onError(error.message),
  });
  const pending = revalidate.isPending || remove.isPending;

  if (!canManage) return null;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          aria-label={`Actions for ${account.name}`}
          disabled={pending}
        >
          {pending ? <Spinner /> : <Ellipsis />}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onSelect={onRegisterModels}>
          <Plus />
          Register models
        </DropdownMenuItem>
        <DropdownMenuItem
          disabled={revalidate.isPending}
          onSelect={() => revalidate.mutate()}
        >
          <RefreshCw />
          Revalidate connection
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          className="text-destructive focus:text-destructive"
          disabled={remove.isPending}
          onSelect={() => {
            if (
              window.confirm(
                `Delete ${account.name} and all of its unused registered models?`,
              )
            ) {
              remove.mutate();
            }
          }}
        >
          <Trash2 />
          Delete connection
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function ProviderIdentity({ account }: { account: ProviderAccount }) {
  return (
    <span className="flex min-w-0 items-center gap-2.5">
      <ProviderIcon
        presetId={account.presetId}
        className="size-8 shrink-0 [&_img]:size-5"
      />
      <span className="min-w-0">
        <strong className="block truncate text-xs font-medium">
          {providerPresets.find(
            (provider) => provider.id === account.providerKind,
          )?.name ?? account.providerKind}
        </strong>
        <span className="block text-[11px] text-muted-foreground">
          Stored credential
        </span>
      </span>
    </span>
  );
}

function ProviderStatus({ status }: { status: ProviderResourceStatus }) {
  const ready = status === "VALIDATED";
  const degraded = status === "DEGRADED";
  return (
    <span
      className={cn(
        "inline-flex items-center gap-2 text-xs font-medium",
        ready
          ? "text-emerald-700"
          : degraded
            ? "text-amber-700"
            : "text-destructive",
      )}
    >
      <span
        className={cn(
          "size-1.5 rounded-full",
          ready
            ? "bg-emerald-500"
            : degraded
              ? "bg-amber-500"
              : "bg-current",
        )}
      />
      {ready ? "Healthy" : degraded ? "Degraded" : "Failed"}
    </span>
  );
}
