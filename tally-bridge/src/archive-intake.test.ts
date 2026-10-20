import assert from "node:assert/strict";
import test from "node:test";
import { buildInspection, parse7zListing } from "./archive-intake.js";

const listing = `Listing archive: backup.rar
--
Path = backup.rar
Type = Rar
Physical Size = 800

Path = Company One/10000
Size = 1200
Packed Size = 400
Attributes = A
Folder = -

Path = Company One/Ledgers.xml
Size = 2048
Packed Size = 600
Attributes = A
Folder = -

Path = Company Two/Company.900
Size = 8192
Packed Size = 2000
Attributes = A
Folder = -

Path = Company Two
Size = 0
Packed Size = 0
Attributes = D
Folder = +
`;

test("parses file and directory entries from a 7-Zip technical listing", () => {
  const entries = parse7zListing(listing);
  assert.equal(entries.length, 4);
  assert.equal(entries.find((entry) => entry.path.endsWith("10000"))?.size, 1200);
  assert.equal(entries.find((entry) => entry.path === "Company Two")?.directory, true);
});

test("rejects parent traversal before extraction", () => {
  assert.throws(() => parse7zListing(`Path = ../outside.txt
Size = 5
Attributes = A
Folder = -`), /Unsafe archive path/);
});

test("rejects Windows absolute paths before extraction", () => {
  assert.throws(() => parse7zListing(`Path = C:\\Windows\\system.ini
Size = 5
Attributes = A
Folder = -`), /Unsafe archive path/);
});

test("enforces expansion and entry limits", () => {
  assert.throws(() => parse7zListing(`Path = big.dat
Size = 500
Attributes = A
Folder = -`, { maxExpandedBytes: 100 }), /expands beyond/);
  assert.throws(() => parse7zListing(listing, { maxEntries: 2 }), /entry safety limit/);
});

test("identifies native Tally data and refuses to call it XML", () => {
  const entries = parse7zListing(listing);
  const inspection = buildInspection("backup.rar", 800, entries);
  assert.equal(inspection.requiresTallyRestore, false);
  assert.ok(inspection.tallyLikeFiles.some((file) => file.kind === "xml-export"));
  assert.ok(inspection.tallyLikeFiles.some((file) => file.kind === "native-data"));
  assert.ok(inspection.warnings.some((warning) => warning.includes("Mixed XML and native-data")));
});

test("native-only archive requires a Tally restore/export bridge", () => {
  const inspection = buildInspection("native.rar", 500, [
    { path: "Company/10000", size: 100, directory: false },
    { path: "Company/Company.900", size: 400, directory: false },
  ]);
  assert.equal(inspection.requiresTallyRestore, true);
  assert.ok(inspection.warnings.some((warning) => warning.includes("Restore/open")));
});
