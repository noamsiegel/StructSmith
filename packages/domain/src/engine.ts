import type {
  AddViewCommentInput,
  AddViewCommentReplyInput,
  AddViewScenarioInput,
  ArchitectureBoundary,
  ArchitectureElement,
  ArchitectureRecord,
  ArchitectureRelationship,
  ArchitectureView,
  CreateBoundaryInput,
  CreateElementInput,
  CreateRecordInput,
  CreateRelationshipInput,
  CreateViewAnnotationInput,
  CreateViewInput,
  LayoutAlgorithm,
  LayoutDirection,
  LayoutEntry,
  UpdateBoundaryInput,
  UpdateElementInput,
  UpdateRecordInput,
  UpdateRelationshipInput,
  UpdateViewAnnotationInput,
  UpdateViewCommentInput,
  UpdateViewInput,
  UpdateViewScenarioInput,
  ViewAnnotation,
  ViewComment,
  ViewElement,
  ViewRelationship,
  ViewRelationshipPatch,
  ViewScenario,
  ViewSettings,
  Workspace,
  WorkspaceMode,
} from "@structsmith/contracts";
import {
  AddViewCommentReplySchema,
  AddViewCommentSchema,
  AddViewScenarioSchema,
  CreateViewAnnotationSchema,
  ERROR_CODES,
  UpdateViewAnnotationSchema,
  UpdateViewCommentSchema,
  UpdateViewScenarioSchema,
  ViewAnnotationSchema,
  ViewSettingsSchema,
} from "@structsmith/contracts";
import { detailViewsFor } from "./detail-views";
import { badRequest, DomainError, ruleViolation } from "./errors";
import { createId, nowIso, uniqueKey } from "./ids";
import { edgeLabel, resolveRelationshipsForView } from "./implied";
import { computeLayout, estimateAnnotationSize, estimateElementSize } from "./layout";
import type { Repositories } from "./ports";
import { checkParent, descendantsOf, wouldCreateCycle } from "./rules";
import { validateViewScenarios } from "./scenarios";

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

export const defaultViewSettings: ViewSettings = {
  annotations: [],
  nodeColors: {},
  sectionFrames: {},
  preferredDetailViews: {},
  scenarios: [],
  commentPins: [],
  showBoundaries: true,
  snapToGrid: false,
  autoLayoutDirection: "LR",
  autoLayoutAlgorithm: "dagre",
  boundaryLayer: "deployment",
  relationshipRouting: "orthogonal",
  showRelationshipLabels: true,
  showFullTitles: false,
  showDescriptions: false,
};

const GRID_COLUMNS = 4;
const GRID_X = 300;
const GRID_Y = 180;

function requireElement(repos: Repositories, id: string, workspaceId: string): ArchitectureElement {
  const element = repos.elements.findById(id);
  if (!element || element.workspaceId !== workspaceId) {
    throw new DomainError(ERROR_CODES.ELEMENT_NOT_FOUND, `Element "${id}" does not exist.`, 404);
  }
  return element;
}

function requireBoundary(
  repos: Repositories,
  id: string,
  workspaceId: string,
): ArchitectureBoundary {
  const boundary = repos.boundaries.findById(id);
  if (!boundary || boundary.workspaceId !== workspaceId) {
    throw new DomainError(ERROR_CODES.BOUNDARY_NOT_FOUND, `Boundary "${id}" does not exist.`, 404);
  }
  return boundary;
}

function requireView(repos: Repositories, id: string, workspaceId: string): ArchitectureView {
  const view = repos.views.findById(id);
  if (!view || view.workspaceId !== workspaceId) {
    throw new DomainError(ERROR_CODES.VIEW_NOT_FOUND, `View "${id}" does not exist.`, 404);
  }
  return view;
}

function enforceHierarchy(
  mode: WorkspaceMode,
  child: Pick<ArchitectureElement, "kind" | "name">,
  parent: ArchitectureElement | undefined,
  warnings: string[],
): void {
  const problem = checkParent(child, parent);
  if (!problem) return;
  if (mode === "strict") throw ruleViolation(problem.message, { code: problem.code });
  warnings.push(problem.message);
}

function nextGridPosition(existing: readonly ViewElement[]): { x: number; y: number } {
  const index = existing.length;
  return { x: (index % GRID_COLUMNS) * GRID_X, y: Math.floor(index / GRID_COLUMNS) * GRID_Y };
}

/* ------------------------------------------------------------------ */
/* Elements                                                            */
/* ------------------------------------------------------------------ */

export function createElement(
  repos: Repositories,
  workspace: Workspace,
  input: CreateElementInput,
  warnings: string[] = [],
): ArchitectureElement {
  const parent = input.parentId ? requireElement(repos, input.parentId, workspace.id) : undefined;
  enforceHierarchy(workspace.mode, { kind: input.kind, name: input.name }, parent, warnings);

  const id = input.id ?? createId(input.name);
  if (repos.elements.findById(id)) {
    throw badRequest(`Element id "${id}" is already taken.`);
  }

  const timestamp = nowIso();
  const element: ArchitectureElement = {
    id,
    workspaceId: workspace.id,
    parentId: input.parentId ?? null,
    kind: input.kind,
    role: input.role ?? null,
    name: input.name,
    description: input.description ?? null,
    technology: input.technology ?? null,
    external: input.external ?? false,
    tags: input.tags ?? [],
    properties: input.properties ?? {},
    createdAt: timestamp,
    updatedAt: timestamp,
  };
  repos.elements.insert(element);
  return element;
}

