import {
  ArchitectureOperationSchema,
  boundaryClassifications,
  boundaryKinds,
  boundaryLayers,
  changeSources,
  elementKinds,
  elementRoles,
  interactionStyles,
  layoutAlgorithms,
  layoutDirections,
  recordKinds,
  recordStatuses,
  relationshipRoutings,
  severities,
  viewKinds,
  workspaceModes,
} from "@structsmith/contracts";

/** Derived from the operation union so the guide never lags new operations. */
export const OPERATION_KINDS = ArchitectureOperationSchema.options.map(
  (option) => option.shape.op.value,
);

/** Compact, machine-readable guidance so clients never need repository code. */
export function modelingGuide() {
  return {
    version: 1,
    startHere: [
      "Call workspace_list to resolve the target workspace id.",
      "Call workspace_inspect before planning a change.",
      "When a prompt contains a StructSmithRef payload, call reference_resolve with its workspaceId, type and targetId.",
      "Use the tool input schemas and this guide; do not inspect StructSmith source code.",
      "For multi-entity changes call model_preview_operations, then model_apply_operations.",
      "Finish with model_validate and inspect the affected views.",
      "To explain a flow step by step (authentication, checkout), add a scenario with scenario_create on the view that shows its elements.",
    ],
    principles: [
      "The semantic model is the source of truth; views control membership, boundaries, presentation and saved layout without copying model elements.",
      "Model each relationship once at the most specific meaningful C4 level.",
      "When a view hides descendants, StructSmith lifts and groups their relationships onto visible ancestors automatically. Do not add duplicate system-level relationships for a context view.",
      "Containers belong to software systems; components belong to containers.",
      "Use workflowGroup (Subprocess), action, decision and outcome for process semantics, not fake C4 containers. Subprocesses are reusable semantic elements with connections, children, inline expansion and scoped detail views. Workflow steps can connect to existing runtime elements without changing their kinds.",
      "Use external=true for systems outside the modeled ownership boundary.",
      "Records capture assumptions, risks, unknowns, requirements, decisions and notes; they are not diagram nodes.",
      "Boundaries belong to a view. They group that view's elements by deployment, security, compliance or ownership semantics; they are not model elements or relationship endpoints. Custom boundaries are Sections: visual organization for readers, with no connections, expansion or drill-down.",
      "The same model element can have different boundary membership in different views. Within one view it can belong to at most one boundary in a layer. Sections have no semantic parent; nest them only through parentBoundaryId under another Section in the same view and layer. Sections may group subprocesses and other visible elements but must not be placed inside a subprocess. A scoped detail view may have its own top-level Sections even when its steps belong semantically to the scope subprocess.",
    ],
    enums: {
      elementKinds,
      elementRoles,
      interactionStyles,
      viewKinds,
      recordKinds,
      recordStatuses,
      severities,
      workspaceModes,
      changeSources,
      layoutDirections,
      layoutAlgorithms,
      relationshipRoutings,
      boundaryKinds,
      boundaryLayers,
      boundaryClassifications,
      operationKinds: OPERATION_KINDS,
    },
    references: {
      copiedReferences:
        "The UI copies one-line StructSmithRef JSON. Resolve it with reference_resolve, passing viewId as well for a scenario; its url also deep-links to the target in the editor and opens a scenario's walkthrough.",
      syntax: "Assign ref on a create operation and use @ref in later id fields in the same batch.",
      example: [
        { op: "createElement", ref: "api", data: { kind: "container", name: "API" } },
        {
          op: "createRelationship",
          data: {
            sourceElementId: "existing-client-id",
            targetElementId: "@api",
            interactionStyle: "sync",
          },
        },
      ],
    },
    views: {
      recommended: [
        "Create a systemContext view for actors (`kind: person`), the focal software system and external systems.",
        "Create a container view scoped to the focal software system for runtime building blocks.",
        "Create a workflow view for decisions, actions and outcomes, optionally scoped to a workflowGroup (Subprocess) or action. scopeElementId connects the overview object to its internals. A Section is never a scope element; create it with createBoundary using kind: custom, layer: custom, the target viewId and optional parentBoundaryId.",
        "Seed elementIds when creating the view and include autoLayoutView in the same batch.",
      ],
      relationshipBehavior:
        "Visible relationships are derived from the semantic model. Descendant relationships may be lifted and grouped; explicit view relationship entries customize visibility, routing and presentation without changing semantic endpoints.",
      boundaryBehavior:
        "Each view owns its boundary tree. The view boundaryLayer selects which layer is rendered and used by boundary-aware layout; showBoundaries controls rendering without deleting boundaries or memberships. Add elements to the view before assigning them to a boundary. Elements with no boundary in the active layer remain ordinary items in the view; 'Items in view' is a UI grouping, not a boundary object.",
      settings: {
        annotations:
          "View-owned text/note/table objects: id, kind, finite x/y, width/height (20-10000), nullable optional color (#RRGGBB) and sectionId (custom Section boundary in this view). Text/note use text (<=20000 chars) and optional fontSize (8-72); tables use rectangular cells (1-100 rows, 1-20 columns, <=5000 chars per cell, <=100000 total). They are never model elements or relationship endpoints. Use annotation_list/get/create/update/delete or createViewAnnotation/updateViewAnnotation/deleteViewAnnotation in atomic batches. Update patches preserve ID and kind; snapshots support undo. Reusable connected objects belong in the shared model.",
        nodeColors:
          "Per-view #RRGGBB colors keyed by element ID or boundary:ID for group frames. Existing workspace elements and this view's boundaries are valid targets. Replace the map to remove a node color; connector colors use relationship presentation. Explicit colors override status outlines without changing tags.",
        sectionFrames:
          "View-owned Section rectangles keyed by boundary:ID, with finite x/y and width >= 120, height >= 80. Section membership uses custom boundaries, not custom-element parents. Create the boundary and setBoundaryMembers before setting its frame. Move or fit frames with updateView, without changing semantic parentage or connection endpoints.",
        scenarios:
          "Named, ordered walkthroughs over this view ({id,name,steps:[{elementId?,relationshipId?,response?,title,description?}]}). Prefer scenario_create/update/delete, which change one scenario and return an undo snapshot; settings.scenarios replaces the whole list. A step focuses an element on this view. relationshipId is the arrival connection from the previous step's element; response: true replies back over the previous step's connection (it runs from this element to the previous one), so a request and its reply can use the same connection. Omit elementId for a narration-only note step, which has no arrival. Implied (lifted) connections are not valid arrivals: when a step's endpoints are collapsed into one visible parent, author the scenario on a detail view that shows them. Deleting a referenced element or connection keeps the scenario; model_validate reports SCENARIO_* warnings until the step is repaired or removed. Playback never changes the model.",
        commentPins:
          "View-owned threads ({id,x,y,text,resolved,replies:[{id,text}]}); comment_list/comment_get read threads. comment_create/update/delete and comment_reply_create/update/delete share model_apply_operations revision guards and undo snapshots. Updating data.resolved resolves/reopens a thread. Deleting a parent removes all replies; deleting a reply leaves the parent. No per-person ownership, mentions or notifications.",
        showFullTitles: "Wrap full element titles instead of truncating them.",
        showDescriptions:
          "Show element descriptions inside cards; automatic layout reserves the additional height.",
        showBoundaries:
          "Show or hide the active boundary layer without changing its tree or memberships.",
        boundaryLayer:
          "Select the deployment, security, compliance, ownership or custom layer rendered on the view.",
        relationshipRouting: "Draw connectors as orthogonal, curved or straight paths.",
        showRelationshipLabels:
          "Legacy export preference; named connector labels are always visible on the canvas.",
        snapToGrid: "Snap manual element movement to the canvas grid.",
      },
      layouts: {
        relationshipPresentation:
          "Per-view relationship presentation supports color (#RRGGBB), strokeWidth (0.5-12), strokeStyle (solid/dashed/dotted), sourceArrow/targetArrow (none/arrow/arrowclosed), sourceSide/targetSide (left/right/top/bottom; null means automatic), and labelOffset ({x,y}). labelPosition (0-1) chooses a path anchor; defaults favor horizontal legs. Label offsets project onto the nearest connector segment, including vertical legs, while text stays horizontal. controlPoints set bends. Patch fields merge; null resets presentation. Grouped implied edges use the first relationship's presentation; dragging their labels or segments updates all contributing relationships atomically. They cannot be reconnected.",
        persistence:
          "Manual positions, optional sizes, locks and relationship presentation are saved by view_set_layout or setLayout/setViewRelationships operations. Automatic layout updates unlocked coordinates and clears manual connector bends and label offsets so stale geometry does not cross newly moved cards.",
        dagre:
          "Hierarchical layout and the default choice. It respects LR/TB direction and keeps members of active nested boundaries together.",
        force:
          "Deterministic relationship-driven layout for less hierarchical graphs. Direction is ignored.",
        radial:
          "Places graph-distance rings around rootElementId; when omitted, the most connected element is chosen. Direction is ignored.",
        grid: "Deterministic compact grid. Relationships, rootElementId and direction are ignored.",
      },
    },
    inspection:
      "workspace_inspect always includes view membership, boundary trees and presentation settings. With includeLayouts=false it omits coordinates, sizes, locks, label positions and control points; set includeLayouts=true when changing layout.",
    concurrency: {
      expectedRevision:
        "Optional optimistic guard. Use the revision returned by workspace_inspect when overwriting or deleting existing data.",
      conflictRecovery:
        "On a revision conflict, inspect again, reconcile the new state, and retry. Omit the guard only when merging onto the latest state is safe and intended.",
      preview:
        "Preview runs the real engine and validator in a rolled-back transaction. Preview ids are illustrative and must not be reused outside the batch.",
    },
    limits: { operationsPerBatch: 500, idLength: 64, nameLength: 200 },
  } as const;
}
