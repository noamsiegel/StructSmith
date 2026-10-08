import assert from "node:assert/strict";

const [baseline, candidate] = process.argv.slice(2);
if (!baseline || !candidate) {
  throw new Error("Usage: bun scripts/verify-service-migration.ts BASELINE_URL CANDIDATE_URL");
}

async function read(base: string, path: string): Promise<unknown> {
  const response = await fetch(new URL(path, base));
  if (!response.ok) throw new Error(`${path}: HTTP ${response.status}`);
  return response.json();
}

function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([key, item]) => key !== "presentation" || item !== null)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, item]) => [key, canonical(item)]),
    );
  }
  return value;
}

const before = (await read(baseline, "/api/workspaces")) as { workspaces: { id: string }[] };
const after = await read(candidate, "/api/workspaces");
assert.deepEqual(canonical(after), canonical(before), "Workspace identities or metadata changed");
for (const workspace of before.workspaces) {
  for (const suffix of ["document", "snapshots", "activity?limit=100000"]) {
    const path = `/api/workspaces/${encodeURIComponent(workspace.id)}/${suffix}`;
    const [left, right]: [unknown, unknown] = await Promise.all([read(baseline, path), read(candidate, path)]);
    assert.deepEqual(canonical(right), canonical(left), `${workspace.id}: ${suffix} changed`);
  }
  console.log(`${workspace.id}: document, snapshots and activity unchanged`);
}
console.log(`${before.workspaces.length} workspaces preserved`);
