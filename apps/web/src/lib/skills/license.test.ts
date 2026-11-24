import { describe, expect, it } from "vitest";
import { classifyLicense, isPermissiveLicense } from "./license";

const APACHE = "                                 Apache License\n                           Version 2.0, January 2004\n                        http://www.apache.org/licenses/";
const MIT = "MIT License\n\nCopyright (c) 2025 Someone\n\nPermission is hereby granted, free of charge, to any person obtaining a copy\nof this software";
const ISC = "ISC License\n\nPermission to use, copy, modify, and/or distribute this software for any\npurpose with or without fee is hereby granted";
const BSD3 = "Redistribution and use in source and binary forms, with or without modification ... 3. Neither the name of the copyright holder";
const BSD2 = "Redistribution and use in source and binary forms, with or without modification, are permitted provided that";
const PROPRIETARY = "© 2025 Example, Inc. All rights reserved. Use of these materials is governed by your agreement.";

describe("classifyLicense", () => {
  it.each([
    [APACHE, "Apache-2.0"],
    [MIT, "MIT"],
    [ISC, "ISC"],
    [BSD3, "BSD-3-Clause"],
    [BSD2, "BSD-2-Clause"],
    [PROPRIETARY, "source-available"],
    ["   ", "NOASSERTION"],
    [null, "NOASSERTION"],
  ])("classifies %#", (text, expected) => {
    expect(classifyLicense(text)).toBe(expected);
  });
});

describe("isPermissiveLicense", () => {
  it("accepts only the permissive SPDX ids", () => {
    for (const id of ["Apache-2.0", "MIT", "BSD-2-Clause", "BSD-3-Clause", "ISC"]) expect(isPermissiveLicense(id)).toBe(true);
    for (const id of ["source-available", "NOASSERTION", "GPL-3.0", "apache-2.0", ""]) expect(isPermissiveLicense(id)).toBe(false);
  });
});
