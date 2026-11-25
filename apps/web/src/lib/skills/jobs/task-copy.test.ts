import { describe, expect, it } from "vitest";
import { renderReadme } from "../pack-docs";
import * as E from "./errors";
import { jobErrorResponse, notFound } from "./http";

async function message(res: Response | null) {
  return (await res!.json()).error.message as string;
}

describe("server copy says Task", () => {
  it("names the task in errors", async () => {
    expect(await message(notFound("Task"))).toBe("Task not found");
    expect(await message(jobErrorResponse(new E.JobNotFoundError()))).toBe("Task not found");
    expect(await message(jobErrorResponse(new E.AlreadyGeneratingError()))).toBe("A skill in this task is being written. Wait for it to finish.");
    expect(await message(jobErrorResponse(new E.TooManyFilesError()))).toBe("A task can have at most 10 files. Remove one to add another.");
    expect(await message(jobErrorResponse(new E.TooManySkillsError()))).toBe("A task can have at most 7 skills. Remove one to add another.");
    expect(await message(jobErrorResponse(new E.DuplicateNameError("a")))).toBe('A skill named "a" is already in this task. Choose another name.');
    expect(await message(jobErrorResponse(new E.EmptyDescriptionError()))).toBe("Describe the task first.");
    expect(new E.JobNotFoundError().message).toBe("Task not found");
  });

  it("writes a README without the word job", () => {
    const readme = renderReadme({ title: "Client SLA", description: "I write SLAs.", role: null, skills: [{ name: "client-sla", purpose: "Writes it." }], hasAssets: false });
    expect(readme).toContain("## What this task is");
    expect(readme).toContain("Just ask Claude for the task");
    expect(readme).not.toMatch(/\bjobs?\b/i);
  });

});
