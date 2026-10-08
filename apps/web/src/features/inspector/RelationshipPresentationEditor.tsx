import type {
  InteractionStyle,
  ViewRelationship,
  ViewRelationshipPatch,
} from "@structsmith/contracts";
import { useEffect, useId, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

function NumberField({
  label,
  value,
  min,
  max,
  step,
  onChange,
}: {
  label: string;
  value: number;
  min?: number;
  max?: number;
  step?: number;
  onChange: (value: number) => void;
}) {
  const id = useId();
  const [draft, setDraft] = useState(String(value));
  const cancelBlur = useRef(false);
  useEffect(() => setDraft(String(value)), [value]);
  return (
    <div className="space-y-1">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        type="number"
        min={min}
        max={max}
        step={step ?? "any"}
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={(event) => {
          if (cancelBlur.current) {
            cancelBlur.current = false;
            return;
          }
          const next = event.currentTarget.valueAsNumber;
          if (!event.currentTarget.checkValidity() || !Number.isFinite(next)) {
            setDraft(String(value));
            return;
          }
          if (next !== value) onChange(next);
        }}
        onKeyDown={(event) => {
          if (event.key === "Enter") event.currentTarget.blur();
          if (event.key === "Escape") {
            cancelBlur.current = true;
            event.currentTarget.value = String(value);
            setDraft(String(value));
            event.currentTarget.blur();
          }
        }}
      />
    </div>
  );
}

function ColorField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  const id = useId();
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);
  return (
    <div className="space-y-1">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        type="color"
        value={draft}
        onInput={(event) => setDraft(event.currentTarget.value)}
        onBlur={() => {
          if (draft !== value) onChange(draft);
        }}
      />
    </div>
  );
}

export function RelationshipPresentationEditor({
  placement,
  relationshipId,
  interactionStyle,
  onPatch,
}: {
  placement?: ViewRelationship;
  relationshipId: string;
  interactionStyle: InteractionStyle;
  onPatch: (patch: ViewRelationshipPatch) => void;
}) {
  const { t } = useTranslation();
  const presentation = placement?.presentation;
  const patch = (data: NonNullable<ViewRelationshipPatch["presentation"]>) =>
    onPatch({ relationshipId, presentation: data });
  const selectField = (
    key: "strokeStyle" | "sourceArrow" | "targetArrow" | "sourceSide" | "targetSide",
    value: string,
    choices: readonly string[],
  ) => (
    <div className="space-y-1" key={key}>
      <Label>{t(`relationshipPresentation.${key}`)}</Label>
      <Select
        value={value}
        onValueChange={(next) => patch({ [key]: next === "auto" ? null : next })}
      >
        <SelectTrigger aria-label={t(`relationshipPresentation.${key}`)}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {choices.map((choice) => (
            <SelectItem key={choice} value={choice}>
              {t(`relationshipPresentation.${choice}`)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
  const dashed = ["async", "event", "dependency"].includes(interactionStyle);
  const offset = presentation?.labelOffset ?? { x: 0, y: 0 };
  return (
    <section
      className="space-y-3 border-t border-border pt-3"
      aria-label={t("relationshipPresentation.title")}
    >
      <h3 className="text-xs font-semibold">{t("relationshipPresentation.title")}</h3>
      <div className="grid grid-cols-2 gap-2">
        <ColorField
          label={t("relationshipPresentation.color")}
          value={presentation?.color ?? "#667085"}
          onChange={(color) => patch({ color })}
        />
        <NumberField
          label={t("relationshipPresentation.strokeWidth")}
          value={presentation?.strokeWidth ?? 1.4}
          min={0.5}
          max={12}
          step={0.1}
          onChange={(strokeWidth) => patch({ strokeWidth })}
        />
        {selectField("strokeStyle", presentation?.strokeStyle ?? (dashed ? "dashed" : "solid"), [
          "solid",
          "dashed",
          "dotted",
        ])}
        {selectField("sourceArrow", presentation?.sourceArrow ?? "none", [
          "none",
          "arrow",
          "arrowclosed",
        ])}
        {selectField("targetArrow", presentation?.targetArrow ?? "arrowclosed", [
          "none",
          "arrow",
          "arrowclosed",
        ])}
        {selectField("sourceSide", presentation?.sourceSide ?? "auto", [
          "auto",
          "left",
          "right",
          "top",
          "bottom",
        ])}
        {selectField("targetSide", presentation?.targetSide ?? "auto", [
          "auto",
          "left",
          "right",
          "top",
          "bottom",
        ])}
        {(["sourceSlot", "targetSlot"] as const).map((key) => (
          <div className="space-y-1" key={key}>
            <Label>{t(`relationshipPresentation.${key}`)}</Label>
            <Select
              value={String(presentation?.[key] ?? 1)}
              onValueChange={(value) => patch({ [key]: Number(value) })}
            >
              <SelectTrigger aria-label={t(`relationshipPresentation.${key}`)}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {[0, 1, 2].map((slot) => (
                  <SelectItem key={slot} value={String(slot)}>
                    {t(`relationshipPresentation.slot${slot}`)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        ))}
        <NumberField
          label={t("relationshipPresentation.labelPosition")}
          value={placement?.labelPosition ?? 0.5}
          min={0}
          max={1}
          step={0.05}
          onChange={(labelPosition) => onPatch({ relationshipId, labelPosition })}
        />
        <NumberField
          label={t("relationshipPresentation.labelOffsetX")}
          value={offset.x}
          onChange={(x) => patch({ labelOffset: { ...offset, x } })}
        />
        <NumberField
          label={t("relationshipPresentation.labelOffsetY")}
          value={offset.y}
          onChange={(y) => patch({ labelOffset: { ...offset, y } })}
        />
      </div>
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() =>
          onPatch({ relationshipId, presentation: null, labelPosition: null, controlPoints: [] })
        }
      >
        {t("relationshipPresentation.reset")}
      </Button>
    </section>
  );
}
