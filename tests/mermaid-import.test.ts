import { describe, expect, test } from "bun:test";
import { WorkspaceDocumentSchema } from "@structsmith/contracts";
import { buildGraph } from "../apps/web/src/features/canvas/graph";
import { parseWorkspaceImport } from "../apps/web/src/lib/workspaceImport";
import { toMermaid } from "../packages/domain/src/export";
import { parseMermaidToWorkspaceDocument as parse } from "../packages/domain/src/mermaid-import";
import { validateDocument } from "../packages/domain/src/validation";
import { createTestContext } from "./helpers";

function names(source: string) {
  return parse(source).elements.map((element) => element.name);
}

describe("Mermaid flowchart syntax", () => {
  test.each(["A-->B", "A --> B", "A[Client]-->B[API]"])("implicit and inline nodes: %s", (line) => {
    const document = parse(`flowchart LR\n${line}`);
    expect(document.elements).toHaveLength(2);
    expect(document.relationships).toHaveLength(1);
    expect(WorkspaceDocumentSchema.safeParse(document).success).toBe(true);
    expect(document.views[0]?.elements.every((entry) => (entry.width ?? 0) > 0)).toBe(true);
    expect(document.elements.every((element) => !("x" in element))).toBe(true);
  });

  test.each([
    '["A ] tricky label"]',
    "[A label]",
    "(A label)",
    "([A label])",
    "[[A label]]",
    "[(A label)]",
    "((A label))",
    "(((A label)))",
    "{A label}",
    "{{A label}}",
    ">A label]",
    "[/A label/]",
    "[\\A label\\]",
    "[/A label\\]",
    "[\\A label/]",
  ])("traditional shape %s", (shape) => {
    const document = parse(`graph TB\nA${shape} --> B`);
    expect(document.elements[0]?.name).toContain("label");
    expect(document.elements[0]?.kind).not.toBe("custom");
  });

  test.each(["-->", "--->", "---->", "---", "===", "==>", "-.->", "-..->", "-.-", "--o", "--x"])(
    "connector %s",
    (connector) => {
      expect(parse(`flowchart LR\nA ${connector} B`).relationships).toHaveLength(1);
    },
  );

  test.each(["<-->", "o--o", "x--x", "<==>", "<-.->"])("bidirectional %s", (connector) => {
    const doc = parse(`flowchart LR\nA ${connector} B`);
    expect(doc.relationships).toHaveLength(2);
    expect(doc.relationships[0]?.sourceElementId).toBe(doc.relationships[1]?.targetElementId);
  });

  test.each([
    "-- Uses -->",
    "== Uses ==>",
    "-. Uses .->",
    '-- "Uses" -->',
    '-->|"Uses"|',
    "-->|Uses|",
  ])("label %s", (connector) => {
    expect(parse(`graph LR\nA ${connector} B`).relationships[0]?.description).toBe("Uses");
  });

  test("standalone nodes, chaining, groups, parallel and invisible edges", () => {
    const doc = parse("flowchart TD; Alone; A & B-->C & D-->E; A-->C; A~~~F");
    expect(doc.elements).toHaveLength(7);
    expect(doc.relationships).toHaveLength(7);
    expect(
      doc.relationships.filter(
        (edge) => edge.targetElementId === doc.elements.find((node) => node.name === "F")?.id,
      ),
    ).toHaveLength(0);
  });

  test("last declaration wins, labels and descriptions survive", () => {
    const doc = parse('graph LR; A[First]-->B; A["Last<br/>Details: useful"]; A-->B');
    expect(doc.elements[0]).toMatchObject({ name: "Last", description: "Details: useful" });
    expect(doc.relationships).toHaveLength(2);
  });

  test("modern shapes, multiline attributes, edge IDs, classes and directives", () => {
    const doc = parse(`%%{init: {
      "theme": "dark"
    }}%%
    graph LR
    A@{ shape: cyl,
      label: "Database: records, archive" }:::store
    A e1@--> B@{ shape: cloud, label: 'API' }
    e1@{ animate: true, curve: linear }
    classDef store fill:#fff
    class e1 animate
    style A fill:red
    linkStyle 0 stroke:blue
    click A "https://example.com" "tooltip"
    accTitle: Example
    accDescr { description }
    `);
    expect(doc.elements.map((node) => node.name)).toEqual(["Database: records, archive", "API"]);
    expect(doc.relationships[0]?.properties["mermaid.id"]).toBe("e1");
  });

  test.each([
    ["rect", "action", null],
    ["diam", "decision", null],
    ["cyl", "container", "database"],
    ["subproc", "workflowGroup", null],
    ["stadium", "outcome", null],
    ["lean-r", "data", null],
    ["doc", "document", null],
    ["fork", "fork", null],
    ["join", "join", null],
  ])("modern %s preserves native meaning", (shape, kind, role) => {
    expect(parse(`graph LR; A@{ shape: ${shape}, label: "Example" }`).elements[0]).toMatchObject({
      name: "Example",
      kind,
      role,
    });
  });

  test("explicit kinds and roles survive later geometry and terminals stay business outcomes", () => {
    const doc = parse(
      'graph LR; A@{shape: cyl, kind: document, label: "Evidence"}; A{Changed}; B["Store<br/>container · queue"]; B[(Queue)]; C@{shape: stadium, kind: start}; D@{shape: circle, kind: end}; E([Done]); F[("Generic<br/>custom")]; C-->D',
    );
    expect(doc.elements.map(({ kind, role }) => ({ kind, role }))).toEqual([
      { kind: "document", role: null },
      { kind: "container", role: "queue" },
      { kind: "start", role: null },
      { kind: "end", role: null },
      { kind: "outcome", role: null },
      { kind: "custom", role: null },
    ]);
  });

  test("visual subgraphs preserve nested Section membership and valid mixed C4 objects", () => {
    const doc = parse(
      'graph LR; subgraph Outer[Capture]; A[Receive]; subgraph Inner[Evidence]; B[(Ledger)]; C@{shape: doc, label: "Statement"}; end; end; A-->B; B-->C',
    );
    const [outer, inner] = doc.views[0]?.boundaries ?? [];
    if (!outer || !inner) throw new Error("Missing imported Sections");
    expect(doc.elements).toHaveLength(3);
    expect(doc.elements.every((node) => node.parentId === null)).toBe(true);
    expect(outer.elementIds).toEqual([doc.elements[0]?.id ?? "missing"]);
    expect(inner.parentBoundaryId).toBe(outer.id);
    expect(inner.elementIds).toEqual(doc.elements.slice(1).map((node) => node.id));
    expect(doc.views[0]?.settings.boundaryLayer).toBe("custom");
    expect(validateDocument(doc).valid).toBe(true);
  });

  test("connected groups retain runtime visual context without changing C4 hierarchy", () => {
    const doc = parse(
      "graph LR; subgraph Overview[Pipeline]; subgraph Process[Publish]; A[Validate]; B[(Ledger)]; end; end; Process-->Outside; A-->B",
    );
    const group = doc.elements.find((node) => node.name === "Publish");
    const store = doc.elements.find((node) => node.name === "Ledger");
    expect(group?.kind).toBe("workflowGroup");
    expect(store).toMatchObject({ kind: "container", role: "database", parentId: null });
    const frame = doc.views[0]?.boundaries.find((boundary) => boundary.name === "Publish");
    expect(frame?.elementIds).toContain(group?.id);
    expect(frame?.elementIds).toContain(store?.id);
    expect(frame?.parentBoundaryId).toBe(doc.views[0]?.boundaries[0]?.id);
    expect(doc.relationships[0]?.sourceElementId).toBe(group?.id);
    expect(validateDocument(doc).valid).toBe(true);
  });

  test("quoted delimiters, entities, apostrophes, Unicode and Markdown strings", () => {
    expect(names('graph LR; A["A #quot; #9829; &amp; B; %% still text"]')[0]).toBe(
      'A " ♥ & B; %% still text',
    );
    expect(names("graph LR; A[It's fine]")[0]).toBe("It's fine");
    expect(names('graph LR; Klient-->Usługa["Zażółć"]')).toEqual(["Klient", "Zażółć"]);
    expect(parse('graph LR\nA["`First\nSecond`"]').elements[0]).toMatchObject({
      name: "First",
      description: "Second",
    });
  });

  test("fenced source, BOM, frontmatter title and config", () => {
    const doc = parse(
      '\uFEFF```mermaid\n---\ntitle: "Service map"\nconfig:\n  theme: dark\n---\ngraph TD\nA-->B\n```',
    );
    expect(doc.workspace.name).toBe("Service map");
    expect(doc.views[0]?.settings.autoLayoutDirection).toBe("TB");
    expect(parse("graph LR; A", { workspaceName: "Override" }).workspace.name).toBe("Override");
  });

  test.each(["LR", "RL", "TB", "TD", "BT"])("layout direction %s", (direction) => {
    const doc = parse(`graph ${direction}\nA-->B`);
    const [a, b] = doc.views[0]?.elements ?? [];
    if (!a || !b) throw new Error("Missing placements");
    if (direction === "RL") expect(a.x).toBeGreaterThan(b.x);
    else if (direction === "LR") expect(a.x).toBeLessThan(b.x);
    else if (direction === "BT") expect(a.y).toBeGreaterThan(b.y);
    else expect(a.y).toBeLessThan(b.y);
  });

  test("nested visual subgraphs become Sections and connected subgraphs become subprocesses", () => {
    const doc = parse(
      'flowchart LR\nA-->B\nsubgraph System ["Outer"]\ndirection TB\nsubgraph Inner\nA[Client]\nend\nB[API]\nend\nSystem-->Other',
    );
    const byName = new Map(doc.elements.map((node) => [node.name, node]));
    expect(byName.get("Client")?.parentId).toBe(byName.get("Outer")?.id ?? "missing");
    expect(byName.get("Outer")?.kind).toBe("workflowGroup");
    expect(doc.views[0]?.boundaries[0]).toMatchObject({
      name: "Inner",
      parentBoundaryId: null,
      elementIds: [byName.get("Client")?.id],
    });
    expect(byName.get("API")?.parentId).toBe(byName.get("Outer")?.id ?? "missing");
    expect(doc.views[0]?.settings.autoLayoutDirection).toBe("LR");
    expect(doc.relationships).toHaveLength(2);
    expect(doc.elements).toHaveLength(4);
  });

  test("subgraph titles with spaces", () => {
    const doc = parse("graph LR\nsubgraph My System\nA\nend");
    expect(doc.elements.map((node) => node.name)).toEqual(["A"]);
    expect(doc.views[0]?.boundaries[0]?.name).toBe("My System");
  });

  test("StructSmith metadata and technology round trip through export", () => {
    const doc = parse(
      'flowchart LR\nA["API<br/>[TypeScript]<br/>container · apiGateway"]\nB["Database<br/>[PostgreSQL]<br/>infrastructureNode · database"]\nA -->|"Reads [SQL]"| B',
    );
    const again = parse(toMermaid(doc));
    expect(again.elements[0]).toMatchObject({
      name: "API",
      kind: "container",
      role: "apiGateway",
      technology: "TypeScript",
    });
    expect(again.elements[1]).toMatchObject({ kind: "infrastructureNode", role: "database" });
    expect(again.relationships[0]).toMatchObject({ description: "Reads", technology: "SQL" });
  });

  test("custom kinds and custom roles are not conflated in export metadata", () => {
    const document = parse(
      'graph LR; A["Generic<br/>custom"]; B["Service<br/>container · custom"]',
    );
    expect(document.elements[0]).toMatchObject({ kind: "custom", role: null });
    expect(document.elements[1]).toMatchObject({ kind: "container", role: "custom" });
    expect(names('graph LR; A["#constructor;"]')).toEqual(["#constructor;"]);
  });

  test("exported subgraph endpoints retain their identity and parent metadata", () => {
    const document = parse(
      'graph LR\nsubgraph S["System<br/>softwareSystem"]\nA[API]\nend\nS-->External',
    );
    const again = parse(toMermaid(document));
    expect(again.elements).toHaveLength(3);
    const system = again.elements.find((node) => node.name === "System");
    expect(system?.kind).toBe("softwareSystem");
    expect(again.relationships[0]?.sourceElementId).toBe(system?.id ?? "missing");
    expect(again.elements.find((node) => node.name === "API")?.parentId).toBe(
      system?.id ?? "missing",
    );
  });

  test.each([
    "",
    "sequenceDiagram\nA->>B: Hello",
    "classDiagram\nclass A",
    "A-->B",
    "flowchart LR",
    "graph XX\nA",
    "graph LR\nA -->",
    'graph LR\nA["Unclosed]',
    "graph LR\nend",
    "graph LR\nsubgraph X\nA",
    "graph LR\nsubgraph X\nX\nend",
    "graph LR\nA-->B garbage",
    "graph LR\nA-->B\nunsupported ! syntax",
    "graph LR\n%%{init: {}",
    "```mermaid\ngraph LR\nA",
    "---\ntitle: Missing terminator\ngraph LR\nA",
  ])("reject invalid or unsupported source without silently dropping it: %s", (source) => {
    expect(() => parse(source)).toThrow();
  });

  test("bound import expansion", () => {
    const sources = Array.from({ length: 101 }, (_, index) => `A${index}`).join(" & ");
    const targets = Array.from({ length: 100 }, (_, index) => `B${index}`).join(" & ");
    expect(() => parse(`graph LR\n${sources} --> ${targets}`)).toThrow("10000 relationships");
  });
});