export function updateElement(
  repos: Repositories,
  workspace: Workspace,
  elementId: string,
  input: UpdateElementInput,
  warnings: string[] = [],
): ArchitectureElement {
  const current = requireElement(repos, elementId, workspace.id);

  let parentId = current.parentId;
  if (input.parentId !== undefined) {
    parentId = input.parentId;
    if (parentId === elementId) throw badRequest("An element cannot be its own parent.");
    if (parentId) {
      const all = repos.elements.listByWorkspace(workspace.id);
      const parentOf = new Map(all.map((item) => [item.id, item.parentId]));
      if (wouldCreateCycle(elementId, parentId, (id) => parentOf.get(id) ?? null)) {
        throw ruleViolation("That change would create a containment cycle.");
      }
    }
  }

  const next: ArchitectureElement = {
    ...current,
    parentId,
    kind: input.kind ?? current.kind,
    role: input.role !== undefined ? input.role : current.role,
    name: input.name ?? current.name,
    description:
      input.description !== undefined ? (input.description ?? null) : current.description,
    technology: input.technology !== undefined ? (input.technology ?? null) : current.technology,
    external: input.external ?? current.external,
    tags: input.tags ?? current.tags,
    properties: input.properties ?? current.properties,
    updatedAt: nowIso(),
  };
  if (input.parentId !== undefined || input.kind !== undefined) {
    const parent = parentId ? requireElement(repos, parentId, workspace.id) : undefined;
    enforceHierarchy(workspace.mode, next, parent, warnings);
    if (input.kind !== undefined && input.kind !== current.kind) {
      for (const child of repos.elements.listByWorkspace(workspace.id)) {
        if (child.parentId === elementId) enforceHierarchy(workspace.mode, child, next, warnings);
      }
    }
  }
  repos.elements.update(next);
  return next;
}

export function deleteElement(
  repos: Repositories,
  workspace: Workspace,
  elementId: string,
  cascade = true,
): string[] {
  const element = requireElement(repos, elementId, workspace.id);
  const all = repos.elements.listByWorkspace(workspace.id);
  const targets = cascade ? [element, ...descendantsOf(elementId, all)] : [element];

  if (!cascade) {
    for (const child of all.filter((item) => item.parentId === elementId)) {
      repos.elements.update({ ...child, parentId: element.parentId, updatedAt: nowIso() });
    }
  }

  const removed = new Set(targets.map((target) => target.id));
  for (const view of repos.views.listByWorkspace(workspace.id))
    detachViewComments(repos, view.id, removed);
  pruneRemovedNodeSettings(repos, workspace, removed);

  for (const target of targets) {
    for (const relationshipId of repos.relationships.deleteByElement(target.id)) {
      repos.views.removeRelationshipEverywhere(relationshipId);
    }
    repos.views.removeElementEverywhere(target.id);
    repos.records.removeElementLinks(target.id);
    repos.boundaries.removeElementMemberships(target.id);
    repos.elements.delete(target.id);
  }

  prunePreferredDetailViews(repos, workspace);
  return targets.map((target) => target.id);
}

/* ------------------------------------------------------------------ */
/* Boundaries                                                          */
/* ------------------------------------------------------------------ */

function validateBoundaryParent(
  repos: Repositories,
  workspace: Workspace,
  boundaryId: string,
  viewId: string,
  parentBoundaryId: string | null,
  layer: ArchitectureBoundary["layer"],
  kind: ArchitectureBoundary["kind"],
): void {
  if (!parentBoundaryId) return;
  if (parentBoundaryId === boundaryId) throw badRequest("A boundary cannot contain itself.");
  const parent = requireBoundary(repos, parentBoundaryId, workspace.id);
  if (parent.viewId !== viewId) throw ruleViolation("Nested boundaries must use the same view.");
  if (parent.layer !== layer) throw ruleViolation("Nested boundaries must use the same layer.");
  if (kind === "custom" && parent.kind !== "custom") {
    throw ruleViolation("Sections can only be nested inside other Sections.");
  }
  let current: ArchitectureBoundary | undefined = parent;
  while (current) {
    if (current.id === boundaryId)
      throw ruleViolation("That change would create a boundary cycle.");
    current = current.parentBoundaryId
      ? repos.boundaries.findById(current.parentBoundaryId)
      : undefined;
  }
}

function validateBoundaryElements(
  repos: Repositories,
  workspaceId: string,
  viewId: string,
  elementIds: readonly string[],
): void {
  const viewElementIds = new Set(repos.views.listElements(viewId).map((entry) => entry.elementId));
  for (const elementId of new Set(elementIds)) {
    requireElement(repos, elementId, workspaceId);
    if (!viewElementIds.has(elementId)) {
      throw ruleViolation(`Element "${elementId}" must be added to the view before its boundary.`);
    }
  }
}

function claimBoundaryMembers(
  repos: Repositories,
  boundary: ArchitectureBoundary,
): ArchitectureBoundary {
  const claimed = new Set(boundary.elementIds);
  for (const other of repos.boundaries.listByView(boundary.viewId)) {
    if (other.id === boundary.id || other.layer !== boundary.layer) continue;
    const remaining = other.elementIds.filter((id) => !claimed.has(id));
    if (remaining.length !== other.elementIds.length) {
      repos.boundaries.update({ ...other, elementIds: remaining, updatedAt: nowIso() });
    }
  }
  return { ...boundary, elementIds: [...claimed] };
}

export function createBoundary(
  repos: Repositories,
  workspace: Workspace,
  input: CreateBoundaryInput,
): ArchitectureBoundary {
  const id = input.id ?? createId(input.name);
  if (repos.boundaries.findById(id)) throw badRequest(`Boundary id "${id}" is already taken.`);
  requireView(repos, input.viewId, workspace.id);
  const layer = input.layer ?? "deployment";
  validateBoundaryParent(
    repos,
    workspace,
    id,
    input.viewId,
    input.parentBoundaryId ?? null,
    layer,
    input.kind,
  );
  validateBoundaryElements(repos, workspace.id, input.viewId, input.elementIds ?? []);
  const timestamp = nowIso();
  const boundary = claimBoundaryMembers(repos, {
    id,
    workspaceId: workspace.id,
    viewId: input.viewId,
    parentBoundaryId: input.parentBoundaryId ?? null,
    kind: input.kind,
    layer,
    classification: input.classification ?? null,
    name: input.name,
    description: input.description ?? null,
    tags: input.tags ?? [],
    properties: input.properties ?? {},
    elementIds: input.elementIds ?? [],
    createdAt: timestamp,
    updatedAt: timestamp,
  });
  repos.boundaries.insert(boundary);
  return boundary;
}

