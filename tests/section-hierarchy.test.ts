import { describe, expect, test } from "bun:test";
import { validateDocument } from "@structsmith/domain";
import { createTestContext, createWorkspace } from "./helpers";

describe("Section hierarchy", () => {
  test("rejects non-Section parents through direct and atomic boundary writes", () => {
    const { services, close } = createTestContext();
    try {
      const workspace = createWorkspace(services);
      const view = services.views.create(workspace.id, { kind: "custom", name: "Overview" }).result;
      const zone = services.boundaries.create(workspace.id, {
        viewId: view.id,
        kind: "networkZone",
        layer: "custom",
        name: "Network",
      }).result;
      const section = services.boundaries.create(workspace.id, {
        viewId: view.id,
        kind: "custom",
        layer: "custom",
        name: "Capture",
      }).result;
      const before = services.model.getDocument(workspace.id);
      expect(() =>
        services.boundaries.create(workspace.id, {
          viewId: view.id,
          kind: "custom",
          layer: "custom",
          parentBoundaryId: zone.id,
          name: "Invalid Section",
        }),
      ).toThrow("Sections can only be nested inside other Sections");
      expect(() =>
        services.boundaries.update(workspace.id, section.id, {
          parentBoundaryId: zone.id,
        }),
      ).toThrow("Sections can only be nested inside other Sections");
      const operations = [
        {
          op: "updateBoundary" as const,
          boundaryId: section.id,
          data: { parentBoundaryId: zone.id },
        },
      ];
      expect(() => services.model.previewOperations(workspace.id, { operations })).toThrow(
        "Sections can only be nested inside other Sections",
      );
      expect(() => services.model.applyOperations(workspace.id, { operations })).toThrow(
        "Sections can only be nested inside other Sections",
      );
      expect(services.model.getDocument(workspace.id)).toEqual(before);
    } finally {
      close();
    }
  });

  test("checks kind changes on both the Section and its parent while preserving architecture nesting", () => {
    const { services, close } = createTestContext();
    try {
      const workspace = createWorkspace(services);
      const view = services.views.create(workspace.id, { kind: "custom", name: "Overview" }).result;
      const parent = services.boundaries.create(workspace.id, {
        viewId: view.id,
        kind: "custom",
        name: "Capture",
      }).result;
      const section = services.boundaries.create(workspace.id, {
        viewId: view.id,
        kind: "custom",
        name: "Replay",
        parentBoundaryId: parent.id,
      }).result;
      expect(section.parentBoundaryId).toBe(parent.id);
      expect(() =>
        services.boundaries.update(workspace.id, parent.id, {
          kind: "environment",
        }),
      ).toThrow("A boundary containing Sections must remain a Section");
      expect(services.boundaries.list(view.id).find((item) => item.id === parent.id)?.kind).toBe(
        "custom",
      );
      services.boundaries.update(workspace.id, section.id, { kind: "networkZone" });
      services.boundaries.update(workspace.id, parent.id, { kind: "environment" });
      expect(() =>
        services.boundaries.update(workspace.id, section.id, {
          kind: "custom",
        }),
      ).toThrow("Sections can only be nested inside other Sections");
      expect(services.model.validate(workspace.id).valid).toBe(true);
      expect(services.boundaries.list(view.id).map((item) => item.kind)).toEqual([
        "environment",
        "networkZone",
      ]);
    } finally {
      close();
    }
  });

  test("validates hierarchy and rejects invalid native imports before changing any workspace", () => {
    const { services, close } = createTestContext();
    try {
      const workspace = createWorkspace(services);
      const view = services.views.create(workspace.id, { kind: "custom", name: "Overview" }).result;
      const parent = services.boundaries.create(workspace.id, {
        viewId: view.id,
        kind: "custom",
        name: "Capture",
      }).result;
      const section = services.boundaries.create(workspace.id, {
        viewId: view.id,
        parentBoundaryId: parent.id,
        kind: "custom",
        name: "Replay",
      }).result;
      const before = services.model.getDocument(workspace.id);
      const invalid = {
        ...before,
        views: before.views.map((entry) => ({
          ...entry,
          boundaries: entry.boundaries.map((boundary) =>
            boundary.id === parent.id ? { ...boundary, kind: "networkZone" as const } : boundary,
          ),
        })),
      };
      const validation = validateDocument(invalid);
      expect(validation.valid).toBe(false);
      expect(validation.issues).toContainEqual({
        level: "error",
        code: "SECTION_PARENT_KIND",
        message: 'Section "Replay" can only be nested inside another Section.',
        boundaryId: section.id,
        viewId: view.id,
      });
      for (const mode of ["new", "overwrite"] as const) {
        expect(() => services.imports.importDocument(invalid, { mode })).toThrow(
          "Sections can only be nested inside other Sections",
        );
      }
      expect(services.workspaces.list()).toHaveLength(1);
      expect(services.model.getDocument(workspace.id)).toEqual(before);
      const imported = services.imports.importDocument(before);
      expect(services.model.validate(imported.id).valid).toBe(true);
    } finally {
      close();
    }
  });

  test("allows top-level Sections in a subprocess detail view without changing semantic parents", () => {
    const { services, close } = createTestContext();
    try {
      const workspace = createWorkspace(services);
      const subprocess = services.elements.create(workspace.id, {
        kind: "workflowGroup",
        name: "Capture",
      }).result;
      const step = services.elements.create(workspace.id, {
        kind: "action",
        name: "Replay",
        parentId: subprocess.id,
      }).result;
      const view = services.views.create(workspace.id, {
        kind: "custom",
        scopeElementId: subprocess.id,
        name: "Capture details",
        elementIds: [step.id],
      }).result;
      const section = services.boundaries.create(workspace.id, {
        viewId: view.id,
        kind: "custom",
        layer: "custom",
        name: "Portal replay",
        elementIds: [step.id],
      }).result;
      expect(section.parentBoundaryId).toBeNull();
      expect(section.elementIds).toEqual([step.id]);
      expect(
        services.elements.list(workspace.id).find((item) => item.id === step.id)?.parentId,
      ).toBe(subprocess.id);
      expect(services.model.validate(workspace.id).valid).toBe(true);
    } finally {
      close();
    }
  });
});
