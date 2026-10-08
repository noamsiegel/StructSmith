import type {
  ArchitectureOperationInput,
  ViewComment,
  ViewCommentReply,
  ViewDetail,
} from "@structsmith/contracts";
import { Panel, useNodes, useReactFlow, useViewport, ViewportPortal } from "@xyflow/react";
import { Check, Ellipsis, MessageSquare, Pencil, RotateCcw, Search, Trash2, X } from "lucide-react";
import { type RefObject, useCallback, useEffect, useId, useRef, useState } from "react";
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverAnchor, PopoverContent } from "@/components/ui/popover";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Tooltip } from "@/components/ui/tooltip";
import { useApplyOperations, useWorkspace } from "@/hooks/useApi";
import {
  canDismissComment,
  commentCanvasPosition,
  commentContentState,
  commentMatchesSearch,
  parseCommentSeen,
} from "./comment-state";

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
  const { t, i18n } = useTranslation();
  const flow = useReactFlow();
  const { zoom } = useViewport();
  const nodes = useNodes();
  const workspace = useWorkspace(workspaceId);
  const command = useApplyOperations(workspaceId);
  const [mode, setMode] = useState(false);
  const [draft, setDraft] = useState<{
    x: number;
    y: number;
    revision: number;
    text: string;
    elementId?: string;
  } | null>(null);
  const [openedId, setOpenedId] = useState<string | null>(null);
  const opened = view.settings.commentPins.find((pin) => pin.id === openedId);
  const [showResolved, setShowResolved] = useState(false);
  const [threadsOpen, setThreadsOpen] = useState(false);
  const [query, setQuery] = useState("");
  const seenKey = `structsmith:comments:seen:${encodeURIComponent(workspaceId)}:${encodeURIComponent(view.id)}`;
  const [seen, setSeen] = useState<{ key: string; values: Record<string, string> }>({
    key: seenKey,
    values: {},
  });
  const seenValues = seen.key === seenKey ? seen.values : {};
  const isUnread = (pin: ViewComment) => seenValues[pin.id] !== commentContentState(pin);
  const unreadCount = view.settings.commentPins.filter(
    (pin) => !pin.resolved && isUnread(pin),
  ).length;
  const filteredThreads = view.settings.commentPins.filter(
    (pin) => (!pin.resolved || showResolved) && commentMatchesSearch(pin, query),
  );
  const positions = new Map(
    view.elements.map((entry) => [entry.elementId, { x: entry.x, y: entry.y }]),
  );
  for (const node of nodes) {
    const elementId = typeof node.data?.elementId === "string" ? node.data.elementId : node.id;
    if (positions.has(elementId))
      positions.set(
        elementId,
        flow.getInternalNode(node.id)?.internals.positionAbsolute ?? node.position,
      );
  }

  useEffect(() => {
    let values = {};
    try {
      values = parseCommentSeen(window.localStorage.getItem(seenKey));
    } catch {
      /* Local storage may be unavailable in private browsing. */
    }
    setSeen({ key: seenKey, values });
    setOpenedId(null);
    setThreadsOpen(false);
    setQuery("");
  }, [seenKey]);

  useEffect(() => {
    if (!opened || seen.key !== seenKey) return;
    const content = commentContentState(opened);
    if (seen.values[opened.id] === content) return;
    const values = { ...seen.values, [opened.id]: content };
    setSeen({ key: seenKey, values });
    try {
      window.localStorage.setItem(seenKey, JSON.stringify(values));
    } catch {
      /* Keep unread tracking in memory when browser storage is full. */
    }
  }, [opened, seen, seenKey]);
  const [confirmDelete, setConfirmDelete] = useState<number | null>(null);
  const [messageDraft, setMessageDraft] = useState<{
    kind: "comment" | "reply" | "newReply";
    replyId?: string;
    text: string;
    revision: number;
  } | null>(null);
  const postButton = useRef<HTMLButtonElement>(null);
  const draftInput = useRef<HTMLTextAreaElement>(null);
  const threadTitleId = useId();
  const threadDescriptionId = useId();
  const anchor = flow.flowToScreenPosition(
    draft
      ? commentCanvasPosition(draft, positions)
      : opened
        ? commentCanvasPosition(opened, positions)
        : { x: 0, y: 0 },
  );
  const dirty = Boolean(draft?.text.trim() || messageDraft?.text.trim());

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented) return;
      if (event.key === "Escape") {
        setMode(false);
        if (!command.isPending && confirmDelete !== null) {
          setConfirmDelete(null);
          return;
        }
        if (!command.isPending) {
          setDraft(null);
          setOpenedId(null);
          setMessageDraft(null);
          setConfirmDelete(null);
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
      if (isCommentShortcut(event, editing) && !draft && !messageDraft?.text.trim()) {
        event.preventDefault();
        setMode(true);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [
    command.isPending,
    confirmDelete,
    draft,
    messageDraft,
    mode,
    workspace.data,
    canvasRef,
    flow,
  ]);

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
      const nodeId = target?.closest(".react-flow__node")?.getAttribute("data-id");
      const node = nodeId ? flow.getNode(nodeId) : undefined;
      const elementId = typeof node?.data.elementId === "string" ? node.data.elementId : node?.id;
      const placement = view.elements.find((entry) => entry.elementId === elementId);
      const position = node
        ? (flow.getInternalNode(node.id)?.internals.positionAbsolute ?? node.position)
        : undefined;
      setDraft(
        placement && position
          ? {
              x: point.x - position.x,
              y: point.y - position.y,
              elementId: placement.elementId,
              revision,
              text: "",
            }
          : { ...point, revision, text: "" },
      );
      setMode(false);
      setOpenedId(null);
      setMessageDraft(null);
      setConfirmDelete(null);
    };
    // Capture before React Flow starts a card drag while placing a comment.
    canvas?.addEventListener("pointerdown", capture, true);
    canvas?.addEventListener("click", capture, true);
    return () => {
      canvas?.removeEventListener("pointerdown", capture, true);
      canvas?.removeEventListener("click", capture, true);
    };
  }, [mode, workspace.data, canvasRef, flow, view.elements]);

  const close = useCallback(() => {
    if (command.isPending) return;
    setDraft(null);
    setOpenedId(null);
    setMessageDraft(null);
    setConfirmDelete(null);
  }, [command.isPending]);
  useEffect(() => {
    if (!draft && !openedId && !threadsOpen) return;
    const canvas = canvasRef.current;
    const dismiss = (event: MouseEvent) => {
      const target = event.target instanceof Element ? event.target : null;
      if (
        canDismissComment({
          dirty,
          pending: command.isPending,
          confirmingDelete: confirmDelete !== null,
          insideControl: Boolean(target?.closest("[data-comment-control]")),
        })
      ) {
        close();
        setThreadsOpen(false);
      }
    };
    // React Flow intercepts the later click that Radix uses for deferred dismissal.
    canvas?.addEventListener("click", dismiss, true);
    return () => canvas?.removeEventListener("click", dismiss, true);
  }, [canvasRef, draft, openedId, threadsOpen, dirty, command.isPending, confirmDelete, close]);
  const apply = async (operation: ArchitectureOperationInput, revision: number, label: string) => {
    if (command.isPending) return false;
    try {
      await command.mutateAsync({ expectedRevision: revision, label, operations: [operation] });
      return true;
    } catch {
      // A changed thread needs a fresh deletion confirmation; keep text drafts.
      setConfirmDelete(null);
      const latest = await workspace.refetch();
      if (latest.data) {
        const revision = latest.data.revision;
        setDraft((current) => current && { ...current, revision });
        setMessageDraft((current) => current && { ...current, revision });
      }
      return false;
    }
  };
  const post = async () => {
    if (!draft?.text.trim()) return;
    if (
      await apply(
        {
          op: "addViewComment",
          viewId: view.id,
          data: { x: draft.x, y: draft.y, text: draft.text.trim(), elementId: draft.elementId },
        },
        draft.revision,
        t("comments.added"),
      )
    )
      setDraft(null);
  };
  const saveMessage = async () => {
    if (!opened || !messageDraft?.text.trim()) return;
    const { kind, replyId, text, revision } = messageDraft;
    let operation: ArchitectureOperationInput;
    if (kind === "comment")
      operation = {
        op: "updateViewComment",
        viewId: view.id,
        commentId: opened.id,
        data: { text: text.trim() },
      };
    else if (kind === "reply" && replyId)
      operation = {
        op: "updateViewCommentReply",
        viewId: view.id,
        commentId: opened.id,
        replyId,
        data: { text: text.trim() },
      };
    else
      operation = {
        op: "addViewCommentReply",
        viewId: view.id,
        commentId: opened.id,
        data: { text: text.trim() },
      };
    if (
      await apply(
        operation,
        revision,
        t(kind === "newReply" ? "comments.replied" : "comments.updated"),
      )
    )
      setMessageDraft(null);
  };
  const startMessage = (kind: "comment" | "reply" | "newReply", text = "", replyId?: string) => {
    if (!workspace.data) return;
    setMessageDraft({ kind, text, replyId, revision: workspace.data.revision });
  };
  const deleteThread = async () => {
    if (!opened || confirmDelete === null) return;
    if (
      await apply(
        { op: "deleteViewComment", viewId: view.id, commentId: opened.id },
        confirmDelete,
        t("comments.deleted"),
      )
    )
      close();
  };

  const openThread = (pin: ViewComment, focus = false) => {
    if (dirty || command.isPending) return;
    setMode(false);
    setDraft(null);
    setOpenedId(pin.id);
    setMessageDraft(null);
    setConfirmDelete(null);
    if (focus) {
      const point = commentCanvasPosition(pin, positions);
      void flow.setCenter(point.x, point.y, { zoom: Math.max(zoom, 0.75), duration: 250 });
      setThreadsOpen(false);
    }
  };
  const timestamp = (message: Pick<ViewCommentReply, "createdAt" | "updatedAt">) => {
    if (!message.createdAt) return null;
    const edited = Boolean(message.updatedAt && message.updatedAt !== message.createdAt);
    const value = edited ? message.updatedAt : message.createdAt;
    if (!value) return null;
    return (
      <span className="mt-1 block text-xs text-muted-foreground">
        <time dateTime={value} title={new Date(value).toLocaleString(i18n.language)}>
          {new Date(value).toLocaleString(i18n.language, {
            month: "short",
            day: "numeric",
            hour: "numeric",
            minute: "2-digit",
          })}
        </time>
        {edited && <> · {t("comments.updatedLabel")}</>}
      </span>
    );
  };

  const messageEditor = () =>
    messageDraft && (
      <div className="space-y-2">
        <Textarea
          autoFocus
          aria-label={t(
            messageDraft.kind === "comment" ? "comments.textLabel" : "comments.editReplyText",
          )}
          className="min-h-20 text-sm"
          maxLength={4000}
          value={messageDraft.text}
          disabled={command.isPending}
          onChange={(event) => setMessageDraft({ ...messageDraft, text: event.target.value })}
        />
        <div className="flex justify-end gap-2">
          <Button
            size="sm"
            variant="ghost"
            disabled={command.isPending}
            onClick={() => setMessageDraft(null)}
          >
            {t("common.cancel")}
          </Button>
          <Button
            size="sm"
            disabled={!messageDraft.text.trim() || command.isPending}
            onClick={() => void saveMessage()}
          >
            {t("comments.save")}
          </Button>
        </div>
      </div>
    );
  const messageMenu = (reply?: { id: string; text: string }, number?: number) => (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="iconSm"
          className="shrink-0 text-muted-foreground"
          disabled={command.isPending || Boolean(messageDraft)}
          aria-label={t(reply ? "comments.replyActions" : "comments.threadActions", { number })}
        >
          <Ellipsis className="h-4 w-4" aria-hidden="true" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent data-comment-control align="end">
        <DropdownMenuItem
          onSelect={() =>
            startMessage(reply ? "reply" : "comment", reply?.text ?? opened?.text ?? "", reply?.id)
          }
        >
          <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
          {t("comments.edit")}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          destructive
          onSelect={() => {
            if (!opened || !workspace.data) return;
            if (!reply) setConfirmDelete(workspace.data.revision);
            else
              void apply(
                {
                  op: "deleteViewCommentReply",
                  viewId: view.id,
                  commentId: opened.id,
                  replyId: reply.id,
                },
                workspace.data.revision,
                t("comments.replyDeleted"),
              );
          }}
        >
          <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
          {t(reply ? "comments.delete" : "comments.deleteThread")}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );

  return (
    <>
      <Panel position="top-right" data-comment-control className="flex items-center gap-2">
        {mode && (
          <p role="status" className="rounded-md bg-background px-3 py-2 text-xs">
            {t("comments.placeHint")}
          </p>
        )}
        <Popover open={threadsOpen} onOpenChange={setThreadsOpen}>
          <PopoverAnchor asChild>
            <Button
              ref={postButton}
              variant="outline"
              disabled={dirty || command.isPending}
              aria-expanded={threadsOpen}
              onClick={() => setThreadsOpen((value) => !value)}
            >
              <MessageSquare className="h-4 w-4" aria-hidden="true" />
              {t("comments.threads")}
              {unreadCount > 0 && (
                <span className="rounded-sm bg-primary px-1.5 text-xs text-primary-foreground">
                  {unreadCount}
                  <span className="sr-only"> {t("comments.unread")}</span>
                </span>
              )}
            </Button>
          </PopoverAnchor>
          <PopoverContent
            data-comment-control
            align="end"
            side="bottom"
            collisionPadding={12}
            className="flex max-h-[min(560px,var(--radix-popover-content-available-height))] w-80 max-w-[calc(100vw-24px)] flex-col overflow-hidden"
            aria-label={t("comments.threads")}
          >
            <div className="space-y-3 border-b border-border p-3">
              <div className="flex items-center justify-between gap-2">
                <h2 className="text-sm font-semibold">{t("comments.threads")}</h2>
                <Button
                  variant="ghost"
                  size="iconSm"
                  aria-label={t("common.close")}
                  onClick={() => setThreadsOpen(false)}
                >
                  <X className="h-4 w-4" aria-hidden="true" />
                </Button>
              </div>
              <div className="relative">
                <Search
                  className="pointer-events-none absolute left-2.5 top-2 h-4 w-4 text-muted-foreground"
                  aria-hidden="true"
                />
                <Input
                  autoFocus
                  className="pl-8"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  aria-label={t("comments.search")}
                  placeholder={t("comments.search")}
                />
              </div>
              <Label className="flex items-center gap-2 text-xs">
                <Switch
                  checked={showResolved}
                  onCheckedChange={setShowResolved}
                  aria-label={t("comments.showResolved")}
                />
                {t("comments.showResolved")}
              </Label>
            </div>
            <ol className="min-h-0 overflow-y-auto" aria-label={t("comments.threads")}>
              {filteredThreads.map((pin) => (
                <li key={pin.id} className="border-b border-border last:border-b-0">
                  <Button
                    variant="ghost"
                    className="h-auto w-full items-start justify-start gap-2 rounded-none p-3 text-left"
                    onClick={() => openThread(pin, true)}
                  >
                    <span className="mt-0.5 w-5 shrink-0 text-xs text-muted-foreground">
                      {view.settings.commentPins.indexOf(pin) + 1}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="line-clamp-2 whitespace-pre-wrap break-words text-sm font-normal">
                        {pin.text}
                      </span>
                      <span className="mt-1 block text-xs font-normal text-muted-foreground">
                        {t("comments.replyCount", { count: pin.replies.length })}
                        {pin.resolved && <> · {t("comments.resolved")}</>}
                        {pin.elementId && <> · {t("comments.attached")}</>}
                      </span>
                      {timestamp(pin)}
                    </span>
                    {isUnread(pin) && (
                      <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-primary">
                        <span className="sr-only">{t("comments.unread")}</span>
                      </span>
                    )}
                  </Button>
                </li>
              ))}
            </ol>
            {filteredThreads.length === 0 && (
              <p className="p-4 text-sm text-muted-foreground">
                {t(query ? "comments.noMatches" : "comments.noThreads")}
              </p>
            )}
            <p className="border-t border-border p-3 text-xs text-muted-foreground">
              {t("comments.localUnreadHint")}
            </p>
          </PopoverContent>
        </Popover>
      </Panel>
      <ViewportPortal>
        {view.settings.commentPins.map((pin, index) =>
          !pin.resolved || showResolved ? (
            <Button
              key={pin.id}
              data-comment-control
              size="icon"
              variant={pin.resolved ? "outline" : "default"}
              disabled={command.isPending || dirty}
              className="nodrag nopan pointer-events-auto absolute z-50 rounded-full shadow-md"
              style={{
                left: commentCanvasPosition(pin, positions).x,
                top: commentCanvasPosition(pin, positions).y,
                transform: `translate(-50%, -50%) scale(${1 / zoom})`,
              }}
              aria-label={t(pin.resolved ? "comments.openResolvedPin" : "comments.openPin", {
                number: index + 1,
              })}
              aria-pressed={openedId === pin.id}
              onClick={() => openThread(pin)}
            >
              {index + 1}
              {isUnread(pin) && (
                <span className="absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full bg-primary ring-2 ring-background">
                  <span className="sr-only">{t("comments.unread")}</span>
                </span>
              )}
            </Button>
          ) : null,
        )}
      </ViewportPortal>
      <Popover
        modal={false}
        open={Boolean(draft || opened)}
        onOpenChange={(open) => {
          if (!open) close();
        }}
      >
        <PopoverAnchor asChild>
          <span
            className="pointer-events-none fixed h-8 w-8"
            aria-hidden="true"
            style={{ left: anchor.x - 16, top: anchor.y - 16 }}
          />
        </PopoverAnchor>
        <PopoverContent
          data-comment-control
          side="right"
          align="start"
          collisionPadding={12}
          className="flex max-h-[min(520px,var(--radix-popover-content-available-height))] w-[320px] max-w-[calc(100vw-24px)] flex-col overflow-hidden"
          aria-labelledby={threadTitleId}
          aria-describedby={threadDescriptionId}
          onOpenAutoFocus={(event) => {
            if (draft) {
              event.preventDefault();
              draftInput.current?.focus();
            }
          }}
          onEscapeKeyDown={(event) => {
            if (command.isPending || confirmDelete !== null) event.preventDefault();
          }}
          onInteractOutside={(event) => {
            const target = event.target instanceof Element ? event.target : null;
            if (
              !canDismissComment({
                dirty,
                pending: command.isPending,
                confirmingDelete: confirmDelete !== null,
                insideControl: Boolean(target?.closest("[data-comment-control]")),
              })
            )
              event.preventDefault();
          }}
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            postButton.current?.focus();
          }}
        >
          <div className="flex items-center gap-2 border-b border-border px-3 py-2">
            <MessageSquare className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
            <h2 id={threadTitleId} className="flex-1 text-sm font-semibold">
              {t(
                draft
                  ? "comments.addTitle"
                  : opened?.resolved
                    ? "comments.resolved"
                    : "comments.title",
              )}
            </h2>
            {opened && (
              <Tooltip label={t(opened.resolved ? "comments.reopen" : "comments.resolve")}>
                <Button
                  variant="ghost"
                  size="iconSm"
                  disabled={command.isPending || Boolean(messageDraft)}
                  aria-label={t(opened.resolved ? "comments.reopen" : "comments.resolve")}
                  onClick={() => {
                    if (!workspace.data) return;
                    void apply(
                      {
                        op: "updateViewComment",
                        viewId: view.id,
                        commentId: opened.id,
                        data: { resolved: !opened.resolved },
                      },
                      workspace.data.revision,
                      t(opened.resolved ? "comments.reopened" : "comments.markedResolved"),
                    );
                  }}
                >
                  {opened.resolved ? (
                    <RotateCcw className="h-4 w-4" aria-hidden="true" />
                  ) : (
                    <Check className="h-4 w-4" aria-hidden="true" />
                  )}
                </Button>
              </Tooltip>
            )}
            <Tooltip label={t("common.close")}>
              <Button
                variant="ghost"
                size="iconSm"
                aria-label={t("common.close")}
                onClick={close}
                disabled={command.isPending}
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </Button>
            </Tooltip>
          </div>
          <p id={threadDescriptionId} className="sr-only">
            {t("comments.viewOwned")}
          </p>
          {draft ? (
            <div className="space-y-3 p-3">
              <Textarea
                ref={draftInput}
                aria-label={t("comments.textLabel")}
                placeholder={t("comments.commentPlaceholder")}
                className="min-h-24 text-sm"
                maxLength={4000}
                value={draft.text}
                disabled={command.isPending}
                onChange={(event) => setDraft({ ...draft, text: event.target.value })}
              />
              <div className="flex justify-end gap-2">
                <Button variant="ghost" size="sm" onClick={close} disabled={command.isPending}>
                  {t("common.cancel")}
                </Button>
                <Button
                  size="sm"
                  onClick={() => void post()}
                  disabled={!draft.text.trim() || command.isPending}
                >
                  {t("comments.post")}
                </Button>
              </div>
            </div>
          ) : opened ? (
            <>
              <div className="min-h-0 overflow-y-auto">
                <div className="p-3">
                  {messageDraft?.kind === "comment" ? (
                    messageEditor()
                  ) : (
                    <div className="flex items-start gap-2">
                      <div className="min-w-0 flex-1">
                        <p className="whitespace-pre-wrap break-words text-sm leading-relaxed">
                          {opened.text}
                        </p>
                        {timestamp(opened)}
                      </div>
                      {messageMenu()}
                    </div>
                  )}
                </div>
                {opened.replies.length > 0 && (
                  <ol className="border-t border-border" aria-label={t("comments.replies")}>
                    {opened.replies.map((reply, index) => (
                      <li
                        key={reply.id}
                        className="border-b border-border px-3 py-3 last:border-b-0"
                      >
                        {messageDraft?.kind === "reply" && messageDraft.replyId === reply.id ? (
                          messageEditor()
                        ) : (
                          <div className="flex items-start gap-2">
                            <div className="min-w-0 flex-1">
                              <p className="whitespace-pre-wrap break-words text-sm leading-relaxed">
                                {reply.text}
                              </p>
                              {timestamp(reply)}
                            </div>
                            {messageMenu(reply, index + 1)}
                          </div>
                        )}
                      </li>
                    ))}
                  </ol>
                )}
              </div>
              <div className="shrink-0 space-y-2 border-t border-border bg-muted/30 p-3">
                <Textarea
                  aria-label={t("comments.replyText")}
                  placeholder={t("comments.replyPlaceholder")}
                  className="min-h-16 text-sm"
                  maxLength={4000}
                  value={messageDraft?.kind === "newReply" ? messageDraft.text : ""}
                  disabled={
                    command.isPending || Boolean(messageDraft && messageDraft.kind !== "newReply")
                  }
                  onChange={(event) => {
                    if (!workspace.data) return;
                    const text = event.target.value;
                    setMessageDraft(
                      text
                        ? {
                            kind: "newReply",
                            text,
                            revision:
                              messageDraft?.kind === "newReply"
                                ? messageDraft.revision
                                : workspace.data.revision,
                          }
                        : null,
                    );
                  }}
                />
                <div className="flex justify-end gap-2">
                  {messageDraft?.kind === "newReply" && messageDraft.text && (
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={command.isPending}
                      onClick={() => setMessageDraft(null)}
                    >
                      {t("common.cancel")}
                    </Button>
                  )}
                  <Button
                    size="sm"
                    disabled={
                      command.isPending ||
                      messageDraft?.kind !== "newReply" ||
                      !messageDraft.text.trim()
                    }
                    onClick={() => void saveMessage()}
                  >
                    {t("comments.postReply")}
                  </Button>
                </div>
              </div>
            </>
          ) : null}
        </PopoverContent>
      </Popover>
      <Dialog
        open={confirmDelete !== null && Boolean(opened)}
        onOpenChange={(open) => {
          if (!open && !command.isPending) setConfirmDelete(null);
        }}
      >
        <DialogContent
          hideClose
          onEscapeKeyDown={(event) => {
            if (command.isPending) event.preventDefault();
          }}
        >
          <DialogHeader>
            <DialogTitle>{t("comments.deleteTitle")}</DialogTitle>
            <DialogDescription>
              {t("comments.deleteWarning", { count: opened?.replies.length ?? 0 })}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              disabled={command.isPending}
              onClick={() => setConfirmDelete(null)}
            >
              {t("common.cancel")}
            </Button>
            <Button
              variant="destructive"
              disabled={command.isPending}
              onClick={() => void deleteThread()}
            >
              {t("comments.deleteThread")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