export function updateBoundary(
  repos: Repositories,
  workspace: Workspace,
  boundaryId: string,
  input: UpdateBoundaryInput,
): ArchitectureBoundary {
  const current = requireBoundary(repos, boundaryId, workspace.id);
  const layer = input.layer ?? current.layer;
  const kind = input.kind ?? current.kind;
  const parentBoundaryId =
    input.parentBoundaryId !== undefined ? input.parentBoundaryId : current.parentBoundaryId;
  validateBoundaryParent(
    repos,
    workspace,
    boundaryId,
    current.viewId,
    parentBoundaryId ?? null,
    layer,
    kind,
  );
  if (
    kind !== "custom" &&
    repos.boundaries
      .listByView(current.viewId)
      .some((boundary) => boundary.parentBoundaryId === boundaryId && boundary.kind === "custom")
  ) {
    throw ruleViolation("A boundary containing Sections must remain a Section.");
  }
  if (
    kind !== "custom" &&
    repos.views
      .findById(current.viewId)
      ?.settings.annotations.some((annotation) => annotation.sectionId === boundaryId)
  )
    throw ruleViolation("A boundary containing annotations must remain a Section.");
  const elementIds = input.elementIds ?? current.elementIds;
  validateBoundaryElements(repos, workspace.id, current.viewId, elementIds);
  const next = claimBoundaryMembers(repos, {
    ...current,
    parentBoundaryId: parentBoundaryId ?? null,
    kind,
    layer,
    classification:
      input.classification !== undefined ? input.classification : current.classification,
    name: input.name ?? current.name,
    description: input.description !== undefined ? input.description : current.description,
    tags: input.tags ?? current.tags,
    properties: input.properties ?? current.properties,
    elementIds,
    updatedAt: nowIso(),
  });
  repos.boundaries.update(next);
  return next;
}

export function setBoundaryMembers(
  repos: Repositories,
  workspace: Workspace,
  boundaryId: string,
  elementIds: readonly string[],
  mode: "replace" | "add" | "remove" = "replace",
): ArchitectureBoundary {
  const current = requireBoundary(repos, boundaryId, workspace.id);
  validateBoundaryElements(repos, workspace.id, current.viewId, elementIds);
  const requested = new Set(elementIds);
  const nextIds =
    mode === "replace"
      ? [...requested]
      : mode === "add"
        ? [...new Set([...current.elementIds, ...requested])]
        : current.elementIds.filter((id) => !requested.has(id));
  return updateBoundary(repos, workspace, boundaryId, { elementIds: nextIds });
}

export function deleteBoundary(
  repos: Repositories,
  workspace: Workspace,
  boundaryId: string,
  cascade = false,
): string[] {
  const boundary = requireBoundary(repos, boundaryId, workspace.id);
  const all = repos.boundaries.listByWorkspace(workspace.id);
  const targets = [boundary];
  if (cascade) {
    for (let index = 0; index < targets.length; index += 1) {
      const current = targets[index];
      if (current) targets.push(...all.filter((item) => item.parentBoundaryId === current.id));
    }
  } else {
    for (const child of all.filter((item) => item.parentBoundaryId === boundaryId)) {
      repos.boundaries.update({
        ...child,
        parentBoundaryId: boundary.parentBoundaryId,
        updatedAt: nowIso(),
      });
    }
  }
  pruneRemovedNodeSettings(repos, workspace, new Set(targets.map((target) => target.id)));
  for (const target of [...targets].reverse()) repos.boundaries.delete(target.id);
  return targets.map((target) => target.id);
}

/* ------------------------------------------------------------------ */
/* Relationships                                                       */
/* ------------------------------------------------------------------ */

export function createRelationship(
  repos: Repositories,
  workspace: Workspace,
  input: CreateRelationshipInput,
): ArchitectureRelationship {
  requireElement(repos, input.sourceElementId, workspace.id);
  requireElement(repos, input.targetElementId, workspace.id);

  const id = input.id ?? createId("rel");
  if (repos.relationships.findById(id)) {
    throw badRequest(`Relationship id "${id}" is already taken.`);
  }

  const timestamp = nowIso();
  const relationship: ArchitectureRelationship = {
    id,
    workspaceId: workspace.id,
    sourceElementId: input.sourceElementId,
    targetElementId: input.targetElementId,
    description: input.description ?? null,
    technology: input.technology ?? null,
    interactionStyle: input.interactionStyle ?? "sync",
    tags: input.tags ?? [],
    properties: input.properties ?? {},
    createdAt: timestamp,
    updatedAt: timestamp,
  };
  repos.relationships.insert(relationship);
  return relationship;
}

export function updateRelationship(
  repos: Repositories,
  workspace: Workspace,
  relationshipId: string,
  input: UpdateRelationshipInput,
): ArchitectureRelationship {
  const current = repos.relationships.findById(relationshipId);
  if (!current || current.workspaceId !== workspace.id) {
    throw new DomainError(
      ERROR_CODES.RELATIONSHIP_NOT_FOUND,
      `Relationship "${relationshipId}" does not exist.`,
      404,
    );
  }
  if (input.sourceElementId) requireElement(repos, input.sourceElementId, workspace.id);
  if (input.targetElementId) requireElement(repos, input.targetElementId, workspace.id);

  const next: ArchitectureRelationship = {
    ...current,
    sourceElementId: input.sourceElementId ?? current.sourceElementId,
    targetElementId: input.targetElementId ?? current.targetElementId,
    description:
      input.description !== undefined ? (input.description ?? null) : current.description,
    technology: input.technology !== undefined ? (input.technology ?? null) : current.technology,
    interactionStyle: input.interactionStyle ?? current.interactionStyle,
    tags: input.tags ?? current.tags,
    properties: input.properties ?? current.properties,
    updatedAt: nowIso(),
  };
  repos.relationships.update(next);
  return next;
}

