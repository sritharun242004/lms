/** Shared display helpers for the Jobs flow (pure: safe for client components). */
export const megabytes = (bytes: number) => `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
