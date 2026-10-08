/* biome-ignore-all lint/suspicious/noArrayIndexKey: Table cells are controlled and addressed by row and column coordinates. */
import type { UpdateViewAnnotationInput, ViewAnnotation } from "@structsmith/contracts";
import { Plus, Trash2, X } from "lucide-react";
import { useId, useState } from "react";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { pasteTableCells } from "./annotations";
import "./annotationTranslations";

export function AnnotationEditor({
  annotation,
  onClose,
  onSave,
}: {
  annotation: ViewAnnotation;
  onClose: () => void;
  onSave: (data: UpdateViewAnnotationInput) => Promise<void>;
}) {
  const { t } = useTranslation("annotations");
  const id = useId();
  const [text, setText] = useState(annotation.kind === "table" ? "" : annotation.text);
  const [fontSize, setFontSize] = useState(
    "fontSize" in annotation && typeof annotation.fontSize === "number"
      ? annotation.fontSize
      : annotation.kind === "text"
        ? 18
        : 16,
  );
  const [cells, setCells] = useState(
    annotation.kind === "table" ? annotation.cells.map((row) => [...row]) : [[""]],
  );
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const save = async () => {
    setPending(true);
    setError("");
    try {
      await onSave(annotation.kind === "table" ? { cells } : { text, fontSize });
      onClose();
    } catch {
      setError(t("failed"));
    } finally {
      setPending(false);
    }
  };
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !pending) onClose();
      }}
    >
      <DialogContent
        hideClose
        className="max-h-[85vh] max-w-3xl overflow-y-auto"
        onKeyDown={(event) => event.stopPropagation()}
      >
        <Button
          variant="ghost"
          size="icon"
          className="absolute right-3 top-3 h-7 w-7"
          aria-label={t("cancel")}
          disabled={pending}
          onClick={onClose}
        >
          <X className="h-3.5 w-3.5" />
        </Button>
        <DialogHeader>
          <DialogTitle>{t("edit", { kind: t(annotation.kind) })}</DialogTitle>
          <DialogDescription>
            {t(annotation.kind === "table" ? "pasteHint" : "description")}
          </DialogDescription>
        </DialogHeader>
        {annotation.kind === "table" ? (
          <div className="space-y-3">
            <div className="overflow-x-auto">
              <table className="w-full border-collapse">
                <thead>
                  <tr>
                    <th />
                    {cells[0]?.map((_, c) => (
                      <th key={c} className="p-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7"
                          aria-label={t("removeColumn", { column: c + 1 })}
                          disabled={pending || cells[0]?.length === 1}
                          onClick={() =>
                            setCells((current) =>
                              current.map((row) => row.filter((_, index) => index !== c)),
                            )
                          }
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {cells.map((row, r) => (
                    <tr key={r}>
                      <td className="p-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7"
                          aria-label={t("removeRow", { row: r + 1 })}
                          disabled={pending || cells.length === 1}
                          onClick={() =>
                            setCells((current) => current.filter((_, index) => index !== r))
                          }
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </td>
                      {row.map((cell, c) => (
                        <td key={c} className="min-w-36 p-1 align-top">
                          <Textarea
                            className="min-h-20 resize-y"
                            aria-label={t("cell", { row: r + 1, column: c + 1 })}
                            value={cell}
                            maxLength={5000}
                            disabled={pending}
                            onChange={(event) =>
                              setCells((current) =>
                                current.map((line, index) =>
                                  index === r
                                    ? line.map((value, col) =>
                                        col === c ? event.target.value : value,
                                      )
                                    : line,
                                ),
                              )
                            }
                            onPaste={(event) => {
                              const value = event.clipboardData.getData("text/plain");
                              if (!value.includes("\t") && !value.includes("\n")) return;
                              event.preventDefault();
                              try {
                                setCells(pasteTableCells(cells, value, r, c));
                                setError("");
                              } catch {
                                setError(t("limit"));
                              }
                            }}
                          />
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="flex gap-2">
              <Button
                variant="secondary"
                size="sm"
                disabled={pending || cells.length >= 100}
                onClick={() =>
                  setCells((current) => [
                    ...current,
                    Array.from({ length: current[0]?.length ?? 1 }, () => ""),
                  ])
                }
              >
                <Plus className="h-3.5 w-3.5" />
                {t("addRow")}
              </Button>
              <Button
                variant="secondary"
                size="sm"
                disabled={pending || (cells[0]?.length ?? 1) >= 20}
                onClick={() => setCells((current) => current.map((row) => [...row, ""]))}
              >
                <Plus className="h-3.5 w-3.5" />
                {t("addColumn")}
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor={id}>{t("content")}</Label>
              <Textarea
                id={id}
                autoFocus
                className="min-h-52"
                value={text}
                maxLength={20000}
                disabled={pending}
                onChange={(event) => setText(event.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor={`${id}-size`}>{t("fontSize")}</Label>
              <Input
                id={`${id}-size`}
                className="w-24"
                type="number"
                min={8}
                max={72}
                value={fontSize}
                disabled={pending}
                onChange={(event) => setFontSize(Number(event.target.value))}
              />
            </div>
          </div>
        )}
        {error && (
          <p className="mt-3 text-sm text-destructive" role="alert">
            {error}
          </p>
        )}
        <DialogFooter>
          <Button variant="ghost" disabled={pending} onClick={onClose}>
            {t("cancel")}
          </Button>
          <Button disabled={pending || fontSize < 8 || fontSize > 72} onClick={() => void save()}>
            {t("save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
