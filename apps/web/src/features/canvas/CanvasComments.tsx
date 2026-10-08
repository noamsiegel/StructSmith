import type { ViewComment, ViewDetail } from "@structsmith/contracts";
import { Panel, useReactFlow, useViewport, ViewportPortal } from "@xyflow/react";
import { MessageSquare } from "lucide-react";
import { type RefObject, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { useApplyOperations, useWorkspace } from "@/hooks/useApi";

export function isCommentShortcut(
  event: Pick<KeyboardEvent, "key" | "ctrlKey" | "metaKey" | "altKey" | "shiftKey" | "repeat">,
  editing: boolean,
): boolean {
  return (
    !editing &&
    !event.repeat &&
    !event.ctrlKey &&
    !event.metaKey &&
    !event.altKey &&
    !event.shiftKey &&
    event.key.toLowerCase() === "c"
  );
}

export function CanvasComments({
  workspaceId,
  view,
  canvasRef,
}: {
  workspaceId: string;
  view: ViewDetail;
  canvasRef: RefObject<HTMLDivElement | null>;
}) {
  const { t } = useTranslation();
  const flow = useReactFlow();
  const { zoom } = useViewport();
  const workspace = useWorkspace(workspaceId);
  const command = useApplyOperations(workspaceId);
  const [mode, setMode] = useState(false);
  const [draft, setDraft] = useState<{
    x: number;
    y: number;
    revision: number;
    text: string;
  } | null>(null);
  const [opened, setOpened] = useState<ViewComment | null>(null);
  const postButton = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setMode(false);
        if (!command.isPending) {
          setDraft(null);
          setOpened(null);
        }
        return;
      }
      const target = event.target instanceof Element ? event.target : null;
      const editing = Boolean(
        target?.closest(
          "input, textarea, select, [contenteditable]:not([contenteditable=false]), [role=textbox], [role=dialog]",
        ),
      );
      if (mode && event.key === "Enter" && !editing && workspace.data) {
        event.preventDefault();
        const bounds = canvasRef.current?.getBoundingClientRect();
        if (bounds) {
          const point = flow.screenToFlowPosition({
            x: bounds.left + bounds.width / 2,
            y: bounds.top + bounds.height / 2,
          });
          setDraft({ ...point, revision: workspace.data.revision, text: "" });
          setMode(false);
        }
        return;
      }
      if (isCommentShortcut(event, editing)) {
        event.preventDefault();
        setMode(true);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [command.isPending, mode, workspace.data, canvasRef, flow]);

  useEffect(() => {
    if (!mode || !workspace.data) return;
    const canvas = canvasRef.current;
    const revision = workspace.data.revision;
    const capture = (event: MouseEvent) => {
      const target = event.target instanceof Element ? event.target : null;
      if (target?.closest("[data-comment-control], .react-flow__panel")) return;
      if (event.button !== 0) return;
      event.preventDefault();
      event.stopPropagation();
      if (event.type !== "click") return;
      const point = flow.screenToFlowPosition({ x: event.clientX, y: event.clientY });
      setDraft({ ...point, revision, text: "" });
      setMode(false);
      setOpened(null);
    };
    // Capture before React Flow starts a card drag while placing a comment.
    canvas?.addEventListener("pointerdown", capture, true);
    canvas?.addEventListener("click", capture, true);
    return () => {
      canvas?.removeEventListener("pointerdown", capture, true);
      canvas?.removeEventListener("click", capture, true);
    };
  }, [mode, workspace.data, canvasRef, flow]);

  const close = () => {
    if (command.isPending) return;
    setDraft(null);
    setOpened(null);
  };
  const post = async () => {
    if (!draft?.text.trim() || command.isPending) return;
    try {
      await command.mutateAsync({
        expectedRevision: draft.revision,
        label: t("comments.added"),
        operations: [
          {
            op: "addViewComment",
            viewId: view.id,
            data: { x: draft.x, y: draft.y, text: draft.text.trim() },
          },
        ],
      });
      setDraft(null);
    } catch {
      // Keep the draft available after the command's error notification.
      const latest = await workspace.refetch();
      if (latest.data)
        setDraft((current) => current && { ...current, revision: latest.data.revision });
    }
  };

  return (
    <>
      <Panel position="bottom-center" data-comment-control>
        <Button
          ref={postButton}
          variant={mode ? "default" : "outline"}
          onClick={() => setMode((value) => !value)}
          aria-pressed={mode}
          disabled={!workspace.data}
        >
          <MessageSquare className="h-3.5 w-3.5" aria-hidden="true" />
          {t(mode ? "comments.placeHint" : "comments.add")}
        </Button>
      </Panel>
      <ViewportPortal>
        {view.settings.commentPins.map((pin, index) => (
          <Button
            key={pin.id}
            data-comment-control
            size="icon"
            className="nodrag nopan pointer-events-auto absolute z-50 rounded-full shadow-md"
            style={{
              left: pin.x,
              top: pin.y,
              transform: `translate(-50%, -50%) scale(${1 / zoom})`,
            }}
            aria-label={t("comments.openPin", { number: index + 1 })}
            onClick={() => {
              setMode(false);
              setOpened(pin);
            }}
          >
            {index + 1}
          </Button>
        ))}
      </ViewportPortal>
      <Dialog
        open={Boolean(draft || opened)}
        onOpenChange={(open) => {
          if (!open) close();
        }}
      >
        <DialogContent
          hideClose
          onEscapeKeyDown={(event) => {
            if (command.isPending) event.preventDefault();
          }}
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            postButton.current?.focus();
          }}
        >
          <DialogHeader>
            <DialogTitle>{t(draft ? "comments.addTitle" : "comments.title")}</DialogTitle>
            <DialogDescription>{t("comments.viewOwned")}</DialogDescription>
          </DialogHeader>
          {draft ? (
            <Textarea
              autoFocus
              aria-label={t("comments.textLabel")}
              maxLength={4000}
              value={draft.text}
              disabled={command.isPending}
              onChange={(event) => setDraft({ ...draft, text: event.target.value })}
            />
          ) : (
            <p className="whitespace-pre-wrap break-words text-sm">{opened?.text}</p>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={close} disabled={command.isPending}>
              {t(draft ? "common.cancel" : "common.close")}
            </Button>
            {draft && (
              <Button
                onClick={() => void post()}
                disabled={!draft.text.trim() || command.isPending}
              >
                {t("comments.post")}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
