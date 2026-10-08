import { expect, test } from "bun:test";
import { once } from "node:events";
import express from "express";
import { seedUiDemo } from "../../../../scripts/seed-ui-demo";
import { buildUiDemoDocument } from "../../../../scripts/ui-demo-fixture";
import { createTestContext } from "../../../../tests/helpers";
import { errorMiddleware } from "../http-errors";
import { modelRoutes } from "./model";
import { workspaceRoutes } from "./workspaces";

test("demo seed preserves edits, snapshots reset, and never changes other workspaces", async () => {
  const { services, close } = createTestContext();
  const app = express();
  app.use(express.json({ limit: "5mb" }));
  app.use("/api", workspaceRoutes(services));
  app.use("/api", modelRoutes(services));
  app.use(errorMiddleware);
  const server = app.listen(0, "127.0.0.1");
  try {
    await once(server, "listening");
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("Missing server address");
    const baseUrl = `http://127.0.0.1:${address.port}`;
    const real = services.workspaces.create({ name: "Real diagram" });
    const original = services.model.getDocument(real.id);
    const seeded = await seedUiDemo(baseUrl);
    const baseline = buildUiDemoDocument();
    const first = services.model.getDocument(seeded.id);
    expect(first.elements).toEqual(baseline.elements);
    const sortedViews = (views: typeof baseline.views) =>
      [...views].sort((a, b) => a.id.localeCompare(b.id));
    expect(sortedViews(first.views)).toEqual(sortedViews(baseline.views));
    services.workspaces.update(seeded.id, { description: "Manual test edits" });
    const edited = services.model.getDocument(seeded.id);
    expect(await seedUiDemo(baseUrl)).toEqual(edited.workspace);
    expect(services.model.getDocument(seeded.id)).toEqual(edited);
    const reset = await seedUiDemo(baseUrl, true);
    expect(reset.revision).toBe(edited.workspace.revision + 1);
    expect(sortedViews(services.model.getDocument(seeded.id).views)).toEqual(
      sortedViews(baseline.views),
    );
    const snapshot = services.snapshots
      .list(seeded.id)
      .find((s) => s.label === "Before UI demo reset");
    expect(snapshot).toBeDefined();
    if (!snapshot) throw new Error("Missing reset snapshot");
    services.snapshots.restore(snapshot.id, "ui");
    expect(services.model.getDocument(seeded.id).workspace.description).toBe("Manual test edits");
    expect(services.model.getDocument(real.id)).toEqual(original);
    expect(services.workspaces.list()).toHaveLength(2);
    services.workspaces.update(seeded.id, { name: "Unrelated workspace" });
    const unrelated = services.model.getDocument(seeded.id);
    await expect(seedUiDemo(baseUrl, true)).rejects.toThrow("Refusing to replace unrelated");
    expect(services.model.getDocument(seeded.id)).toEqual(unrelated);
    services.workspaces.delete(seeded.id);
    services.workspaces.create({ id: baseline.workspace.id, name: baseline.workspace.name });
    await expect(seedUiDemo(baseUrl)).rejects.toThrow("seed is incomplete");
    expect(services.model.getDocument(seeded.id).views).toHaveLength(0);
    await seedUiDemo(baseUrl, true);
    expect(services.model.getDocument(seeded.id).views).toHaveLength(baseline.views.length);
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
    close();
  }
});
