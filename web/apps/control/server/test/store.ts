import { ProjectStore } from "../projects/project-store";
import { createTestPrisma } from "./prisma";

export function createTestStore(projectId = "individual"): ProjectStore {
  return new ProjectStore(projectId, createTestPrisma());
}
