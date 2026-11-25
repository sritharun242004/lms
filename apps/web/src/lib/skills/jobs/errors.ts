/** Expected failures of the Jobs data layer. Routes turn them into responses with jobErrorResponse. */
class NamedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = new.target.name;
  }
}

export class JobNotFoundError extends NamedError {
  constructor() {
    super("Job not found");
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
export class EmptyDescriptionError extends NamedError {
  constructor() {
    super("The job has no description");
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

/** A Prisma unique-index violation (P2002): a concurrent request won the race the app-level check lost. */
export const isUniqueViolation = (error: unknown): boolean =>
  typeof error === "object" && error !== null && (error as { code?: unknown }).code === "P2002";
