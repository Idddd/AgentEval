# AgentEval Full UI Generator

This local Figma plugin creates the complete editable AgentEval / TaskLattice
UI handoff in a blank Figma Design file.

## Output

- 12 Figma pages: cover, foundations, components, 8 current product areas, and legacy reference.
- 71 editable 1440 × 1024 screens.
- Light and Dark semantic color variables.
- Spacing and radius variables.
- Button and Badge component sets plus an Input component.
- Auto Layout frames and named layers throughout.
- Agent Wizard, Admin, and End User workflows.

The product screens cover Build, Evaluate, Business Eval, Guardrails, Monitor,
Agent Garden, Instances, reports, dialogs, sheets, system states, and supporting
administration pages. `ui-inventory.json` is the acceptance checklist.

## Import into Figma

1. Open the Figma desktop app and create a blank **Figma Design** file.
2. Open **Plugins → Development → Import plugin from manifest…**.
3. Select this folder's `manifest.json`.
4. Run **Plugins → Development → AgentEval Full UI Generator**.
5. Wait for the completion notification. The plugin generates the file in one run.

Running it again refreshes pages with the same names. It does not touch other
Figma files, and it does not upload source code or credentials.

## Validation

From the repository root:

```powershell
node design/figma-agent-eval/validate.mjs
node --check design/figma-agent-eval/code.js
```

## Source of truth

- Design tokens: `web/apps/control/src/styles.css`
- Current source commit used for this package: `f268d6d`
- Screen inventory: `ui-inventory.json`

The GitHub remote was unreachable while this package was generated. Before the
final design review, pull the latest branch and rerun the inventory audit if the
source commit changes.
