import { useTranslation } from "react-i18next";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { isApplePlatform } from "@/lib/platform";
import { useEditorStore } from "@/store/editor";
import { shortcutGroups, shortcutKeyLabel, shortcuts } from "./shortcuts";

export function KeyboardShortcutsDialog() {
  const { t } = useTranslation();
  const open = useEditorStore((state) => state.shortcutsOpen);
  const setOpen = useEditorStore((state) => state.setShortcutsOpen);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="max-w-xl p-0" hideClose>
        <DialogTitle className="sr-only">{t("shortcuts.title")}</DialogTitle>
        <Command>
          <CommandInput placeholder={t("shortcuts.search")} />
          <CommandList className="max-h-[min(480px,70dvh)] p-1">
            <CommandEmpty>{t("shortcuts.empty")}</CommandEmpty>
            {shortcutGroups.map((group) => (
              <CommandGroup key={group} heading={t(`shortcuts.groups.${group}`)}>
                {shortcuts
                  .filter((shortcut) => shortcut.group === group)
                  .map((shortcut) => {
                    const label = t(shortcut.labelKey);
                    const keys = shortcutKeyLabel(shortcut, isApplePlatform(), t);
                    return (
                      <CommandItem
                        key={shortcut.id}
                        value={`${label} ${keys} ${t(`shortcuts.groups.${group}`)}`}
                        className="cursor-default items-start"
                      >
                        <span className="flex-1">{label}</span>
                        <kbd className="shrink-0 rounded border border-border bg-muted px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
                          {keys}
                        </kbd>
                      </CommandItem>
                    );
                  })}
              </CommandGroup>
            ))}
          </CommandList>
        </Command>
      </DialogContent>
    </Dialog>
  );
}
