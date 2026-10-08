import { expect, test } from "bun:test";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createTestContext, createWorkspace } from "../../../../../tests/helpers";
import { TooltipProvider } from "../../components/ui/tooltip";
import i18n from "../../i18n";
import { ViewInspector } from "./Inspector";

test("sidebar and dialog view forms have unique field IDs and accessible control names", async () => {
  const { services, close } = createTestContext();
  const language = i18n.language;
  try {
    await i18n.changeLanguage("en");
    const workspace = createWorkspace(services);
    const view = services.views.create(workspace.id, { kind: "custom", name: "Home" }).result;
    const markup = renderToStaticMarkup(
      createElement(
        QueryClientProvider,
        { client: new QueryClient() },
        createElement(
          TooltipProvider,
          null,
          createElement(ViewInspector, { workspaceId: workspace.id, view }),
          createElement(ViewInspector, { workspaceId: workspace.id, view }),
        ),
      ),
    );
    const ids = [...markup.matchAll(/\sid="([^"]+)"/g)].map((match) => match[1]);
    expect(ids.length).toBeGreaterThan(0);
    expect(new Set(ids).size).toBe(ids.length);
    for (const label of markup.matchAll(/\sfor="([^"]+)"/g)) expect(ids).toContain(label[1]);
    for (const key of [
      "inspector.showBoundaries",
      "inspector.snapToGrid",
      "inspector.showRelationshipLabels",
      "inspector.layoutDirection",
      "inspector.layoutAlgorithm",
      "boundaries.layerLabel",
      "inspector.relationshipRouting",
    ]) {
      expect(markup).toContain(`aria-label="${i18n.t(key)}"`);
    }
    expect(markup).not.toContain(i18n.t("inspector.nothingSelected"));
  } finally {
    close();
    await i18n.changeLanguage(language);
  }
});