describe("Mermaid import domain persistence", () => {
  test.each(["RL", "BT"])(
    "reversed %s imports keep differently sized native shapes apart",
    (direction) => {
      const { services, close } = createTestContext();
      try {
        const workspace = services.imports.importMermaid(
          `graph ${direction}; A[Receive]-->B{Compare account identity and complete ledger evidence before publishing charges or allowing downstream obligations to be created from this capture}`,
        );
        const document = services.model.getDocument(workspace.id);
        const view = document.views[0];
        if (!view) throw new Error("Missing imported view");
        const cards = view.elements;
        const [action, decision] = cards;
        if (
          !action ||
          !decision ||
          !action.width ||
          !action.height ||
          !decision.width ||
          !decision.height
        )
          throw new Error("Missing native layout dimensions");
        expect(decision.width).toBeGreaterThan(action.width);
        expect(decision.height).toBeGreaterThan(action.height);
        if (direction === "RL") expect(action.x).toBeGreaterThan(decision.x + decision.width);
        else expect(action.y).toBeGreaterThan(decision.y + decision.height);
        expect(view.relationships[0]?.presentation).toEqual(
          direction === "RL"
            ? { sourceSide: "left", targetSide: "right" }
            : { sourceSide: "top", targetSide: "bottom" },
        );
        const edge = buildGraph({
          view,
          elements: document.elements,
          relationships: document.relationships,
          boundaries: document.boundaries,
          records: [],
        }).edges[0];
        expect(edge?.sourceHandle).toBe(direction === "RL" ? "source-l" : "source-t");
        expect(edge?.targetHandle).toBe(direction === "RL" ? "target-r" : "target-b");
      } finally {
        close();
      }
    },
  );

  test("ordinary flowchart shapes persist native semantic types", () => {
    const { services, close } = createTestContext();
    try {
      const workspace = services.imports.importMermaid(
        "flowchart LR; A[Capture] --> B{Safe?}; B --> C[[Publish]]; C --> D[(Ledgers)]; subgraph S[Process]; E[/Evidence/]; end; F",
      );
      expect(
        Object.fromEntries(
          services.model
            .getDocument(workspace.id)
            .elements.map(({ name, kind, role }) => [name, { kind, role }]),
        ),
      ).toEqual({
        Capture: { kind: "action", role: null },
        "Safe?": { kind: "decision", role: null },
        Publish: { kind: "workflowGroup", role: null },
        Ledgers: { kind: "container", role: "database" },
        Evidence: { kind: "data", role: null },
        F: { kind: "action", role: null },
      });
      const document = services.model.getDocument(workspace.id);
      expect(document.views[0]?.boundaries[0]).toMatchObject({
        name: "Process",
        kind: "custom",
        layer: "custom",
        elementIds: [document.elements.find((node) => node.name === "Evidence")?.id],
      });
    } finally {
      close();
    }
  });

  test("new workspaces get independent IDs and usable views", () => {
    const { services, close } = createTestContext();
    try {
      const first = services.imports.importMermaid("graph LR; A-->B", { name: "First" });
      const second = services.imports.importMermaid("graph LR; A-->B");
      const a = services.model.getDocument(first.id);
      const b = services.model.getDocument(second.id);
      expect(a.workspace.name).toBe("First");
      expect(a.elements).toHaveLength(2);
      expect(a.relationships).toHaveLength(1);
      expect(a.views[0]?.elements).toHaveLength(2);
      expect(a.elements[0]?.id).not.toBe(b.elements[0]?.id);
      expect(a.views[0]?.elements[0]?.elementId).toBe(
        a.elements.find((element) => element.id === a.views[0]?.elements[0]?.elementId)?.id ??
          "missing",
      );
    } finally {
      close();
    }
  });

  test("overwrite is explicit, isolated, and invalid input leaves the workspace untouched", () => {
    const { services, close } = createTestContext();
    try {
      const workspace = services.imports.importMermaid("graph LR; A-->B");
      const other = services.imports.importMermaid("graph LR; A-->B");
      const original = services.model.getDocument(workspace.id);
      const otherOriginal = services.model.getDocument(other.id);
      expect(() => services.imports.importMermaid("graph LR; C", { mode: "overwrite" })).toThrow(
        "workspaceId",
      );
      expect(() =>
        services.imports.importMermaid("graph LR; A-->B; broken ! syntax", {
          mode: "overwrite",
          workspaceId: workspace.id,
        }),
      ).toThrow("Invalid Mermaid source");
      expect(services.model.getDocument(workspace.id)).toEqual(original);
      const updated = services.imports.importMermaid("graph TB; A-->C", {
        mode: "overwrite",
        workspaceId: workspace.id,
        name: "Updated",
      });
      expect(updated).toMatchObject({ id: workspace.id, name: "Updated", revision: 2 });
      expect(
        services.model
          .getDocument(workspace.id)
          .elements.map((node) => node.name)
          .sort(),
      ).toEqual(["A", "C"]);
      expect(services.model.getDocument(other.id)).toEqual(otherOriginal);
      expect(() =>
        services.imports.importMermaid("graph LR; A", {
          mode: "overwrite",
          workspaceId: "missing",
        }),
      ).toThrow("does not exist");
    } finally {
      close();
    }
  });
});

describe("home file import routing", () => {
  test("native JSON wins over Mermaid-looking strings in its contents", () => {
    const doc = parse("graph LR; A", { workspaceName: "A --> B" });
    expect(parseWorkspaceImport("backup.json", JSON.stringify(doc)).kind).toBe("json");
    expect(parseWorkspaceImport("backup.txt", JSON.stringify(doc)).kind).toBe("json");
    expect(() => parseWorkspaceImport("backup.json", '{"name":"A --> B"}')).toThrow();
  });
  test("Mermaid files, comments, frontmatter and text are sent to the domain parser", () => {
    for (const name of ["diagram.MMD", "diagram.mermaid", "diagram.txt"]) {
      expect(parseWorkspaceImport(name, "%% comment\ngraph LR\nAlone").kind).toBe("mermaid");
    }
    expect(parseWorkspaceImport("diagram.txt", "---\ntitle: Example\n---\ngraph LR\nA").kind).toBe(
      "mermaid",
    );
  });
});