export function deleteRelationship(
  repos: Repositories,
  workspace: Workspace,
  relationshipId: string,
): void {
  const current = repos.relationships.findById(relationshipId);
  if (!current || current.workspaceId !== workspace.id) {
    throw new DomainError(
      ERROR_CODES.RELATIONSHIP_NOT_FOUND,
      `Relationship "${relationshipId}" does not exist.`,
      404,
    );
  }
  repos.views.removeRelationshipEverywhere(relationshipId);
  repos.relationships.delete(relationshipId);
}

/* ------------------------------------------------------------------ */
/* Views                                                               */
/* ------------------------------------------------------------------ */

function prunePreferredDetailViews(repos: Repositories, workspace: Workspace): void {
  const views = repos.views.listByWorkspace(workspace.id);
  const elements = new Map(
    repos.elements.listByWorkspace(workspace.id).map((element) => [element.id, element]),
  );
  for (const view of views) {
    const entries = Object.entries(view.settings.preferredDetailViews);
    if (!entries.length) continue;
    const present = new Set(repos.views.listElements(view.id).map((entry) => entry.elementId));
    const valid = entries.filter(([elementId, detailId]) => {
      const element = elements.get(elementId);
      return (
        element &&
        present.has(elementId) &&
        detailViewsFor(element, views, view.id).some((candidate) => candidate.id === detailId)
      );
    });
    if (valid.length !== entries.length)
      repos.views.update({
        ...view,
        updatedAt: nowIso(),
        settings: { ...view.settings, preferredDetailViews: Object.fromEntries(valid) },
      });
  }
}

function pruneRemovedNodeSettings(
  repos: Repositories,
  workspace: Workspace,
  removed: ReadonlySet<string>,
): void {
  for (const view of repos.views.listByWorkspace(workspace.id)) {
    const annotations = view.settings.annotations.map((annotation) =>
      annotation.sectionId && removed.has(annotation.sectionId)
        ? { ...annotation, sectionId: null }
        : annotation,
    );
    const sectionFrames = Object.fromEntries(
      Object.entries(view.settings.sectionFrames).filter(
        ([key]) => !removed.has(key.slice("boundary:".length)),
      ),
    );
    const nodeColors = Object.fromEntries(
      Object.entries(view.settings.nodeColors).filter(
        ([key]) => !removed.has(key.startsWith("boundary:") ? key.slice("boundary:".length) : key),
      ),
    );
    if (
      annotations.some((annotation, index) => annotation !== view.settings.annotations[index]) ||
      Object.keys(sectionFrames).length !== Object.keys(view.settings.sectionFrames).length ||
      Object.keys(nodeColors).length !== Object.keys(view.settings.nodeColors).length
    )
      repos.views.update({
        ...view,
        settings: { ...view.settings, annotations, sectionFrames, nodeColors },
        updatedAt: nowIso(),
      });
  }
}

function validateExplorationSettings(
  repos: Repositories,
  workspace: Workspace,
  view: ArchitectureView,
  settings: UpdateViewInput["settings"],
  elementIds: readonly string[],
): void {
  if (settings?.annotations) {
    ViewSettingsSchema.shape.annotations.parse(settings.annotations);
    for (const annotation of settings.annotations) {
      if (!annotation.sectionId) continue;
      const section = repos.boundaries.findById(annotation.sectionId);
      if (
        section?.workspaceId !== workspace.id ||
        section.viewId !== view.id ||
        section.kind !== "custom"
      )
        throw ruleViolation("Annotations may only belong to a Section in their own view.");
    }
  }
  if (settings?.nodeColors) {
    for (const key of Object.keys(settings.nodeColors)) {
      const id = key.startsWith("boundary:") ? key.slice("boundary:".length) : key;
      const element = repos.elements.findById(id);
      const boundary = key.startsWith("boundary:") ? repos.boundaries.findById(id) : undefined;
      if (
        element?.workspaceId === workspace.id ||
        (boundary?.workspaceId === workspace.id && boundary.viewId === view.id)
      )
        continue;
      throw ruleViolation(
        "Colors must refer to an element in this workspace or a boundary in this view.",
      );
    }
  }
  if (settings?.sectionFrames) {
    for (const key of Object.keys(settings.sectionFrames)) {
      const id = key.slice("boundary:".length);
      const boundary = repos.boundaries.findById(id);
      if (
        boundary?.workspaceId === workspace.id &&
        boundary.viewId === view.id &&
        boundary.kind === "custom"
      )
        continue;
      const element = repos.elements.findById(id);
      const isParentOnView = elementIds.some((elementId) => {
        let current = repos.elements.findById(elementId);
        const visited = new Set<string>();
        while (current && !visited.has(current.id)) {
          if (current.parentId === id) return true;
          visited.add(current.id);
          current = current.parentId ? repos.elements.findById(current.parentId) : undefined;
        }
        return false;
      });
      if (
        !element ||
        element.workspaceId !== workspace.id ||
        element.kind !== "custom" ||
        (!isParentOnView && !repos.views.findById(view.id)?.settings.sectionFrames[key])
      )
        throw ruleViolation(
          "Section geometry must refer to a custom section in this workspace and view.",
        );
    }
  }
  if (settings?.preferredDetailViews) {
    const views = repos.views.listByWorkspace(workspace.id);
    for (const [elementId, detailId] of Object.entries(settings.preferredDetailViews)) {
      const element = requireElement(repos, elementId, workspace.id);
      if (
        !elementIds.includes(elementId) ||
        !detailViewsFor(element, views, view.id).some((candidate) => candidate.id === detailId)
      ) {
        throw ruleViolation(
          "Preferred details must refer to an element in this view and one of its detail views.",
        );
      }
    }
  }
  if (settings?.scenarios) {
    const previous = repos.views.findById(view.id)?.settings.scenarios ?? [];
    // Unchanged stale scenarios remain available for repair or deletion after model edits.
    const changed = settings.scenarios.filter(
      (scenario) => !previous.some((saved) => JSON.stringify(saved) === JSON.stringify(scenario)),
    );
    validateViewScenarios(
      changed,
      elementIds,
      repos.elements.listByWorkspace(workspace.id),
      repos.relationships.listByWorkspace(workspace.id),
    );
  }
}

