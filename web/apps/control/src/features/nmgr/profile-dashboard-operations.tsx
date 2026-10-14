import { ProfileOperationsProvider } from "../business-demo/provider";
import { ProfileApprovalActions, ProfileOperations } from "../business-demo/profile-operations";
import { StorageCapacityError } from "../business-demo/trace-retention";
import type { State, Entity, Role } from "./model";
import { operatingProfile, operatingAction, changeOperatingMode, appendOperatingTraffic } from "./profile-operations-state";

export function ProfileDashboardOperations({ profile, state, role, dirty, busy, initialTime, updateState, onGuardrail }: {
  profile: Entity; state: State; role: Role; dirty: boolean; busy: boolean; initialTime: number;
  updateState: (change: (latest: State) => State, requirePersistence?: boolean) => boolean;
  onGuardrail: (id: string) => void;
}) {
  const adapted = operatingProfile(profile, state, initialTime);
  const save = (change: (latest: State) => State, traffic = false) => {
    if (!updateState(change, true)) {
      if (traffic) throw new StorageCapacityError();
      throw new Error("Changes could not be saved. Existing configuration was retained.");
    }
  };
  return <ProfileOperationsProvider items={[adapted]} currentOwner={role === "User Admin" ? "Admin" : role} busy={busy}
    onAction={(id, action) => save((latest) => operatingAction(latest, id, action, role, Date.now()))}
    {...(role === "User" ? { onModeChange: (id: string, guardrail: string, mode: "monitoring" | "active") => save((latest) => changeOperatingMode(latest, id, guardrail, mode, role, Date.now())) } : {})}
    onTraffic={(id, scenario) => save((latest) => appendOperatingTraffic(latest, id, scenario, Date.now()), true)}
  >
    <section className="nm-dashboard-profile-operations" aria-label={`Operations for ${profile.name}`}>
      <ProfileApprovalActions profile={adapted} dirty={dirty} canBypass={role === "User"} canRequest={role === "User"} />
      <ProfileOperations profile={adapted} dirty={dirty} showSummary={false} showProvider layout="cards" onOpenGuardrail={(id) => onGuardrail(id)} />
    </section>
  </ProfileOperationsProvider>;
}
