import { errorResponse } from "@/lib/api/response";

/** Two custom skills in one pack never share a name: it owns their folder and their SKILL.md name. */
export const duplicateNameResponse = (name: string) =>
  errorResponse(`A skill named "${name}" is already in this pack. Choose another name.`, "DUPLICATE_NAME", 409);
