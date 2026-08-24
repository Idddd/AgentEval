#!/usr/bin/env python3
"""Build deterministic vendor Skill archives and their deployment manifest."""

from __future__ import annotations

import gzip
import hashlib
import io
import json
from pathlib import Path
import re
import tarfile

REPOSITORY_ROOT = Path(__file__).resolve().parent.parent
VENDOR_ROOT = REPOSITORY_ROOT / "skills" / "vendor"
CATALOG_PATH = VENDOR_ROOT / "catalog.json"
DIST_ROOT = VENDOR_ROOT / "dist"
MAX_FILE_COUNT = 500
MAX_FILE_SIZE = 5 * 1024 * 1024
MAX_UNPACKED_SIZE = 50 * 1024 * 1024
MAX_ARCHIVE_SIZE = 10 * 1024 * 1024
SKILL_NAME = re.compile(r"^[a-z0-9]+(?:-[a-z0-9]+)*$")


def files_for(skill_root: Path) -> list[Path]:
    files = sorted(
        path
        for path in skill_root.rglob("*")
        if path.is_file() and path.name != ".DS_Store"
    )
    if len(files) > MAX_FILE_COUNT:
        raise ValueError(f"{skill_root.name} has more than {MAX_FILE_COUNT} files")
    for path in files:
        if path.is_symlink():
            raise ValueError(f"{skill_root.name} contains a symbolic link: {path}")
        if path.stat().st_size > MAX_FILE_SIZE:
            raise ValueError(f"{path} exceeds the {MAX_FILE_SIZE}-byte file limit")
    return files


def validate_skill(skill_id: str, skill_root: Path, files: list[Path]) -> None:
    if not SKILL_NAME.fullmatch(skill_id):
        raise ValueError(f"Invalid Skill id: {skill_id}")
    skill_file = skill_root / "SKILL.md"
    if skill_file not in files:
        raise ValueError(f"{skill_id} must contain SKILL.md")
    content = skill_file.read_text(encoding="utf-8")
    if not content.startswith("---\n") or content.count("---\n") < 2:
        raise ValueError(f"{skill_id}/SKILL.md has invalid frontmatter")
    if f"name: {skill_id}\n" not in content:
        raise ValueError(f"{skill_id}/SKILL.md name must match its directory")
    if "\ndescription: " not in content:
        raise ValueError(f"{skill_id}/SKILL.md requires a description")


def archive_skill(skill_id: str, skill_root: Path, files: list[Path]) -> bytes:
    tar_buffer = io.BytesIO()
    with tarfile.open(fileobj=tar_buffer, mode="w", format=tarfile.PAX_FORMAT) as archive:
        for path in files:
            relative = path.relative_to(skill_root)
            data = path.read_bytes()
            info = tarfile.TarInfo(f"{skill_id}/{relative.as_posix()}")
            info.size = len(data)
            info.mode = 0o644
            info.mtime = 0
            info.uid = 0
            info.gid = 0
            info.uname = ""
            info.gname = ""
            archive.addfile(info, io.BytesIO(data))
    return gzip.compress(tar_buffer.getvalue(), compresslevel=9, mtime=0)


def main() -> None:
    catalog = json.loads(CATALOG_PATH.read_text(encoding="utf-8"))
    if catalog.get("schemaVersion") != 1:
        raise ValueError("Unsupported Vendor Skill catalog schema")
    DIST_ROOT.mkdir(parents=True, exist_ok=True)
    artifacts: list[dict[str, object]] = []
    expected_archives: set[Path] = set()

    for item in catalog["skills"]:
        skill_id = item["id"]
        version = item["version"]
        skill_root = VENDOR_ROOT / skill_id
        files = files_for(skill_root)
        validate_skill(skill_id, skill_root, files)
        unpacked_size = sum(path.stat().st_size for path in files)
        if unpacked_size > MAX_UNPACKED_SIZE:
            raise ValueError(f"{skill_id} exceeds the unpacked size limit")
        content = archive_skill(skill_id, skill_root, files)
        if len(content) > MAX_ARCHIVE_SIZE:
            raise ValueError(f"{skill_id} exceeds the compressed size limit")
        archive_name = f"{skill_id}-{version}.tar.gz"
        archive_path = DIST_ROOT / archive_name
        archive_path.write_bytes(content)
        expected_archives.add(archive_path)
        artifacts.append(
            {
                "skillId": skill_id,
                "version": version,
                "archive": archive_name,
                "archiveFormat": "tar+gzip",
                "contentType": "application/gzip",
                "digest": f"sha256:{hashlib.sha256(content).hexdigest()}",
                "compressedSizeBytes": len(content),
                "unpackedSizeBytes": unpacked_size,
                "fileCount": len(files),
            }
        )

    for existing in DIST_ROOT.glob("*.tar.gz"):
        if existing not in expected_archives:
            existing.unlink()
    manifest = {
        "schemaVersion": 1,
        "generatedFrom": "skills/vendor/catalog.json",
        "artifacts": artifacts,
    }
    (DIST_ROOT / "manifest.json").write_text(
        json.dumps(manifest, indent=2, ensure_ascii=False) + "\n",
        encoding="utf-8",
    )
    print(f"Packaged {len(artifacts)} Vendor Skills in {DIST_ROOT}")


if __name__ == "__main__":
    main()
