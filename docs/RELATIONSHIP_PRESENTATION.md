# Relationship presentation

Select a relationship to edit its appearance in the inspector. Color, line width,
solid/dashed/dotted lines, start/end arrowheads, attachment sides, label position
and label offset are stored on that view. Semantic endpoints and relationship IDs
stay unchanged. The default is a clear filled end arrow; old documents retain
inherited colors, widths and interaction-style dashes.

Drag a label independently of its line. A focused label supports arrow keys for
one canvas unit or Shift + arrow keys for ten. Label movement is one undoable
command per gesture. The inspector also offers numeric label coordinates and
**Reset relationship presentation**, which removes appearance overrides, resets
the label midpoint and clears manual bends.

Drag a relationship endpoint to another handle on the same element to change its
attachment side. Inspector side controls provide a keyboard-accessible equivalent.
Endpoint dragging does not reassign the relationship to another element; use the
semantic source/target selectors for that operation.

## REST and MCP

`view_set_layout` / `PATCH /api/views/:id/layout` and the
`setViewRelationships` operation share `ViewRelationshipPatchSchema`:

```json
{
  "entries": [],
  "relationships": [{
    "relationshipId": "existing-relationship",
    "labelPosition": 0.35,
    "controlPoints": [{ "x": 300, "y": 200 }],
    "presentation": {
      "color": "#2563eb",
      "strokeWidth": 2.5,
      "strokeStyle": "solid",
      "sourceArrow": "none",
      "targetArrow": "arrowclosed",
      "sourceSide": "bottom",
      "targetSide": "top",
      "labelOffset": { "x": 20, "y": -15 }
    }
  }]
}
```

Presentation fields are optional overrides. Supplied fields merge with existing
ones; `presentation: null` resets all overrides. Setting `sourceSide` or
`targetSide` to `null` restores that endpoint's automatic side without changing
other overrides. Colors must be six-digit hex,
widths range from 0.5 to 12, geometry must be finite, and label position ranges
from 0 to 1 along actual path length. Label offsets are relative canvas coordinates.
Saved control points are absolute canvas coordinates and define a manual polyline;
with no control points, the view's routing setting applies.

Migration `0004_relationship_presentation.sql` adds one nullable JSON column to
existing view relationship rows. Native JSON imports, exports, snapshots and
copy/paste preserve the presentation. PNG/SVG capture the live canvas, including
local arrowhead definitions, line styles and label positions. Mermaid remains a
semantic export and does not promise appearance fidelity.
