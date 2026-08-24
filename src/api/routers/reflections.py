from fastapi import APIRouter


router = APIRouter(
    prefix="/api/v1/evaluations/reflections", tags=["reflections"]
)


@router.post("/{report_id}/submit")
def submit_reflection(report_id: str) -> dict:
    raise NotImplementedError("reflections are demo-only")


@router.post("/{report_id}/finish-without-changes")
def finish_without_changes(report_id: str) -> dict:
    raise NotImplementedError("reflections are demo-only")
