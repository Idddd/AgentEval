# Route-to-Figma coverage

This matrix maps the application source surfaces to the generated Figma pages.
Aliases and compatibility routes intentionally point at the same editable Frame.

| Source route or feature | Figma page | Primary Frame |
| --- | --- | --- |
| `/$projectId/create` | 03 Build | Build / Agent catalog |
| `demo-workflow/build` | 03 Build | Build / Onboarding Assistant first |
| Agent build detail sheet | 03 Build | Build / Agent detail |
| Agent form | 03 Build | Build / Agent edit; Build / Create Agent |
| MCP Servers | 03 Build | Build / MCP Server catalog; detail |
| Skills | 03 Build | Build / Skill catalog; detail |
| Knowledge Base | 03 Build | Build / Knowledge Base catalog |
| `/$projectId/evaluation/catalog` | 04 Evaluate | Evaluate / Lifecycle catalog |
| Agent Wizard evaluation | 04 Evaluate | Evaluate / Agent evaluation workspace |
| Evaluation Datasets | 04 Evaluate | Evaluate / Dataset setup |
| Dataset creation | 04 Evaluate | Evaluate / Create dataset dialog |
| Evaluation Runs | 04 Evaluate | Evaluate / Running evaluation |
| Evaluation Reports | 04 Evaluate | Completed preview; Full report detail; Test case results |
| Admin catalog mode | 05 Business Eval | Business Eval / Pending approval |
| Admin failed/passed report | 05 Business Eval | Failed report; Passed report |
| Admin return flow | 05 Business Eval | Reject reason optional |
| Admin publish flow | 05 Business Eval | Approved and published |
| Governance Guardrails | 06 Guardrails | Registry; Detail; Create flow |
| Governance Policy Library | 06 Guardrails | Policy Library; Policy Studio |
| Compliance document import | 06 Guardrails | Compliance document import |
| Policy binding editor | 06 Guardrails | Policy binding editor |
| Governance Assignments | 06 Guardrails | Assignment sheet |
| Governance Traffic Scope | 06 Guardrails | Traffic scope |
| Governance Enforcements | 06 Guardrails | Enforcements |
| Governance Evidence | 06 Guardrails | Evidence |
| Governance Integrations | 06 Guardrails | Integrations |
| Relay runtime preview | 06 Guardrails | Relay preview |
| Evaluation overview / Monitor | 07 Monitor | Monitor / All traces |
| Monitor failure filter | 07 Monitor | Monitor / Failure filter |
| Evaluator policy | 07 Monitor | Evaluator policy 2 active; 10 active |
| Trace pages / Trace workbench | 07 Monitor | Monitor / Trace detail |
| Agent Garden index | 08 Agent Garden | Approved catalog; Search results |
| Agent Garden detail | 08 Agent Garden | Agent detail; Apply Instance |
| Instances index | 09 Instances | List; Creating; Ready |
| Instance detail | 09 Instances | OpenClaw detail; Endpoint and credentials |
| Login / SSO entry | 10 Secondary & System | Login |
| Access Policies | 10 Secondary & System | Access Policies; detail |
| Audit Logs | 10 Secondary & System | Audit Logs; detail |
| Model Cost | 10 Secondary & System | Model Cost |
| Runtime / Runtime Policies | 10 Secondary & System | Runtime; Runtime Policies |
| Memory | 10 Secondary & System | Memory |
| Requests | 10 Secondary & System | Requests |
| Project settings / profile | 10 Secondary & System | Project Settings; Profile |
| Shared empty/error/loading boundaries | 10 Secondary & System | Empty; Error; Loading state |
| Older `evaluations/*` compatibility routes | 99 Legacy Reference | Legacy evaluation Frames |

## Role coverage

| Persona | End-to-end workflow |
| --- | --- |
| Agent Wizard | Build → Evaluate → submit exact revision |
| Admin | Business Eval → optional reject reason or approve → publish → Monitor |
| End User | Agent Garden → Apply Instance → Instance detail → Endpoint / Workspace |

## State coverage

The generated file includes draft, running, completed, failed, pending approval,
published, creating, ready, stopped, empty, error, and loading states. Dialog and
sheet states are represented as named Frames so designers can modify them without
opening hidden prototype overlays.
