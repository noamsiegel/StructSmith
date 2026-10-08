import { expect, test } from "bun:test";
import { ArchitectureOperationSchema } from "@structsmith/contracts";
import { presets } from "@structsmith/domain";
import { createTestContext, createWorkspace } from "../../../../../tests/helpers";
import { presetCreationOperations } from "./presetCreation";

test("toolbar creation adds and positions one selected preset without replacing existing view members", () => {
  const { services, close } = createTestContext();
  try {
    const workspace = createWorkspace(services);
    const existing = services.elements.create(workspace.id, {
      name: "Existing",
      kind: "action",
    }).result;
    const view = services.views.create(workspace.id, {
      name: "Flow",
      kind: "workflow",
      elementIds: [existing.id],
    }).result;
    const preset = presets.find((item) => item.id === "decision");
    if (!preset) throw new Error("Decision preset missing");
    const result = services.model.applyOperations(workspace.id, {
      label: "Add decision",
      operations: presetCreationOperations(preset, "Decision", view.id, null, {
        x: 1000,
        y: -200,
      }).map((op) => ArchitectureOperationSchema.parse(op)),
    });
    const createdId = result.appliedOperations.find((operation) => operation.ref === "created")?.id;
    if (!createdId) throw new Error("Created id missing");
    expect(
      services.elements.list(workspace.id).find((item) => item.id === createdId),
    ).toMatchObject({ name: "Decision", kind: "decision", role: null });
    const placed = services.views.get(view.id).elements;
    expect(placed.map((item) => item.elementId).sort()).toEqual([existing.id, createdId].sort());
    expect(placed.find((item) => item.elementId === createdId)).toMatchObject({
      x: 890,
      y: -248,
      hidden: false,
    });
    expect(result.snapshotId).toBeTruthy();
  } finally {
    close();
  }
});

test("palette boundary placement adds membership and rejects missing boundaries without creating orphan elements", () => {
  const { services, close } = createTestContext();
  try {
    const workspace = createWorkspace(services);
    const view = services.views.create(workspace.id, { name: "Flow", kind: "workflow" }).result;
    const boundary = services.boundaries.create(workspace.id, {
      viewId: view.id,
      name: "Stage",
      kind: "custom",
    }).result;
    const preset = presets.find((item) => item.id === "action");
    if (!preset) throw new Error("Action preset missing");
    const result = services.model.applyOperations(workspace.id, {
      label: "Add in stage",
      operations: presetCreationOperations(preset, "Action", view.id, boundary.id).map((op) =>
        ArchitectureOperationSchema.parse(op),
      ),
    });
    const createdId = result.appliedOperations.find((operation) => operation.ref === "created")?.id;
    if (!createdId) throw new Error("Created id missing");
    expect(
      services.boundaries.list(view.id).find((item) => item.id === boundary.id)?.elementIds,
    ).toEqual([createdId]);
    expect(() =>
      services.model.applyOperations(workspace.id, {
        label: "Fail atomically",
        operations: presetCreationOperations(preset, "Orphan", view.id, "missing").map((op) =>
          ArchitectureOperationSchema.parse(op),
        ),
      }),
    ).toThrow();
    expect(services.elements.list(workspace.id).map((item) => item.name)).toEqual(["Action"]);
  } finally {
    close();
  }
});
