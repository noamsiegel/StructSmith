# StructSmith agent instructions

Read `CONTRIBUTING.md` for architecture, code style and validation requirements.

For frontend acceptance, use the shared [UI demo workspace](docs/UI_DEMO.md).
Run `bun run ui:demo` to create it; `--reset` snapshots edits and restores the
baseline. Add regression cases to its fixture instead of making new QA workspaces.

## UI library first

- Before creating or changing a UI control, inspect the existing shadcn/Radix
  components in `apps/web/src/components/ui` and reuse them wherever possible.
- Use the shared `Select`, `Input`, `Textarea`, `Button`, `Label`, `Badge`, dialog
  and other available components instead of native or independently styled
  equivalents. Compose them and use their variants before adding custom controls.
- Implement a custom control only when the UI library has no suitable component
  or composition for the required behavior. Preserve semantic HTML for structure.
- Keep styling, keyboard interaction, focus states and accessibility consistent
  with the UI library. Continue to translate all user-facing copy through i18next.
