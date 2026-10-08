import { expect, test } from "bun:test";
import { previewDestination, previewView } from "../apps/web/src/features/navigation/preview";
import { createTestContext, createWorkspace } from "./helpers";

function fixture() {
  const context = createTestContext();
  const { services } = context;
  const workspace = createWorkspace(services);
  const scope = services.elements.create(workspace.id, {
    kind: "workflowGroup",
    name: "Capture",
  }).result;
  const first = services.elements.create(workspace.id, {
    kind: "action",
    name: "Fetch every ledger for the authenticated portal login",
    parentId: scope.id,
  }).result;
  const second = services.elements.create(workspace.id, {
    kind: "action",
    name: "Verify the ledger identity before storing evidence",
    parentId: scope.id,
  }).result;
  const relationship = services.relationships.create(workspace.id, {
    sourceElementId: first.id,
    targetElementId: second.id,
    description: "Captured ledger evidence",
  }).result;
  const home = services.views.create(workspace.id, {
    kind: "workflow",
    name: "Overview",
    elementIds: [scope.id],
  }).result;
  return { ...context, workspace, scope, first, second, relationship, home };
}

test("unsaved preview lays out the existing children without changing the overview or model", () => {
  const f = fixture();
  try {
    const source = f.services.views.get(f.home.id);
    const before = structuredClone(f.services.model.getDocument(f.workspace.id));
    const preview = previewView(
      f.scope,
      source,
      f.services.elements.list(f.workspace.id),
      f.services.relationships.list(f.workspace.id),
    );
    expect(preview.id).toBe(`preview:${f.scope.id}`);
    expect(preview.scopeElementId).toBe(f.scope.id);
    expect(preview.elements.map((entry) => entry.elementId)).toEqual([f.first.id, f.second.id]);
    expect(preview.elements[0]?.x).toBeLessThan(preview.elements[1]?.x ?? 0);
    expect(preview.settings.showFullTitles).toBe(true);
    expect(preview.settings.showRelationshipLabels).toBe(true);
    expect(source).toEqual(f.services.views.get(f.home.id));
    expect(f.services.model.getDocument(f.workspace.id)).toEqual(before);
  } finally {
    f.close();
  }
});

test("saved previews preserve coordinates, sections and connector presentation without mutating settings", () => {
  const f = fixture();
  try {
    const detail = f.services.views.create(f.workspace.id, {
      kind: "workflow",
      name: "Capture detail",
      scopeElementId: f.scope.id,
      elementIds: [f.first.id, f.second.id],
      settings: { boundaryLayer: "custom", showFullTitles: false, showRelationshipLabels: false },
    }).result;
    f.services.views.saveLayout(f.workspace.id, detail.id, [
      { elementId: f.first.id, x: 512, y: 218, width: 300 },
      { elementId: f.second.id, x: 1024, y: 218 },
    ]);
    f.services.boundaries.create(f.workspace.id, {
      viewId: detail.id,
      kind: "custom",
      layer: "custom",
      name: "Evidence",
      elementIds: [f.first.id, f.second.id],
    });
    f.services.model.applyOperations(
      f.workspace.id,
      {
        operations: [
          {
            op: "setViewRelationships",
            viewId: detail.id,
            relationships: [
              {
                relationshipId: f.relationship.id,
                controlPoints: [{ x: 900, y: 350 }],
                presentation: { color: "#336699" },
              },
            ],
          },
        ],
      },
      "ui",
    );
    const saved = f.services.views.get(detail.id);
    const before = structuredClone(saved);
    const result = previewView(
      f.scope,
      f.services.views.get(f.home.id),
      f.services.elements.list(f.workspace.id),
      f.services.relationships.list(f.workspace.id),
      saved,
    );
    expect(result.id).toBe(detail.id);
    expect(result.elements).toEqual(before.elements);
    expect(result.boundaries).toEqual(before.boundaries);
    expect(result.relationships).toEqual(before.relationships);
    expect(result.settings.showFullTitles).toBe(true);
    expect(result.settings.showRelationshipLabels).toBe(true);
    expect(saved).toEqual(before);
    expect(f.services.views.get(detail.id)).toEqual(before);
  } finally {
    f.close();
  }
});

test("preview destinations honor valid preferences and ignore unrelated or deleted views", () => {
  const f = fixture();
  try {
    const first = f.services.views.create(f.workspace.id, {
      kind: "workflow",
      name: "A capture",
      scopeElementId: f.scope.id,
    }).result;
    const second = f.services.views.create(f.workspace.id, {
      kind: "workflow",
      name: "B capture",
      scopeElementId: f.scope.id,
    }).result;
    const source = f.services.views.get(f.home.id);
    const views = f.services.views.list(f.workspace.id);
    expect(previewDestination(f.scope, views, source)?.id).toBe(first.id);
    source.settings.preferredDetailViews[f.scope.id] = second.id;
    expect(previewDestination(f.scope, views, source)?.id).toBe(second.id);
    source.settings.preferredDetailViews[f.scope.id] = source.id;
    expect(previewDestination(f.scope, views, source)?.id).toBe(first.id);
    expect(
      previewDestination(
        f.scope,
        views.filter((view) => view.id === source.id),
        source,
      ),
    ).toBeNull();
  } finally {
    f.close();
  }
});
