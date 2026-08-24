import { defineConfig } from "prisma/config";
import { getControlConfig } from "./server/config/control-config";

const url = new URL(getControlConfig().database.url);
url.searchParams.set("schema", "tasklattice");

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    url: url.toString(),
  },
});
