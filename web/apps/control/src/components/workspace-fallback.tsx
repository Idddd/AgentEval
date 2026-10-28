import { Component, type ReactNode } from "react";

export function WorkspaceFailure() {
  return <main className="p-8"><h1 className="text-xl font-semibold">Workspace could not start</h1><p role="alert" className="my-4">[workspace_render_failed] Check browser console and deployment logs. Verify that JavaScript assets are served from the current release, the asset base path is correct, and cached HTML has been refreshed.</p><div className="flex gap-4"><button type="button" className="underline" onClick={() => window.location.reload()}>Reload workspace</button><a href="/v2/guardrails" className="underline">Open Mock V2</a></div></main>;
}
export class WorkspaceBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch() { console.error(JSON.stringify({ event: "workspace_render_failed", code: "workspace_render_failed", component: "frontend", hint: "Check browser asset requests, release cache and deployment logs." })); }
  render() { return this.state.failed ? <WorkspaceFailure /> : this.props.children; }
}
