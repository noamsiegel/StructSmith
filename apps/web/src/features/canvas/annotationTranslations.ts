import i18n from "@/i18n";

const en = {
  add: "Add {{name}}",
  text: "Text",
  note: "Note",
  table: "Table",
  edit: "Edit {{kind}}",
  description: "Saved on this view. Double-click to edit; drag the handles to resize.",
  content: "Content",
  newText: "Add context here",
  newNote: "Write a note",
  updated: "Updated annotation",
  created: "Added annotation",
  deleted: "Deleted annotation",
  fontSize: "Text size",
  addRow: "Add row",
  addColumn: "Add column",
  removeRow: "Remove row {{row}}",
  removeColumn: "Remove column {{column}}",
  cell: "Row {{row}}, column {{column}}",
  pasteHint: "Paste spreadsheet cells into a cell to fill a rectangle.",
  limit:
    "Tables support up to 100 rows, 20 columns, 5,000 characters per cell and 100,000 total characters.",
  failed: "Your changes are still here. Try saving again.",
  save: "Save",
  cancel: "Cancel",
  duplicate: "Duplicate",
  delete: "Delete",
  editHint: "Edit annotation",
};
const pl: typeof en = {
  add: "Dodaj: {{name}}",
  text: "Tekst",
  note: "Notatka",
  table: "Tabela",
  edit: "Edytuj: {{kind}}",
  description:
    "Zapisane w tym widoku. Kliknij dwukrotnie, aby edytować; przeciągnij uchwyty, aby zmienić rozmiar.",
  content: "Treść",
  newText: "Dodaj kontekst",
  newNote: "Napisz notatkę",
  updated: "Zaktualizowano adnotację",
  created: "Dodano adnotację",
  deleted: "Usunięto adnotację",
  fontSize: "Rozmiar tekstu",
  addRow: "Dodaj wiersz",
  addColumn: "Dodaj kolumnę",
  removeRow: "Usuń wiersz {{row}}",
  removeColumn: "Usuń kolumnę {{column}}",
  cell: "Wiersz {{row}}, kolumna {{column}}",
  pasteHint: "Wklej komórki arkusza do komórki, aby wypełnić prostokąt.",
  limit:
    "Tabela obsługuje do 100 wierszy, 20 kolumn, 5000 znaków w komórce i 100000 znaków łącznie.",
  failed: "Zmiany zostały zachowane. Spróbuj zapisać ponownie.",
  save: "Zapisz",
  cancel: "Anuluj",
  duplicate: "Duplikuj",
  delete: "Usuń",
  editHint: "Edytuj adnotację",
};
i18n.addResourceBundle("en", "annotations", en);
i18n.addResourceBundle("pl", "annotations", pl);

i18n.addResourceBundle("en", "translation", { annotations: en }, true);
i18n.addResourceBundle("pl", "translation", { annotations: pl }, true);
