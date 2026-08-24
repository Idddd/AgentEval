import { describe, expect, it } from "vitest";
import { selectInitialProject } from "./project-context";
import type { Project } from "@/types/project";

const projects: Project[] = [
  {
    id: "individual",
    name: "admin",
    type: "personal",
    memberCount: 1,
    role: "admin",
  },
  {
    id: "devops",
    name: "DevOps Team",
    type: "team",
    memberCount: 8,
    role: "member",
  },
];

describe("selectInitialProject", () => {
  it("prefers the URL project over stored state", () => {
    expect(selectInitialProject(projects, "devops", "individual").id).toBe(
      "devops",
    );
  });

  it("uses stored state when the URL project is unavailable", () => {
    expect(selectInitialProject(projects, null, "devops").id).toBe(
      "devops",
    );
  });

  it("falls back to the personal project when the URL project is invalid", () => {
    expect(selectInitialProject(projects, "missing", "devops").id).toBe(
      "individual",
    );
  });

  it("falls back to the personal project when no preference exists", () => {
    expect(selectInitialProject([...projects].reverse(), null, null).id).toBe(
      "individual",
    );
  });

  it("rejects an empty project list instead of inventing a client-side project", () => {
    expect(() => selectInitialProject([], null, null)).toThrow(
      "No project available.",
    );
  });
});
