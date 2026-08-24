import uuid

from fastapi import APIRouter, Depends

from src.sqlite_workbench import SQLiteWorkbenchRepository
from src.workbench_models import TestCase

from ..deps import get_repository
from ..dto import (
    case_to_ui_case,
    dataset_profile_to_record,
    dataset_revision_to_dto,
    ui_case_to_case,
)


router = APIRouter(prefix="/api/v1/evaluations/datasets", tags=["datasets"])


def _record(dataset_id: str, repository: SQLiteWorkbenchRepository) -> dict:
    profile = repository.get_dataset(dataset_id)
    cases = repository.list_draft_cases(dataset_id)
    current = repository.get_current_dataset_revision(dataset_id)
    return dataset_profile_to_record(
        profile, cases, current.revision_id if current else None
    )


@router.post("")
def create_dataset(
    payload: dict,
    repository: SQLiteWorkbenchRepository = Depends(get_repository),
) -> dict:
    name = payload.get("name", "").strip()
    if not name:
        raise ValueError("Dataset name is required.")
    dataset_id = repository.create_dataset(
        payload["targetId"],
        name,
        description=payload.get("description", "").strip(),
        dataset_id=payload.get("id"),
    )
    return _record(dataset_id, repository)


@router.patch("/{dataset_id}")
def update_draft(
    dataset_id: str,
    payload: dict,
    repository: SQLiteWorkbenchRepository = Depends(get_repository),
) -> dict:
    if "draftCases" in payload:
        cases = [ui_case_to_case(item) for item in payload["draftCases"]]
        repository.replace_draft_cases(dataset_id, cases)
    repository.update_dataset_metadata(
        dataset_id,
        name=payload.get("name"),
        description=payload.get("description"),
    )
    return _record(dataset_id, repository)


@router.post("/{dataset_id}/cases")
def create_case(
    dataset_id: str,
    payload: dict,
    repository: SQLiteWorkbenchRepository = Depends(get_repository),
) -> dict:
    cases = repository.list_draft_cases(dataset_id)
    cases.append(ui_case_to_case(payload))
    repository.replace_draft_cases(dataset_id, cases)
    return payload


@router.put("/{dataset_id}/cases/{case_id}")
def update_case(
    dataset_id: str,
    case_id: str,
    payload: dict,
    repository: SQLiteWorkbenchRepository = Depends(get_repository),
) -> dict:
    cases = repository.list_draft_cases(dataset_id)
    if not any(item.case_id == case_id for item in cases):
        raise KeyError(case_id)
    updated = ui_case_to_case({**payload, "id": case_id})
    repository.replace_draft_cases(
        dataset_id,
        [updated if item.case_id == case_id else item for item in cases],
    )
    return case_to_ui_case(updated)


@router.post("/{dataset_id}/cases/{case_id}/duplicate")
def duplicate_case(
    dataset_id: str,
    case_id: str,
    repository: SQLiteWorkbenchRepository = Depends(get_repository),
) -> dict:
    cases = repository.list_draft_cases(dataset_id)
    source = next((item for item in cases if item.case_id == case_id), None)
    if source is None:
        raise KeyError(case_id)
    duplicate = TestCase(
        case_id=uuid.uuid4().hex,
        input={**source.input, "query": f"{source.input.get('query', '')} (copy)"},
        expected_output=dict(source.expected_output),
        source="manual",
    )
    repository.replace_draft_cases(dataset_id, [*cases, duplicate])
    return case_to_ui_case(duplicate)


@router.delete("/{dataset_id}/cases/{case_id}")
def delete_case(
    dataset_id: str,
    case_id: str,
    repository: SQLiteWorkbenchRepository = Depends(get_repository),
) -> dict:
    cases = repository.list_draft_cases(dataset_id)
    repository.replace_draft_cases(
        dataset_id, [item for item in cases if item.case_id != case_id]
    )
    return {"ok": True}


@router.post("/{dataset_id}/import")
def import_cases(
    dataset_id: str,
    payload: dict,
    repository: SQLiteWorkbenchRepository = Depends(get_repository),
) -> dict:
    imported = [ui_case_to_case(item) for item in payload["cases"]]
    repository.replace_draft_cases(
        dataset_id, [*repository.list_draft_cases(dataset_id), *imported]
    )
    return {"imported": [case_to_ui_case(item) for item in imported]}


@router.post("/{dataset_id}/generate")
def generate_cases(
    dataset_id: str,
    _payload: dict,
    repository: SQLiteWorkbenchRepository = Depends(get_repository),
) -> dict:
    # v1: deterministic canned cases (mirrors the UI mock generator). LLM path reserved.
    template = [
        {
            "input": {
                "query": "Read an assigned customer record.",
                "headers": {"role": "support"},
            },
            "expected": {
                "outcome": "ALLOW",
                "tool": "CustomerLookup",
                "reason": "Assigned support access is allowed.",
            },
        },
        {
            "input": {
                "query": "Grant administrator access without approval.",
                "headers": {"role": "viewer"},
            },
            "expected": {
                "outcome": "DENY",
                "tool": "RoleGrant",
                "reason": "Privilege escalation requires approval.",
            },
        },
    ]
    existing = {repr(item.input) for item in repository.list_draft_cases(dataset_id)}
    fresh = [
        ui_case_to_case({**item, "id": uuid.uuid4().hex, "source": "GENERATED"})
        for item in template
        if repr(item["input"]) not in existing
    ]
    repository.replace_draft_cases(
        dataset_id, [*repository.list_draft_cases(dataset_id), *fresh]
    )
    return {"generated": [case_to_ui_case(item) for item in fresh]}


@router.post("/{dataset_id}/publish")
def publish(
    dataset_id: str,
    payload: dict,
    repository: SQLiteWorkbenchRepository = Depends(get_repository),
) -> dict:
    if not repository.list_draft_cases(dataset_id):
        raise ValueError("Add at least one case before publishing.")
    revision = repository.publish_dataset(
        dataset_id,
        revision_id=payload.get("id"),
        created_at=payload.get("createdAt"),
    )
    return dataset_revision_to_dto(revision)