function detachViewComments(
  repos: Repositories,
  viewId: string,
  elementIds: ReadonlySet<string>,
): void {
  const view = repos.views.findById(viewId);
  if (!view?.settings.commentPins.some((pin) => pin.elementId && elementIds.has(pin.elementId)))
    return;
  const placements = new Map(
    repos.views.listElements(viewId).map((entry) => [entry.elementId, entry]),
  );
  repos.views.update({
    ...view,
    updatedAt: nowIso(),
    settings: {
      ...view.settings,
      commentPins: view.settings.commentPins.map((pin) => {
        const placement =
          pin.elementId && elementIds.has(pin.elementId)
            ? placements.get(pin.elementId)
            : undefined;
        return placement
          ? { ...pin, elementId: null, x: pin.x + placement.x, y: pin.y + placement.y }
          : pin;
      }),
    },
  });
}

export function createView(
  repos: Repositories,
  workspace: Workspace,
  input: CreateViewInput,
): ArchitectureView {
  if (input.scopeElementId) requireElement(repos, input.scopeElementId, workspace.id);

  const keys = new Set(repos.views.listByWorkspace(workspace.id).map((view) => view.key));
  const key =
    input.key && !keys.has(input.key) ? input.key : uniqueKey(keys, input.key ?? input.name);

  const timestamp = nowIso();
  const view: ArchitectureView = {
    id: input.id ?? createId(input.name),
    workspaceId: workspace.id,
    key,
    name: input.name,
    description: input.description ?? null,
    kind: input.kind,
    scopeElementId: input.scopeElementId ?? null,
    settings: { ...defaultViewSettings, ...(input.settings ?? {}) },
    createdAt: timestamp,
    updatedAt: timestamp,
  };
  validateExplorationSettings(repos, workspace, view, input.settings, input.elementIds ?? []);
  repos.views.insert(view);

  if (input.elementIds?.length) {
    setViewElements(repos, workspace, view.id, input.elementIds, "add");
  }
  return view;
}

export function updateView(
  repos: Repositories,
  workspace: Workspace,
  viewId: string,
  input: UpdateViewInput,
): ArchitectureView {
  const current = requireView(repos, viewId, workspace.id);
  if (input.scopeElementId) requireElement(repos, input.scopeElementId, workspace.id);

  if (input.key && input.key !== current.key) {
    const taken = repos.views
      .listByWorkspace(workspace.id)
      .some((view) => view.id !== viewId && view.key === input.key);
    if (taken) throw badRequest(`View key "${input.key}" is already used in this workspace.`);
  }

  const next: ArchitectureView = {
    ...current,
    key: input.key ?? current.key,
    name: input.name ?? current.name,
    description:
      input.description !== undefined ? (input.description ?? null) : current.description,
    kind: input.kind ?? current.kind,
    scopeElementId:
      input.scopeElementId !== undefined ? (input.scopeElementId ?? null) : current.scopeElementId,
    settings: { ...current.settings, ...(input.settings ?? {}) },
    updatedAt: nowIso(),
  };
  validateExplorationSettings(
    repos,
    workspace,
    next,
    input.settings,
    repos.views.listElements(viewId).map((entry) => entry.elementId),
  );
  repos.views.update(next);
  return next;
}

export function createViewAnnotation(
  repos: Repositories,
  workspace: Workspace,
  viewId: string,
  input: CreateViewAnnotationInput,
): ViewAnnotation {
  const view = requireView(repos, viewId, workspace.id);
  const data = CreateViewAnnotationSchema.parse(input);
  const annotation = ViewAnnotationSchema.parse({ ...data, id: data.id ?? createId("annotation") });
  updateView(repos, workspace, viewId, {
    settings: { annotations: [...view.settings.annotations, annotation] },
  });
  return annotation;
}

function requireViewAnnotation(
  repos: Repositories,
  workspace: Workspace,
  viewId: string,
  annotationId: string,
) {
  const view = requireView(repos, viewId, workspace.id);
  const annotation = view.settings.annotations.find((item) => item.id === annotationId);
  if (!annotation) throw badRequest(`Annotation "${annotationId}" does not exist on this view.`);
  return { view, annotation };
}

export function updateViewAnnotation(
  repos: Repositories,
  workspace: Workspace,
  viewId: string,
  annotationId: string,
  input: UpdateViewAnnotationInput,
): ViewAnnotation {
  const { view, annotation } = requireViewAnnotation(repos, workspace, viewId, annotationId);
  const next = ViewAnnotationSchema.parse({
    ...annotation,
    ...UpdateViewAnnotationSchema.parse(input),
  });
  updateView(repos, workspace, viewId, {
    settings: {
      annotations: view.settings.annotations.map((item) =>
        item.id === annotationId ? next : item,
      ),
    },
  });
  return next;
}

export function deleteViewAnnotation(
  repos: Repositories,
  workspace: Workspace,
  viewId: string,
  annotationId: string,
): void {
  const { view } = requireViewAnnotation(repos, workspace, viewId, annotationId);
  updateView(repos, workspace, viewId, {
    settings: { annotations: view.settings.annotations.filter((item) => item.id !== annotationId) },
  });
}

export function addViewComment(
  repos: Repositories,
  workspace: Workspace,
  viewId: string,
  input: AddViewCommentInput,
): ArchitectureView {
  const current = requireView(repos, viewId, workspace.id);
  const data = AddViewCommentSchema.parse(input);
  validateCommentAttachment(repos, workspace, viewId, data.elementId);
  const timestamp = nowIso();
  const pin = {
    ...data,
    createdAt: timestamp,
    updatedAt: timestamp,
    id: createId("comment"),
    resolved: false,
    replies: [],
  };
  return updateView(repos, workspace, viewId, {
    settings: { commentPins: [...current.settings.commentPins, pin] },
  });
}

