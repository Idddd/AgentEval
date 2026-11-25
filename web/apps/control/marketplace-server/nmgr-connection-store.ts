import {
  createCipheriv,
  createDecipheriv,
  createHmac,
  randomBytes,
  randomUUID,
} from "node:crypto";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";
import {
  connectionSettingsSchema,
  type ConnectionSettings,
} from "./nmgr-connection-config";
import { DeploymentError } from "./diagnostics";

export const connectionBackupPath = "/api/nmgr/connection/backup";
export const connectionBackupSchema = z.object({
  format: z.literal("marketplace-connection"),
  version: z.literal(1),
  nonce: z.string().regex(/^[A-Za-z0-9+/]{16}$/),
  tag: z.string().regex(/^[A-Za-z0-9+/]{22}==$/),
  data: z.string().min(4).max(160_000).regex(/^[A-Za-z0-9+/]+={0,2}$/),
}).strict();
const backupContents = z.object({
  settings: connectionSettingsSchema,
  nemoUrl: z.string().optional(),
  f5Url: z.string().optional(),
}).strict();
type BackupContents = z.infer<typeof backupContents>;

const unavailable = () =>
  new DeploymentError(
    "runtime",
    "connection_store_unavailable",
    "Saved connection settings could not be read or written. Check the connection storage mount and permissions, or re-enter all three settings.",
    ["MARKETPLACE_CONNECTION_DIR"],
  );
export class ConnectionStore {
  constructor(private directory: string) {}
  private get file() {
    return join(this.directory, "connection.json");
  }
  private async key() {
    await mkdir(this.directory, { recursive: true, mode: 0o700 });
    const file = join(this.directory, "connection.key");
    try {
      await writeFile(file, randomBytes(32), { flag: "wx", mode: 0o600 });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
    }
    const key = await readFile(file);
    if (key.length !== 32) throw unavailable();
    return key;
  }
  private async backupKey() {
    try {
      return createHmac("sha256", await this.key()).update("marketplace-connection-backup-v1").digest();
    } catch {
      throw unavailable();
    }
  }
  async exportBackup(contents: BackupContents) {
    const nonce = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", await this.backupKey(), nonce);
    const data = Buffer.concat([
      cipher.update(JSON.stringify(backupContents.parse(contents)), "utf8"),
      cipher.final(),
    ]).toString("base64");
    return connectionBackupSchema.parse({
      format: "marketplace-connection", version: 1,
      nonce: nonce.toString("base64"), tag: cipher.getAuthTag().toString("base64"), data,
    });
  }
  async importBackup(value: unknown): Promise<BackupContents> {
    const key = await this.backupKey();
    try {
      const backup = connectionBackupSchema.parse(value);
      const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(backup.nonce, "base64"));
      decipher.setAuthTag(Buffer.from(backup.tag, "base64"));
      const decoded = Buffer.concat([decipher.update(Buffer.from(backup.data, "base64")), decipher.final()]).toString("utf8");
      return backupContents.parse(JSON.parse(decoded));
    } catch {
      throw new DeploymentError("runtime", "connection_backup_invalid",
        "Choose an intact connection backup exported with this deployment's connection key.", [], 422);
    }
  }
  async read(): Promise<ConnectionSettings | null> {
    try {
      let text: string;
      try {
        text = await readFile(this.file, "utf8");
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
        throw error;
      }
      if (text.length > 140_000) throw unavailable();
      const value = JSON.parse(text);
      if (value.version !== 1) throw unavailable();
      const decipher = createDecipheriv(
        "aes-256-gcm",
        await this.key(),
        Buffer.from(value.nonce, "base64"),
      );
      decipher.setAuthTag(Buffer.from(value.tag, "base64"));
      return connectionSettingsSchema.parse(
        JSON.parse(
          Buffer.concat([
            decipher.update(Buffer.from(value.data, "base64")),
            decipher.final(),
          ]).toString("utf8"),
        ),
      );
    } catch {
      throw unavailable();
    }
  }
  async save(settings: ConnectionSettings) {
    const temp = join(this.directory, `connection-${randomUUID()}.tmp`);
    try {
      const nonce = randomBytes(12),
        cipher = createCipheriv("aes-256-gcm", await this.key(), nonce);
      const encrypted = Buffer.concat([
        cipher.update(
          JSON.stringify(connectionSettingsSchema.parse(settings)),
          "utf8",
        ),
        cipher.final(),
      ]);
      await writeFile(
        temp,
        JSON.stringify({
          version: 1,
          nonce: nonce.toString("base64"),
          data: encrypted.toString("base64"),
          tag: cipher.getAuthTag().toString("base64"),
        }),
        { mode: 0o600 },
      );
      await rename(temp, this.file);
    } catch {
      throw unavailable();
    } finally {
      await rm(temp, { force: true }).catch(() => {});
    }
  }
  async clear() {
    try {
      await rm(this.file, { force: true });
    } catch {
      throw unavailable();
    }
  }
}
