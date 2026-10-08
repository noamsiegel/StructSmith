import { expect, test } from "bun:test";
import { UpdateViewSchema } from "@structsmith/contracts";
import { createTestContext, createWorkspace } from "./helpers";

test("settings trust boundary validates remembered details and scenarios atomically", () => {
  const { services, close } = createTestContext();
  try {
    const workspace = createWorkspace(services);
    const group = services.elements.create(workspace.id, {
      name: "Group",
      kind: "workflowGroup",
    }).result;
    const child = services.elements.create(workspace.id, {
      name: "Child",
      kind: "action",
      parentId: group.id,
    }).result;
    const view = services.views.create(workspace.id, {
      name: "Home",
      kind: "workflow",
      elementIds: [group.id],
    }).result;
    const detail = services.views.create(workspace.id, {
      name: "Details",
      kind: "workflow",
      scopeElementId: group.id,
      elementIds: [child.id],
    }).result;
    const patch = UpdateViewSchema.parse({
      settings: {
        preferredDetailViews: { [group.id]: detail.id },
        scenarios: [
          { id: "happy", name: "Happy path", steps: [{ elementId: group.id, title: "Begin" }] },
        ],
      },
    });
    services.views.update(workspace.id, view.id, patch);
    expect(services.views.get(view.id).settings.preferredDetailViews).toEqual({
      [group.id]: detail.id,
    });
    expect(services.views.get(view.id).settings.scenarios[0]?.steps[0]?.elementId).toBe(group.id);
    const before = services.workspaces.get(workspace.id).revision;
    expect(() =>
      services.views.update(workspace.id, view.id, {
        settings: {
          scenarios: [
            { id: "bad", name: "Bad", steps: [{ elementId: child.id, title: "Outside" }] },
          ],
        },
      }),
    ).toThrow("must exist in this workspace and view");
    expect(() =>
      services.views.update(workspace.id, view.id, {
        settings: { preferredDetailViews: { [child.id]: detail.id } },
      }),
    ).toThrow("Preferred details");
    expect(services.workspaces.get(workspace.id).revision).toBe(before);
    const snapshot = services.snapshots.create(workspace.id, "Exploration");
    services.views.update(workspace.id, view.id, { settings: { scenarios: [] } });
    services.snapshots.restore(snapshot.id);
    expect(services.views.get(view.id).settings.scenarios[0]?.id).toBe("happy");
  } finally {
    close();
  }
});

test("removing or deleting an attached card preserves its comment's canvas location and undo", () => {
  for (const mode of ["remove", "replace", "delete"] as const) {
    const { services, close } = createTestContext();
    try {
      const workspace = createWorkspace(services);
      const element = services.elements.create(workspace.id, {
        name: "Card",
        kind: "action",
      }).result;
      const view = services.views.create(workspace.id, {
        name: "Home",
        kind: "workflow",
        elementIds: [element.id],
      }).result;
      services.views.saveLayout(workspace.id, view.id, [{ elementId: element.id, x: 200, y: 300 }]);
      services.model.applyOperations(
        workspace.id,
        {
          operations: [
            {
              op: "addViewComment",
              viewId: view.id,
              data: { x: 20, y: 10, text: "Attached", elementId: element.id },
            },
          ],
        },
        "ui",
      );
      const before = services.snapshots.create(workspace.id, "Attached");
      if (mode === "delete") services.elements.delete(workspace.id, element.id);
      else
        services.views.setElements(
          workspace.id,
          view.id,
          mode === "replace" ? [] : [element.id],
          mode,
        );
      expect(services.views.get(view.id).settings.commentPins[0]).toMatchObject({
        x: 220,
        y: 310,
        elementId: null,
        text: "Attached",
      });
      services.snapshots.restore(before.id);
      expect(services.views.get(view.id).settings.commentPins[0]).toMatchObject({
        x: 20,
        y: 10,
        elementId: element.id,
      });
    } finally {
      close();
    }
  }
});
