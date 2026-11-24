/** SPDX ids whose terms allow redistributing a skill inside a pack together with its license file. */
export const PERMISSIVE_LICENSES = ["Apache-2.0", "MIT", "BSD-2-Clause", "BSD-3-Clause", "ISC"] as const;

export const isPermissiveLicense = (license: string): boolean => (PERMISSIVE_LICENSES as readonly string[]).includes(license);

/**
 * Classifies the text of a LICENSE file. Anything that is not clearly one of the
 * permissive licenses is "source-available" (a file exists but is not one of them);
 * no file at all is SPDX's "NOASSERTION". Both mean link only.
 */
export function classifyLicense(text: string | null): string {
  if (text === null || !text.trim()) return "NOASSERTION";
  const t = text.replace(/\s+/g, " ");
  if (/Apache License,? Version 2\.0/i.test(t)) return "Apache-2.0";
  if (/Permission is hereby granted, free of charge, to any person obtaining a copy/i.test(t)) return "MIT";
  if (/Permission to use, copy, modify, and\/or distribute this software for any purpose with or without fee is hereby granted/i.test(t)) return "ISC";
  if (/Redistribution and use in source and binary forms/i.test(t)) return /Neither the name/i.test(t) ? "BSD-3-Clause" : "BSD-2-Clause";
  return "source-available";
}
