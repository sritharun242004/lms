/** Expected failures of the Jobs data layer. Routes turn them into responses with jobErrorResponse. */
class NamedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = new.target.name;
  }
}

export class JobNotFoundError extends NamedError {
  constructor() {
    super("Task not found");
  }
}
export class FileNotFoundError extends NamedError {
  constructor() {
    super("File not found");
  }
}
export class SkillNotFoundError extends NamedError {
  constructor() {
    super("Skill not found");
  }
}
export class VersionNotFoundError extends NamedError {
  constructor() {
    super("Version not found");
  }
}
export class AlreadyAnalysingError extends NamedError {
  constructor() {
    super("This file is still being analysed");
  }
}
export class AlreadyGeneratingError extends NamedError {
  constructor() {
    super("A skill is being written");
  }
}
/** The plugin is being generated (a fresh claim): its names and skills are fixed until it finishes. */
export class PluginGeneratingError extends NamedError {
  constructor() {
    super("The plugin is being written");
  }
}
export class FilesAnalysingError extends NamedError {
  constructor() {
    super("Files are still being analysed");
  }
}
export class TooManyFilesError extends NamedError {
  constructor() {
    super("Too many files");
  }
}
/** Two uploads picked the same asset name at once, and the one retry with fresh names lost again. */
export class FileNameTakenError extends NamedError {
  constructor(readonly fileName: string) {
    super(`A file named "${fileName}" is being added`);
  }
}
export class TooManySkillsError extends NamedError {
  constructor() {
    super("Too many skills");
  }
}
/** The plugin's structure can't be generated (details.skills lists why, e.g. "Add at least 2 sub-skills."). */
export class PluginInvalidError extends NamedError {
  constructor(readonly reasons: string[]) {
    super("The plugin's structure is not valid");
  }
}
/** The main skill runs the whole plugin: it can be renamed, never removed. */
export class MainRequiredError extends NamedError {
  constructor() {
    super("The main skill can't be removed");
  }
}
export class EmptyDescriptionError extends NamedError {
  constructor() {
    super("The task has no description");
  }
}
export class NothingToDownloadError extends NamedError {
  constructor() {
    super("Nothing to download");
  }
}
export class AssetMissingError extends NamedError {
  constructor() {
    super("A bundled file is missing");
  }
}
/** The pack zip would exceed JOB_LIMITS.packZipBytes. zip.ts (Task 14) imports and re-exports this class. */
export class PackTooLargeError extends NamedError {
  constructor() {
    super("The pack is too large");
  }
}
export class DuplicateNameError extends NamedError {
  constructor(readonly skillName: string) {
    super(`A skill named "${skillName}" already exists`);
  }
}

export class QuestionNotFoundError extends NamedError {
  constructor() {
    super("Question not found");
  }
}
/** The target list (FIXED "Answer now" or PER_USE "Asked each time you use it") is at its cap. */
export class TooManyQuestionsError extends NamedError {
  constructor(readonly kind: "FIXED" | "PER_USE") {
    super(`Too many ${kind === "FIXED" ? "questions" : "per-use inputs"}`);
  }
}
/** Writing questions needs a description of at least JOB_LIMITS.descriptionMinChars (trimmed). */
export class DescriptionTooShortError extends NamedError {
  constructor(readonly length: number) {
    super("The task description is too short");
  }
}
/** Enhance needs at least JOB_LIMITS.enhanceMinWords words. */
export class EnhanceInputTooShortError extends NamedError {
  constructor() {
    super("Too few words to enhance");
  }
}

/** A PATCH renamed a per-use input past JOB_LIMITS.perUseLabelChars (the body alone cannot know the row's kind). */
export class PerUseLabelTooLongError extends NamedError {
  constructor() {
    super("Per-use label too long");
  }
}

/** A Prisma unique-index violation (P2002): a concurrent request won the race the app-level check lost. */
export const isUniqueViolation = (error: unknown): boolean =>
  typeof error === "object" && error !== null && (error as { code?: unknown }).code === "P2002";
