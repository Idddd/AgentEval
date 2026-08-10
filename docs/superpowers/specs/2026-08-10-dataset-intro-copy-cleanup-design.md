# Dataset Intro Copy Cleanup Design

## Goal

Reduce visual noise in the embedded Dataset tab by removing explanatory copy that repeats the surrounding headings and controls.

## Remove

Remove these three descriptions from `EvaluationDatasetDetail`:

1. The Dataset description shown directly below the Dataset name.
2. The dynamic `N cases · Editable draft for this Dataset.` description below `Current Dataset draft`.
3. The `Runs for every published revision of this Dataset.` description below `Evaluation history`.

## Preserve

Keep operational and domain information:

- Publication state and draft case count.
- Empty-draft and empty-history guidance.
- Schema column descriptions.
- Success, error, and progress notices.
- All actions and navigation.

## Verification

Add a focused rendering test that confirms the three descriptions are absent while publication metadata remains. Run only the focused Dataset test and the Control TypeScript check.