function validateCommentAttachment(
  repos: Repositories,
  workspace: Workspace,
  viewId: string,
  elementId: string | null | undefined,
): void {
  if (!elementId) return;
  requireElement(repos, elementId, workspace.id);
  if (!repos.views.listElements(viewId).some((entry) => entry.elementId === elementId))
    throw badRequest(`Comment attachment "${elementId}" must be placed on this view.`);
}

function requireViewComment(
  repos: Repositories,
  workspace: Workspace,
  viewId: string,
  commentId: string,
) {
  const view = requireView(repos, viewId, workspace.id);
  const comment = view.settings.commentPins.find((pin) => pin.id === commentId);
  if (!comment) throw badRequest(`Comment "${commentId}" does not exist on this view.`);
  return { view, comment };
}

function replaceViewComment(
  repos: Repositories,
  workspace: Workspace,
  view: ArchitectureView,
  comment: ViewComment,
) {
  return updateView(repos, workspace, view.id, {
    settings: {
      commentPins: view.settings.commentPins.map((pin) => (pin.id === comment.id ? comment : pin)),
    },
  });
}

export function updateViewComment(
  repos: Repositories,
  workspace: Workspace,
  viewId: string,
  commentId: string,
  input: UpdateViewCommentInput,
): ArchitectureView {
  const { view, comment } = requireViewComment(repos, workspace, viewId, commentId);
  const patch = UpdateViewCommentSchema.parse(input);
  validateCommentAttachment(repos, workspace, viewId, patch.elementId);
  return replaceViewComment(repos, workspace, view, {
    ...comment,
    ...patch,
    updatedAt: nowIso(),
  });
}

export function deleteViewComment(
  repos: Repositories,
  workspace: Workspace,
  viewId: string,
  commentId: string,
): ArchitectureView {
  const { view } = requireViewComment(repos, workspace, viewId, commentId);
  return updateView(repos, workspace, viewId, {
    settings: { commentPins: view.settings.commentPins.filter((pin) => pin.id !== commentId) },
  });
}

export function addViewCommentReply(
  repos: Repositories,
  workspace: Workspace,
  viewId: string,
  commentId: string,
  input: AddViewCommentReplyInput,
): ArchitectureView {
  const { view, comment } = requireViewComment(repos, workspace, viewId, commentId);
  const timestamp = nowIso();
  return replaceViewComment(repos, workspace, view, {
    ...comment,
    updatedAt: timestamp,
    replies: [
      ...comment.replies,
      {
        ...AddViewCommentReplySchema.parse(input),
        id: createId("reply"),
        createdAt: timestamp,
        updatedAt: timestamp,
      },
    ],
  });
}

export function updateViewCommentReply(
  repos: Repositories,
  workspace: Workspace,
  viewId: string,
  commentId: string,
  replyId: string,
  input: AddViewCommentReplyInput,
): ArchitectureView {
  const { view, comment } = requireViewComment(repos, workspace, viewId, commentId);
  if (!comment.replies.some((reply) => reply.id === replyId))
    throw badRequest(`Reply "${replyId}" does not exist on this comment.`);
  const patch = AddViewCommentReplySchema.parse(input);
  const timestamp = nowIso();
  return replaceViewComment(repos, workspace, view, {
    ...comment,
    updatedAt: timestamp,
    replies: comment.replies.map((reply) =>
      reply.id === replyId ? { ...reply, ...patch, updatedAt: timestamp } : reply,
    ),
  });
}

export function deleteViewCommentReply(
  repos: Repositories,
  workspace: Workspace,
  viewId: string,
  commentId: string,
  replyId: string,
): ArchitectureView {
  const { view, comment } = requireViewComment(repos, workspace, viewId, commentId);
  if (!comment.replies.some((reply) => reply.id === replyId))
    throw badRequest(`Reply "${replyId}" does not exist on this comment.`);
  return replaceViewComment(repos, workspace, view, {
    ...comment,
    updatedAt: nowIso(),
    replies: comment.replies.filter((reply) => reply.id !== replyId),
  });
}

function requireViewScenario(
  repos: Repositories,
  workspace: Workspace,
  viewId: string,
  scenarioId: string,
) {
  const view = requireView(repos, viewId, workspace.id);
  const scenario = view.settings.scenarios.find((item) => item.id === scenarioId);
  if (!scenario) throw badRequest(`Scenario "${scenarioId}" does not exist on this view.`);
  return { view, scenario };
}

export function addViewScenario(
  repos: Repositories,
  workspace: Workspace,
  viewId: string,
  input: AddViewScenarioInput,
): ViewScenario {
  const current = requireView(repos, viewId, workspace.id);
  const { id, ...data } = AddViewScenarioSchema.parse(input);
  const scenario = { ...data, id: id ?? createId("scenario") };
  if (current.settings.scenarios.some((item) => item.id === scenario.id))
    throw badRequest(`Scenario "${scenario.id}" already exists on this view.`);
  updateView(repos, workspace, viewId, {
    settings: { scenarios: [...current.settings.scenarios, scenario] },
  });
  return scenario;
}

export function updateViewScenario(
  repos: Repositories,
  workspace: Workspace,
  viewId: string,
  scenarioId: string,
  input: UpdateViewScenarioInput,
): ViewScenario {
  const { view, scenario } = requireViewScenario(repos, workspace, viewId, scenarioId);
  const next = { ...scenario, ...UpdateViewScenarioSchema.parse(input) };
  updateView(repos, workspace, viewId, {
    settings: {
      scenarios: view.settings.scenarios.map((item) => (item.id === scenarioId ? next : item)),
    },
  });
  return next;
}

export function deleteViewScenario(
  repos: Repositories,
  workspace: Workspace,
  viewId: string,
  scenarioId: string,
): void {
  const { view } = requireViewScenario(repos, workspace, viewId, scenarioId);
  updateView(repos, workspace, viewId, {
    settings: { scenarios: view.settings.scenarios.filter((item) => item.id !== scenarioId) },
  });
}

