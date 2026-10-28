import { databaseConfig } from "./config";
import { MariaDbPersistence } from "./mariadb";
import { PostgresPersistence } from "./postgres";

export function openDatabase(env: NodeJS.ProcessEnv) {
  return databaseConfig(env).dialect === "postgresql" ? PostgresPersistence.open(env) : MariaDbPersistence.open(env);
}
