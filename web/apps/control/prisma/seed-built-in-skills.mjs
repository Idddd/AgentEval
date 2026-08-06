import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { Pool } from "pg";
import { parse } from "smol-toml";

const manifestPath = fileURLToPath(
  new URL("../../../skills/vendor/dist/manifest.json", import.meta.url),
);
const archiveRoot = new URL("../../../skills/vendor/dist/", import.meta.url);
const maxCompressedSize = 10 * 1024 * 1024;
const maxUnpackedSize = 50 * 1024 * 1024;
const maxFileCount = 500;

async function databaseUrl() {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  const configPath = process.env.TASKLATTICE_CONFIG;
  if (!configPath) {
    if (process.env.NODE_ENV === "production") {
      throw new Error("TASKLATTICE_CONFIG or DATABASE_URL is required.");
    }
    return "postgresql://tasklattice:development@127.0.0.1:5432/tasklattice";
  }
  const config = parse(await readFile(configPath, "utf8"));
  const url = config?.database?.url;
  if (typeof url !== "string" || !url.trim()) {
    throw new Error("The Control configuration must contain database.url.");
  }
  return url;
}

function assertArtifact(artifact) {
  if (
    typeof artifact?.skillId !== "string"
    || typeof artifact?.version !== "string"
    || typeof artifact?.archive !== "string"
    || artifact.archiveFormat !== "tar+gzip"
    || artifact.contentType !== "application/gzip"
    || !/^sha256:[a-f0-9]{64}$/.test(artifact.digest)
    || !Number.isInteger(artifact.compressedSizeBytes)
    || artifact.compressedSizeBytes <= 0
    || artifact.compressedSizeBytes > maxCompressedSize
    || !Number.isInteger(artifact.unpackedSizeBytes)
    || artifact.unpackedSizeBytes <= 0
    || artifact.unpackedSizeBytes > maxUnpackedSize
    || !Number.isInteger(artifact.fileCount)
    || artifact.fileCount <= 0
    || artifact.fileCount > maxFileCount
  ) {
    throw new Error("Vendor Skill manifest contains an invalid artifact.");
  }
  if (
    artifact.archive.includes("/")
    || artifact.archive.includes("\\")
    || !artifact.archive.endsWith(".tar.gz")
  ) {
    throw new Error(`Unsafe Vendor Skill archive path: ${artifact.archive}`);
  }
}

async function seed() {
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  if (manifest.schemaVersion !== 1 || !Array.isArray(manifest.artifacts)) {
    throw new Error("Unsupported Vendor Skill manifest.");
  }
  const pool = new Pool({ connectionString: await databaseUrl(), max: 1 });
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock(607392011::bigint)");
    for (const artifact of manifest.artifacts) {
      assertArtifact(artifact);
      const archive = await readFile(new URL(artifact.archive, archiveRoot));
      const digest = `sha256:${createHash("sha256").update(archive).digest("hex")}`;
      if (archive.length !== artifact.compressedSizeBytes || digest !== artifact.digest) {
        throw new Error(`Vendor Skill archive failed integrity validation: ${artifact.archive}`);
      }
      const existing = await client.query(
        `SELECT digest
           FROM tasklattice.skill_artifacts
          WHERE skill_id = $1 AND version = $2`,
        [artifact.skillId, artifact.version],
      );
      if (existing.rowCount && existing.rows[0].digest !== artifact.digest) {
        throw new Error(
          `Immutable Vendor Skill ${artifact.skillId}@${artifact.version} has a different digest.`,
        );
      }
      await client.query(
        `INSERT INTO tasklattice.skill_artifacts (
           id, skill_id, version, digest, archive_format, content_type, archive,
           compressed_size_bytes, unpacked_size_bytes, file_count, manifest, source_path
         )
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11::jsonb, $12)
         ON CONFLICT (skill_id, version) DO NOTHING`,
        [
          `${artifact.skillId}@${artifact.version}`,
          artifact.skillId,
          artifact.version,
          artifact.digest,
          artifact.archiveFormat,
          artifact.contentType,
          archive,
          artifact.compressedSizeBytes,
          artifact.unpackedSizeBytes,
          artifact.fileCount,
          JSON.stringify(artifact),
          `skills/vendor/dist/${artifact.archive}`,
        ],
      );
      const endpoint =
        `tali+postgresql://skill-artifacts/${artifact.skillId}/${artifact.version}`;
      await client.query(
        `UPDATE tasklattice.skills
            SET payload = jsonb_set(
                  jsonb_set(payload, '{endpoint}', to_jsonb($3::text), true),
                  '{digest}', to_jsonb($4::text), true
                ),
                updated_at = CURRENT_TIMESTAMP
          WHERE id = $1 AND payload->>'version' = $2`,
        [artifact.skillId, artifact.version, endpoint, artifact.digest],
      );
    }
    await client.query("COMMIT");
    console.log(`Ensured ${manifest.artifacts.length} Vendor Skill artifacts.`);
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

await seed();
