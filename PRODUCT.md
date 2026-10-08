# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

People exploring and editing architecture and workflow diagrams, including the
HOA portal capture, evidence, task and charge workflows.

## Product Purpose

Make an end-to-end workflow understandable from its overview through its details.
Readers should follow named connections and explore a subprocess without losing
their place in the overview.

## Capabilities and Constraints

- Sections are visual groupings owned by a view. Subprocesses are connected model
  objects with internal steps. Sections can nest inside Sections, never Subprocesses.
- Prefer at most four hierarchy levels and use tags to explain implementation status.
- Exploration previews are read-only, support deeper navigation and return to an
  unchanged overview. Editing belongs in the full view.
- Titles and displayed metadata must remain readable without manual resizing.
- The semantic model is shared by the editor, REST and MCP. Layout belongs to views.

## Product Principles

- Preserve context when navigating.
- Show readable titles and connection labels by default.
- Keep exploration separate from model and layout changes.
- Reuse the same model objects across views.
