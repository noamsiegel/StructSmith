import { expect, test } from "bun:test";
import { canonical } from "../scripts/verify-service-migration";

test("migration comparison accepts only an empty annotations default under settings", () => {
  const legacy = { views: [{ id: "view", settings: { snapToGrid: true } }] };
  const candidate = { views: [{ id: "view", settings: { snapToGrid: true, annotations: [] } }] };
  expect(canonical(candidate)).toEqual(canonical(legacy));
  for (const annotations of [null, {}, "", [{ id: "note", text: "Keep me", x: 0, y: 0 }]]) {
    expect(
      canonical({ views: [{ id: "view", settings: { snapToGrid: true, annotations } }] }),
    ).not.toEqual(canonical(legacy));
  }
  expect(canonical({ annotations: [] })).not.toEqual(canonical({}));
  expect(canonical({ settings: { annotations: [], snapToGrid: false } })).not.toEqual(
    canonical({ settings: { snapToGrid: true } }),
  );
});

test("migration comparison preserves populated annotation content and layout exactly", () => {
  const annotation = {
    id: "table",
    kind: "table",
    x: 1,
    y: 2,
    width: 400,
    height: 200,
    cells: [["Source", "Ready"]],
    color: "#bbddff",
    sectionId: "section",
  };
  const document = { views: [{ id: "view", settings: { annotations: [annotation] } }] };
  expect(canonical(document)).toEqual(document);
  for (const patch of [
    { id: "other" },
    { x: 99 },
    { cells: [["Source", "Changed"]] },
    { color: "#000000" },
    { sectionId: null },
  ])
    expect(
      canonical({
        views: [{ id: "view", settings: { annotations: [{ ...annotation, ...patch }] } }],
      }),
    ).not.toEqual(canonical(document));
});

test("migration CLI verifies HTTP documents and fails if annotations gain content", async () => {
  let annotations: unknown[] = [];
  const serve = (candidate: boolean) =>
    Bun.serve({
      port: 0,
      fetch(request) {
        const path = new URL(request.url).pathname;
        if (path === "/api/workspaces")
          return Response.json({ workspaces: [{ id: "workspace", revision: 1 }] });
        if (path.endsWith("/document"))
          return Response.json({
            views: [{ id: "view", settings: candidate ? { annotations } : {} }],
          });
        return Response.json([]);
      },
    });
  const baseline = serve(false);
  const candidate = serve(true);
  const run = async () => {
    const child = Bun.spawn(
      ["bun", "scripts/verify-service-migration.ts", baseline.url.href, candidate.url.href],
      { stdout: "pipe", stderr: "pipe" },
    );
    return {
      exit: await child.exited,
      stdout: await new Response(child.stdout).text(),
      stderr: await new Response(child.stderr).text(),
    };
  };
  try {
    const unchanged = await run();
    expect(unchanged.exit).toBe(0);
    expect(unchanged.stdout).toContain("1 workspaces preserved");
    annotations = [{ id: "new", kind: "text", text: "Changed" }];
    const changed = await run();
    expect(changed.exit).toBe(1);
    expect(changed.stderr).toContain("workspace: document changed");
  } finally {
    baseline.stop(true);
    candidate.stop(true);
  }
});