export function deleteView(repos: Repositories, workspace: Workspace, viewId: string): void {
  requireView(repos, viewId, workspace.id);
  repos.views.delete(viewId);
  prunePreferredDetailViews(repos, workspace);
}

export function setViewElements(
  repos: Repositories,
  workspace: Workspace,
  viewId: string,
  elementIds: readonly string[],
  mode: "replace" | "add" | "remove" = "add",
): ViewElement[] {
  requireView(repos, viewId, workspace.id);
  const wanted = new Set(elementIds);
  const existing = repos.views.listElements(viewId);
  const existingIds = new Set(existing.map((entry) => entry.elementId));

  if (mode === "remove") {
    detachViewComments(repos, viewId, wanted);
    for (const elementId of wanted) {
      repos.boundaries.removeViewElementMembership(viewId, elementId);
      repos.views.removeElement(viewId, elementId);
    }
    prunePreferredDetailViews(repos, workspace);
    return repos.views.listElements(viewId);
  }

  if (mode === "replace") {
    detachViewComments(
      repos,
      viewId,
      new Set(
        existing.filter((entry) => !wanted.has(entry.elementId)).map((entry) => entry.elementId),
      ),
    );
    for (const entry of existing) {
      if (!wanted.has(entry.elementId)) repos.views.removeElement(viewId, entry.elementId);
      if (!wanted.has(entry.elementId)) {
        repos.boundaries.removeViewElementMembership(viewId, entry.elementId);
      }
    }
  }

  let placed = mode === "replace" ? [] : [...existing];
  for (const elementId of elementIds) {
    if (existingIds.has(elementId)) continue;
    requireElement(repos, elementId, workspace.id);
    const position = nextGridPosition(placed);
    const entry: ViewElement = {
      viewId,
      elementId,
      x: position.x,
      y: position.y,
      width: null,
      height: null,
      hidden: false,
      locked: false,
      zIndex: 0,
    };
    repos.views.upsertElement(entry);
    placed = [...placed, entry];
  }

  if (mode === "replace") prunePreferredDetailViews(repos, workspace);
  return repos.views.listElements(viewId);
}

export function setLayout(
  repos: Repositories,
  workspace: Workspace,
  viewId: string,
  entries: readonly LayoutEntry[],
): ViewElement[] {
  requireView(repos, viewId, workspace.id);
  const current = new Map(
    repos.views.listElements(viewId).map((entry) => [entry.elementId, entry] as const),
  );

  for (const entry of entries) {
    const existing = current.get(entry.elementId);
    const base: ViewElement = existing ?? {
      viewId,
      elementId: entry.elementId,
      x: 0,
      y: 0,
      width: null,
      height: null,
      hidden: false,
      locked: false,
      zIndex: 0,
    };
    if (!existing) requireElement(repos, entry.elementId, workspace.id);

    repos.views.upsertElement({
      ...base,
      x: entry.x ?? base.x,
      y: entry.y ?? base.y,
      width: entry.width !== undefined ? entry.width : base.width,
      height: entry.height !== undefined ? entry.height : base.height,
      hidden: entry.hidden ?? base.hidden,
      locked: entry.locked ?? base.locked,
      zIndex: entry.zIndex ?? base.zIndex,
    });
  }

  return repos.views.listElements(viewId);
}

export function setViewRelationships(
  repos: Repositories,
  workspace: Workspace,
  viewId: string,
  patches: readonly ViewRelationshipPatch[],
): ViewRelationship[] {
  requireView(repos, viewId, workspace.id);
  const current = new Map(
    repos.views.listRelationships(viewId).map((entry) => [entry.relationshipId, entry] as const),
  );

  for (const patch of patches) {
    const relationship = repos.relationships.findById(patch.relationshipId);
    if (!relationship || relationship.workspaceId !== workspace.id) {
      throw new DomainError(
        ERROR_CODES.RELATIONSHIP_NOT_FOUND,
        `Relationship "${patch.relationshipId}" does not exist.`,
        404,
      );
    }
    const base: ViewRelationship = current.get(patch.relationshipId) ?? {
      viewId,
      relationshipId: patch.relationshipId,
      hidden: false,
      labelPosition: null,
      controlPoints: [],
    };
    const next: ViewRelationship = {
      ...base,
      hidden: patch.hidden ?? base.hidden,
      labelPosition: patch.labelPosition !== undefined ? patch.labelPosition : base.labelPosition,
      controlPoints: patch.controlPoints ?? base.controlPoints,
      presentation:
        patch.presentation === null
          ? null
          : patch.presentation === undefined
            ? base.presentation
            : { ...base.presentation, ...patch.presentation },
    };
    repos.views.upsertRelationship(next);
    current.set(patch.relationshipId, next);
  }

  return repos.views.listRelationships(viewId);
}

