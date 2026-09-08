import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "./ui/alert-dialog.jsx";
import { Button } from "./ui/button.jsx";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "./ui/sheet.jsx";
import { Textarea } from "./ui/textarea.jsx";

export function Drawer({
  label,
  onClose,
  className = "entity-drawer",
  children,
}) {
  return (
    <Sheet open onOpenChange={(open) => { if (!open) onClose(); }}>
      <SheetContent
        side="right"
        showCloseButton={false}
        className={`${className} renew-entity-sheet`}
        onClickCapture={(event) => {
          if (event.target.closest?.('[data-slot="sheet-content"]') !== event.currentTarget) return;
          const closeTrigger = event.target.closest?.('[data-drawer-close], [aria-label^="Cerrar"]');
          if (!closeTrigger) return;
          event.preventDefault();
          event.stopPropagation();
          onClose();
        }}
      >
        <SheetHeader className="sr-only">
          <SheetTitle>{label}</SheetTitle>
        </SheetHeader>
        {children}
      </SheetContent>
    </Sheet>
  );
}

export function ConfirmDialog({
  title,
  description,
  confirmLabel,
  cancelLabel = "Cancelar",
  tone = "primary",
  busy = false,
  inputLabel,
  inputHint,
  value = "",
  onValueChange,
  onConfirm,
  onClose,
}) {
  const canConfirm = !inputLabel || value.trim().length > 0;
  return (
    <AlertDialog open onOpenChange={(open) => { if (!open && !busy) onClose(); }}>
      <AlertDialogContent size="default" className="renew-confirm-dialog">
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        <form
          className="renew-confirm-form"
          onSubmit={(event) => {
            event.preventDefault();
            if (canConfirm && !busy) onConfirm();
          }}
        >
          {inputLabel ? (
            <label>
              <span>{inputLabel} <small className="required-mark">Obligatorio</small></span>
              <Textarea
                autoFocus
                rows="3"
                required
                value={value}
                onChange={(event) => onValueChange(event.target.value)}
                aria-describedby={inputHint ? "confirm-dialog-hint" : undefined}
              />
              {inputHint ? <small id="confirm-dialog-hint" className="field-hint">{inputHint}</small> : null}
            </label>
          ) : null}
          <AlertDialogFooter className="renew-confirm-actions">
            <AlertDialogCancel disabled={busy} onClick={onClose}>{cancelLabel}</AlertDialogCancel>
            <Button type="submit" variant={tone === "danger" ? "destructive" : "default"} disabled={!canConfirm || busy}>
              {busy ? "Procesando…" : confirmLabel}
            </Button>
          </AlertDialogFooter>
        </form>
      </AlertDialogContent>
    </AlertDialog>
  );
}
