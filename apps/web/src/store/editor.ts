import type {
  ArchitectureElement,
  ArchitectureRelationship,
  ViewAnnotation,
  ViewElement,
  ViewRelationship,
} from "@structsmith/contracts";
import { create } from "zustand";

export type Selection =
  | { type: "none" }
  | { type: "annotation"; id: string }
  | { type: "element"; id: string }
  | { type: "elements"; ids: string[] }
  | { type: "boundary"; id: string }
  | { type: "relationship"; id: string }
  | { type: "view"; id: string }
  | { type: "record"; id: string };

export interface DiagramClipboard {
  workspaceId: string;
  viewId: string;
  elements: ArchitectureElement[];
  annotations: ViewAnnotation[];
  relationships: ArchitectureRelationship[];
  placements: ViewElement[];
  relationshipPlacements: ViewRelationship[];
  nodeColors: Record<string, string>;
  boundaryMemberships: { boundaryId: string; elementIds: string[] }[];
  pasteCount: number;
}

/** A walkthrough in progress; it outlives view changes because steps can open other views. */
export interface ScenarioPlayback {
  /** The view that owns the scenario. */
  ownerViewId: string;
  scenarioId: string;
  index: number;
  /** Past the last step: the panel shows the end card. */
  finished?: boolean;
}

export type ExplorerTab = "model" | "views" | "presales";
export type BottomPanel = "issues" | "activity" | "snapshots" | null;

function sameSelection(current: Selection, next: Selection): boolean {
  if (current.type !== next.type) return false;
  if (current.type === "none" && next.type === "none") return true;
  if (current.type === "elements" && next.type === "elements") {
    return (
      current.ids.length === next.ids.length &&
      current.ids.every((id, index) => id === next.ids[index])
    );
  }
  if ("id" in current && "id" in next) return current.id === next.id;
  return false;
}

interface EditorState {
  /** Short-lived editor state only — server state lives in TanStack Query. */
  selection: Selection;
  explorerTab: ExplorerTab;
  bottomPanel: BottomPanel;
  commandOpen: boolean;
  shortcutsOpen: boolean;
  modelPanelVisible: boolean;
  inspectorPanelVisible: boolean;
  paletteOpen: boolean;
  paletteBoundaryId: string | null;
  connectFrom: string | null;
  /** Fit the camera to an element (and optionally others), selecting it unless select is false. */
  focusRequest: { elementId: string; also?: string[]; select?: boolean; nonce: number } | null;
  playback: ScenarioPlayback | null;
  /** Viewer mode: editing chrome and side panels are hidden while a walkthrough plays. */
  presenting: boolean;
  pendingSave: number;
  clipboard: DiagramClipboard | null;

  select: (selection: Selection) => void;
  clearSelection: () => void;
  setExplorerTab: (tab: ExplorerTab) => void;
  setBottomPanel: (panel: BottomPanel) => void;
  setCommandOpen: (open: boolean) => void;
  setShortcutsOpen: (open: boolean) => void;
  setModelPanelVisible: (visible: boolean) => void;
  setInspectorPanelVisible: (visible: boolean) => void;
  setPaletteOpen: (open: boolean) => void;
  openElementPalette: (boundaryId?: string | null) => void;
  setConnectFrom: (elementId: string | null) => void;
  requestFocus: (elementId: string, options?: { also?: string[]; select?: boolean }) => void;
  setPlayback: (playback: ScenarioPlayback | null) => void;
  setPresenting: (presenting: boolean) => void;
  beginSave: () => void;
  endSave: () => void;
  setClipboard: (clipboard: DiagramClipboard | null) => void;
}

export const useEditorStore = create<EditorState>((set) => ({
  selection: { type: "none" },
  explorerTab: "model",
  bottomPanel: null,
  commandOpen: false,
  shortcutsOpen: false,
  modelPanelVisible: false,
  inspectorPanelVisible: false,
  paletteOpen: false,
  paletteBoundaryId: null,
  connectFrom: null,
  focusRequest: null,
  playback: null,
  presenting: false,
  pendingSave: 0,
  clipboard: null,

  select: (selection) =>
    set((state) => (sameSelection(state.selection, selection) ? state : { ...state, selection })),
  clearSelection: () =>
    set((state) =>
      state.selection.type === "none" && state.connectFrom === null
        ? state
        : { ...state, selection: { type: "none" }, connectFrom: null },
    ),
  setExplorerTab: (explorerTab) => set({ explorerTab }),
  setBottomPanel: (bottomPanel) =>
    set((state) => ({ bottomPanel: state.bottomPanel === bottomPanel ? null : bottomPanel })),
  setCommandOpen: (commandOpen) => set({ commandOpen }),
  setShortcutsOpen: (shortcutsOpen) => set({ shortcutsOpen }),
  setModelPanelVisible: (modelPanelVisible) => set({ modelPanelVisible }),
  setInspectorPanelVisible: (inspectorPanelVisible) => set({ inspectorPanelVisible }),
  setPaletteOpen: (paletteOpen) =>
    set({ paletteOpen, ...(paletteOpen ? {} : { paletteBoundaryId: null }) }),
  openElementPalette: (paletteBoundaryId = null) => set({ paletteOpen: true, paletteBoundaryId }),
  setConnectFrom: (connectFrom) => set({ connectFrom }),
  requestFocus: (elementId, options) =>
    set({ focusRequest: { elementId, ...options, nonce: Date.now() } }),
  // Presenting only makes sense during a walkthrough, so stopping one ends it too.
  setPlayback: (playback) =>
    set((state) => ({ playback, presenting: playback ? state.presenting : false })),
  setPresenting: (presenting) => set({ presenting }),
  beginSave: () => set((state) => ({ pendingSave: state.pendingSave + 1 })),
  endSave: () => set((state) => ({ pendingSave: Math.max(0, state.pendingSave - 1) })),
  setClipboard: (clipboard) => set({ clipboard }),
}));
