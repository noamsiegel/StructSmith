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

test("cloning remaps attached comments, detail preferences and scenario steps to the new workspace", () => {
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
    const edge = services.relationships.create(workspace.id, {
      sourceElementId: group.id,
      targetElementId: child.id,
    }).result;
    const home = services.views.create(workspace.id, {
      name: "Home",
      kind: "workflow",
      elementIds: [group.id, child.id],
    }).result;
    const detail = services.views.create(workspace.id, {
      name: "Details",
      kind: "workflow",
      scopeElementId: group.id,
      elementIds: [child.id],
    }).result;
    services.views.update(workspace.id, home.id, {
      settings: {
        preferredDetailViews: { [group.id]: detail.id },
        scenarios: [
          {
            id: "flow",
            name: "Flow",
            steps: [
              { elementId: group.id, title: "Start" },
              { elementId: child.id, title: "Finish", relationshipId: edge.id },
            ],
          },
        ],
      },
    });
    services.model.applyOperations(
      workspace.id,
      {
        operations: [
          {
            op: "addViewComment",
            viewId: home.id,
            data: { text: "Attached", x: 10, y: 20, elementId: group.id },
          },
        ],
      },
      "ui",
    );
    const copy = services.imports.importDocument(services.model.getDocument(workspace.id), {
      mode: "new",
      name: "Copy",
    });
    const copiedElements = services.model.get(copy.id).elements;
    const copiedGroup = copiedElements.find((element) => element.name === "Group");
    const copiedChild = copiedElements.find((element) => element.name === "Child");
    const copiedView = services.views.listDetailed(copy.id).find((view) => view.name === "Home");
    const copiedDetail = services.views.list(copy.id).find((view) => view.name === "Details");
    if (!copiedGroup || !copiedChild || !copiedView || !copiedDetail)
      throw new Error("Missing cloned objects");
    expect(copiedView.settings.commentPins[0]?.elementId).toBe(copiedGroup?.id);
    expect(copiedGroup?.id).not.toBe(group.id);
    expect(copiedView?.settings.preferredDetailViews[copiedGroup?.id ?? ""]).toBe(copiedDetail?.id);
    expect(copiedView?.settings.scenarios[0]?.steps.map((step) => step.elementId)).toEqual([
      copiedGroup?.id,
      copiedChild?.id,
    ]);
    expect(copiedView?.settings.scenarios[0]?.steps[1]?.relationshipId).toBe(
      services.model.get(copy.id).relationships[0]?.id,
    );
  } finally {
    close();
  }
});

test("removing detail destinations or source objects clears only their remembered links", () => {
  for (const mode of ["view", "element", "remove", "replace"] as const) {
    const { services, close } = createTestContext();
    try {
      const workspace = createWorkspace(services);
      const first = services.elements.create(workspace.id, {
        kind: "workflowGroup",
        name: "First",
      }).result;
      const second = services.elements.create(workspace.id, {
        kind: "workflowGroup",
        name: "Second",
      }).result;
      const home = services.views.create(workspace.id, {
        kind: "workflow",
        name: "Home",
        elementIds: [first.id, second.id],
      }).result;
      const detail1 = services.views.create(workspace.id, {
        kind: "workflow",
        name: "First details",
        scopeElementId: first.id,
      }).result;
      const detail2 = services.views.create(workspace.id, {
        kind: "workflow",
        name: "Second details",
        scopeElementId: second.id,
      }).result;
      services.views.update(workspace.id, home.id, {
        settings: { preferredDetailViews: { [first.id]: detail1.id, [second.id]: detail2.id } },
      });
      const snapshot = services.snapshots.create(workspace.id, "Before removing preference");
      if (mode === "view") services.views.delete(workspace.id, detail1.id);
      else if (mode === "element") services.elements.delete(workspace.id, first.id);
      else
        services.views.setElements(
          workspace.id,
          home.id,
          mode === "remove" ? [first.id] : [second.id],
          mode,
        );
      const saved = services.views.get(home.id).settings.preferredDetailViews;
      expect(saved).toEqual({ [second.id]: detail2.id });
      expect(() =>
        services.views.update(workspace.id, home.id, {
          settings: { preferredDetailViews: { ...saved, [second.id]: detail2.id } },
        }),
      ).not.toThrow();
      services.snapshots.restore(snapshot.id);
      expect(services.views.get(home.id).settings.preferredDetailViews).toEqual({
        [first.id]: detail1.id,
        [second.id]: detail2.id,
      });
    } finally {
      close();
    }
  }
});

test("unchanged stale scenarios remain repairable and individually deletable", () => {
  const { services, close } = createTestContext();
  try {
    const workspace = createWorkspace(services);
    const removed = services.elements.create(workspace.id, {
      kind: "action",
      name: "Removed",
    }).result;
    const valid = services.elements.create(workspace.id, { kind: "action", name: "Valid" }).result;
    const view = services.views.create(workspace.id, {
      kind: "workflow",
      name: "Home",
      elementIds: [removed.id, valid.id],
    }).result;
    const scenarios = ["first", "second"].map((id) => ({
      id,
      name: id,
      steps: [{ elementId: removed.id, title: "Start" }],
    }));
    const second = scenarios[1];
    if (!second) throw new Error("Missing second scenario");
    services.views.update(workspace.id, view.id, { settings: { scenarios } });
    services.elements.delete(workspace.id, removed.id);
    const repaired = {
      id: "first",
      name: "Repaired",
      steps: [{ elementId: valid.id, title: "Start" }],
    };
    services.views.update(workspace.id, view.id, {
      settings: { scenarios: [repaired, second] },
    });
    expect(services.views.get(view.id).settings.scenarios[0]?.name).toBe("Repaired");
    services.views.update(workspace.id, view.id, {
      settings: { scenarios: [second] },
    });
    expect(services.views.get(view.id).settings.scenarios).toHaveLength(1);
    expect(() =>
      services.views.update(workspace.id, view.id, {
        settings: {
          scenarios: [
            {
              id: "third",
              name: "New invalid",
              steps: [{ elementId: removed.id, title: "Start" }],
            },
          ],
        },
      }),
    ).toThrow("must exist");
    expect(() =>
      services.views.update(workspace.id, view.id, {
        settings: {
          scenarios: [
            {
              ...scenarios[1],
              id: "second",
              name: "Changed but still invalid",
              steps: [{ elementId: removed.id, title: "Start" }],
            },
          ],
        },
      }),
    ).toThrow("must exist");
    services.views.update(workspace.id, view.id, { settings: { scenarios: [] } });
    expect(services.views.get(view.id).settings.scenarios).toEqual([]);
  } finally {
    close();
  }
});
