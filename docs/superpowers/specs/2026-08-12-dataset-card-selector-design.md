# Dataset Card Selector Design

## Goal

Replace the Dataset `<select>` in the Evaluation Catalog Test coverage step with an always-visible card selector. Users should be able to compare available Datasets and create a new Dataset without opening a dropdown.

This is a presentation and interaction change only. Dataset eligibility, active selection, creation, generation, publishing, Guardrail pack selection, Next-step behavior, and evaluation state transitions remain unchanged.

## Layout

The existing bordered Dataset selector block becomes a card grid:

- two columns when the workspace width permits;
- one column on narrow screens;
- one card for every Dataset currently included in `targetDatasets`;
- one final **New Dataset** action card.

Existing Dataset cards show:

- Dataset name;
- description, falling back to `No description`;
- current revision number and state;
- current revision case count.

The New Dataset card uses a dashed border, plus icon, short description, and the same minimum height as Dataset cards. Clicking it invokes the existing `onCreateDataset` callback and opens the existing creation dialog.

## Selection Behavior

The Dataset cards form one semantic radio group labelled **Dataset**. Each existing Dataset is a radio option.

Clicking an unselected Dataset calls the existing `store.selectActiveDataset(dataset.id)`. When the operation succeeds, it sets `datasetSelectionPending` to `true`, preserving the current transition and publication flow.

The selected card displays:

- blue border;
- light blue background;
- selected radio indicator or check icon;
- accessible checked state.

The New Dataset card is an action, not a radio option. It is never reported as the active Dataset. The existing effect continues to detect a newly created Dataset, select it, and clear the pending creation state.

When no Dataset is selected, the existing status notice stays visible. The user can choose a Dataset card or open New Dataset. No disabled placeholder card is added.

## Keyboard and Accessibility

- The card container uses `role="radiogroup"` with the accessible name `Dataset`.
- Dataset cards use native radio inputs visually integrated into the card, so arrow-key and tab behavior remain available without custom keyboard code.
- The New Dataset card remains a native button.
- Dataset state is not communicated by color alone; the checked indicator and revision/status text remain visible.
- Focus rings use existing application focus tokens.

## Data Derivation

Card metadata is derived from existing state:

- find revisions whose `datasetId` matches the card;
- prefer the revision referenced by `dataset.currentRevisionId`;
- otherwise use the highest revision number;
- display `R{revision}`, `Draft` or `Published`, and `{count} cases`;
- display `No revisions` when no revision exists.

This derivation is a pure helper placed near the Catalog workspace view logic and covered independently. No model or fixture schema changes are required.

## Component Boundary

Introduce a focused `DatasetCardSelector` component within the Catalog feature. It receives:

```ts
type DatasetCardSelectorProps = {
  datasets: EvaluationLayerDataset[];
  revisions: EvaluationLayerDatasetRevision[];
  selectedDatasetId: string;
  onSelect(datasetId: string): void;
  onCreate(): void;
};
```

`EvaluationWorkspace` remains responsible for calling store mutations and setting `datasetSelectionPending`. The new component is responsible only for presentation, accessible selection, and invoking callbacks.

## Testing

Update Catalog component tests to verify:

- the Dataset combobox and `+ New Dataset` option are absent;
- available target Datasets render as radio cards;
- the active Dataset is checked and visually selected;
- cards display description, revision state, and case count;
- selecting another card calls the existing selection path and updates the workspace;
- the New Dataset action opens the existing dialog;
- the newly created Dataset becomes selected;
- no-Dataset state still permits selection and generation;
- existing Generate Dataset, Next, Details, and Guardrail pack tests continue to pass.

Run the focused Catalog tests, Control type check, and browser verification at desktop and narrow widths.

## Out of Scope

- changing which Datasets are eligible for a Target;
- changing Dataset creation or generation fields;
- editing or deleting a Dataset from the cards;
- adding search, sorting, pagination, or a card overflow menu;
- changing Guardrail pack cards or Evaluation workflow stages.
