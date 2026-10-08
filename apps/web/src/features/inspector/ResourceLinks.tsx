import type { ArchitectureElement, ArchitectureRelationship } from "@structsmith/contracts";
import { safeWebLink } from "@structsmith/domain";
import { ExternalLink } from "lucide-react";
import { useEffect, useId, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

function LinkField({
  kind,
  value,
  onSave,
}: {
  kind: "implementation" | "runbook";
  value: unknown;
  onSave: (value: string | null) => void;
}) {
  const { t } = useTranslation();
  const id = useId();
  const stored = typeof value === "string" ? value : "";
  const [draft, setDraft] = useState(stored);
  const [invalid, setInvalid] = useState(false);
  useEffect(() => {
    setDraft(stored);
    setInvalid(false);
  }, [stored]);
  const link = safeWebLink(stored);
  const save = () => {
    const next = draft.trim();
    if (next && !safeWebLink(next)) {
      setInvalid(true);
      return;
    }
    setInvalid(false);
    if (next !== stored) onSave(next || null);
  };
  return (
    <div className="space-y-1">
      <Label htmlFor={id}>{t(`resourceLinks.${kind}`)}</Label>
      <div className="flex items-center gap-1">
        <Input
          id={id}
          value={draft}
          placeholder="https://"
          aria-invalid={invalid}
          aria-describedby={invalid ? `${id}-error` : undefined}
          onChange={(event) => {
            setDraft(event.target.value);
            setInvalid(false);
          }}
          onBlur={save}
          onKeyDown={(event) => {
            if (event.key === "Enter") event.currentTarget.blur();
            if (event.key === "Escape") {
              setDraft(stored);
              setInvalid(false);
              event.stopPropagation();
            }
          }}
        />
        {link && (
          <Button asChild variant="ghost" size="iconSm">
            <a
              href={link}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={t("resourceLinks.open", { kind: t(`resourceLinks.${kind}`) })}
            >
              <ExternalLink className="h-3.5 w-3.5" />
            </a>
          </Button>
        )}
      </div>
      {invalid && (
        <p id={`${id}-error`} className="text-xs text-destructive">
          {t("resourceLinks.invalid")}
        </p>
      )}
    </div>
  );
}

export function ResourceLinks({
  object,
  onPatch,
}: {
  object: ArchitectureElement | ArchitectureRelationship;
  onPatch: (properties: ArchitectureElement["properties"]) => void;
}) {
  const { t } = useTranslation();
  return (
    <section
      className="space-y-3 border-t border-border pt-3"
      aria-label={t("resourceLinks.title")}
    >
      <h3 className="text-xs font-semibold">{t("resourceLinks.title")}</h3>
      {(["implementation", "runbook"] as const).map((kind) => (
        <LinkField
          key={kind}
          kind={kind}
          value={object.properties[`${kind}.url`]}
          onSave={(value) => {
            const properties = { ...object.properties };
            if (value) properties[`${kind}.url`] = value;
            else delete properties[`${kind}.url`];
            onPatch(properties);
          }}
        />
      ))}
    </section>
  );
}
