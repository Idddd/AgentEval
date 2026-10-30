import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  randomUUID,
} from "node:crypto";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import {
  connectionSettingsSchema,
  type ConnectionSettings,
} from "./nmgr-connection-config";
import { DeploymentError } from "./diagnostics";

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