export function autoLayoutView(
  repos: Repositories,
  workspace: Workspace,
  viewId: string,
  direction: LayoutDirection = "LR",
  algorithm: LayoutAlgorithm = "dagre",
  rootElementId?: string,
): ViewElement[] {
  const view = requireView(repos, viewId, workspace.id);
  const entries = repos.views.listElements(viewId).filter((entry) => !entry.hidden);
  if (entries.length === 0) return [];

  const allElements = repos.elements.listByWorkspace(workspace.id);
  const elements = new Map(allElements.map((element) => [element.id, element] as const));
  const visible = new Set(entries.map((entry) => entry.elementId));
  const relationshipPlacements = repos.views.listRelationships(viewId);
  const hiddenRelationships = new Set(
    relationshipPlacements.filter((entry) => entry.hidden).map((entry) => entry.relationshipId),
  );
  const activeBoundaries = repos.boundaries
    .listByView(viewId)
    .filter((boundary) => boundary.layer === view.settings.boundaryLayer);
  const boundaryByElement = new Map(
    activeBoundaries.flatMap((boundary) =>
      boundary.elementIds.map((elementId) => [elementId, boundary.id] as const),
    ),
  );

  const positions = computeLayout(
    entries.map((entry) => {
      const element = elements.get(entry.elementId);
      return {
        id: entry.elementId,
        ...estimateElementSize(element, view.settings, entry),
        x: entry.x,
        y: entry.y,
        locked: entry.locked,
        parentId: element?.parentId ?? null,
        groupId: boundaryByElement.get(entry.elementId) ?? null,
      };
    }),
    resolveRelationshipsForView(
      allElements,
      repos.relationships
        .listByWorkspace(workspace.id)
        .filter((relationship) => !hiddenRelationships.has(relationship.id)),
      visible,
    ).map((edge) => ({
      source: edge.sourceElementId,
      target: edge.targetElementId,
      label: edgeLabel(edge),
    })),
    direction,
    algorithm,
    rootElementId,
    activeBoundaries.map((boundary) => ({
      id: boundary.id,
      parentId: boundary.parentBoundaryId,
    })),
  );

  const byId = new Map(entries.map((entry) => [entry.elementId, entry] as const));
  for (const position of positions) {
    const entry = byId.get(position.id);
    if (!entry || entry.locked) continue;
    repos.views.upsertElement({ ...entry, x: position.x, y: position.y });
  }

  for (const placement of relationshipPlacements) {
    repos.views.upsertRelationship({
      ...placement,
      controlPoints: [],
      labelPosition: null,
      presentation: placement.presentation
        ? {
            ...placement.presentation,
            labelOffset: { x: 0, y: 0 },
            sourceSide: null,
            targetSide: null,
            sourceFraction: null,
            targetFraction: null,
          }
        : placement.presentation,
    });
  }

  const sectionFrames = Object.fromEntries(
    Object.entries(view.settings.sectionFrames).filter(([key]) => {
      const id = key.slice("boundary:".length);
      const boundary = repos.boundaries.findById(id);
      if (boundary) {
        if (boundary.layer !== view.settings.boundaryLayer) return true;
        const nested = [boundary];
        for (let index = 0; index < nested.length; index += 1)
          nested.push(
            ...activeBoundaries.filter(
              (candidate) => candidate.parentBoundaryId === nested[index]?.id,
            ),
          );
        return !nested.some((candidate) =>
          candidate.elementIds.some((elementId) => visible.has(elementId)),
        );
      }
      return !descendantsOf(id, allElements).some((element) => visible.has(element.id));
    }),
  );
  const arranged = repos.views.listElements(viewId);
  for (const boundary of activeBoundaries.filter((item) => item.kind === "custom")) {
    const nested = [boundary];
    for (let index = 0; index < nested.length; index++)
      nested.push(
        ...activeBoundaries.filter((item) => item.parentBoundaryId === nested[index]?.id),
      );
    const sectionIds = new Set(nested.map((item) => item.id));
    const annotations = view.settings.annotations.filter(
      (item) => item.sectionId && sectionIds.has(item.sectionId),
    );
    const memberIds = new Set(nested.flatMap((item) => item.elementIds));
    const members = arranged.filter((item) => !item.hidden && memberIds.has(item.elementId));
    if (!annotations.length || !members.length) continue;
    const boxes = [
      ...members.map((item) => ({
        x: item.x,
        y: item.y,
        ...estimateElementSize(elements.get(item.elementId), view.settings, item),
      })),
      ...annotations.map((item) => ({ x: item.x, y: item.y, ...estimateAnnotationSize(item) })),
    ];
    const x = Math.min(...boxes.map((item) => item.x)) - 28;
    const y = Math.min(...boxes.map((item) => item.y)) - 28;
    sectionFrames[`boundary:${boundary.id}`] = {
      x,
      y,
      width: Math.max(120, Math.max(...boxes.map((item) => item.x + item.width)) - x + 28),
      height: Math.max(80, Math.max(...boxes.map((item) => item.y + item.height)) - y + 28),
    };
  }
  updateView(repos, workspace, viewId, { settings: { sectionFrames } });
  return arranged;
}

/* ------------------------------------------------------------------ */
/* Records                                                             */
/* ------------------------------------------------------------------ */

export function createRecord(
  repos: Repositories,
  workspace: Workspace,
  input: CreateRecordInput,
): ArchitectureRecord {
  const linked = input.linkedElementIds ?? [];
  for (const elementId of linked) requireElement(repos, elementId, workspace.id);

  const timestamp = nowIso();
  const record: ArchitectureRecord = {
    id: input.id ?? createId(input.title),
    workspaceId: workspace.id,
    kind: input.kind,
    title: input.title,
    contentMd: input.contentMd ?? null,
    status: input.status ?? "open",
    severity: input.severity ?? null,
    linkedElementIds: linked,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
  repos.records.insert(record);
  return record;
}

export function updateRecord(
  repos: Repositories,
  workspace: Workspace,
  recordId: string,
  input: UpdateRecordInput,
): ArchitectureRecord {
  const current = repos.records.findById(recordId);
  if (!current || current.workspaceId !== workspace.id) {
    throw new DomainError(
      ERROR_CODES.RECORD_NOT_FOUND,
      `Record "${recordId}" does not exist.`,
      404,
    );
  }
  if (input.linkedElementIds) {
    for (const elementId of input.linkedElementIds) requireElement(repos, elementId, workspace.id);
  }

  const next: ArchitectureRecord = {
    ...current,
    kind: input.kind ?? current.kind,
    title: input.title ?? current.title,
    contentMd: input.contentMd !== undefined ? (input.contentMd ?? null) : current.contentMd,
    status: input.status ?? current.status,
    severity: input.severity !== undefined ? (input.severity ?? null) : current.severity,
    linkedElementIds: input.linkedElementIds ?? current.linkedElementIds,
    updatedAt: nowIso(),
  };
  repos.records.update(next);
  return next;
}

export function deleteRecord(repos: Repositories, workspace: Workspace, recordId: string): void {
  const current = repos.records.findById(recordId);
  if (!current || current.workspaceId !== workspace.id) {
    throw new DomainError(
      ERROR_CODES.RECORD_NOT_FOUND,
      `Record "${recordId}" does not exist.`,
      404,
    );
  }
  repos.records.delete(recordId);
}
