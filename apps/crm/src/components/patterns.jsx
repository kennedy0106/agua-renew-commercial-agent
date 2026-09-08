import { AlertCircle, Inbox, LockKeyhole, RotateCw } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert.jsx";
import { Badge } from "@/components/ui/badge.jsx";
import { Button } from "@/components/ui/button.jsx";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty.jsx";
import { Skeleton } from "@/components/ui/skeleton.jsx";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet.jsx";
import { cn } from "@/lib/utils.js";

export function DataState({
  kind = "empty",
  title,
  description,
  actionLabel,
  onAction,
  className,
}) {
  if (kind === "loading") {
    return (
      <div className={cn("renew-data-skeleton", className)} role="status" aria-live="polite" aria-busy="true" aria-label={title || "Cargando contenido"}>
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-12 w-full" />
      </div>
    );
  }

  if (kind === "error") {
    return (
      <Alert variant="destructive" className={className}>
        <AlertCircle />
        <AlertTitle>{title || "No pudimos cargar esta sección"}</AlertTitle>
        <AlertDescription>{description}</AlertDescription>
        {onAction ? (
          <Button variant="outline" onClick={onAction}>
            <RotateCw data-icon="inline-start" />
            {actionLabel || "Reintentar"}
          </Button>
        ) : null}
      </Alert>
    );
  }

  return (
    <Empty className={className}>
      <EmptyHeader>
        <EmptyMedia variant="icon"><Inbox /></EmptyMedia>
        <EmptyTitle>{title || "No hay elementos"}</EmptyTitle>
        <EmptyDescription>{description}</EmptyDescription>
      </EmptyHeader>
      {onAction ? (
        <EmptyContent>
          <Button variant="outline" onClick={onAction}>{actionLabel}</Button>
        </EmptyContent>
      ) : null}
    </Empty>
  );
}

export function ViewLoadingState({ title = "Cargando vista" }) {
  return (
    <section
      className="renew-view-loading"
      role="status"
      aria-live="polite"
      aria-busy="true"
      aria-label={title}
    >
      <div className="renew-view-loading-header" aria-hidden="true">
        <Skeleton className="renew-view-loading-icon" />
        <div>
          <Skeleton className="renew-view-loading-title" />
          <Skeleton className="renew-view-loading-copy" />
        </div>
      </div>
      <div className="renew-view-loading-toolbar" aria-hidden="true">
        <Skeleton />
        <Skeleton />
        <Skeleton />
      </div>
      <div className="renew-view-loading-body" aria-hidden="true">
        <Skeleton />
        <Skeleton />
        <Skeleton />
        <Skeleton />
      </div>
    </section>
  );
}

export function PermissionState({ onReturn }) {
  return (
    <section className="renew-permission-state" aria-labelledby="permission-title">
      <Empty>
        <EmptyHeader>
          <EmptyMedia variant="icon"><LockKeyhole /></EmptyMedia>
          <EmptyTitle id="permission-title">No tiene permiso para ver esta sección</EmptyTitle>
          <EmptyDescription>
            Su sesión sigue activa. El acceso depende del rol configurado por Agua ReNew.
          </EmptyDescription>
        </EmptyHeader>
        <EmptyContent>
          <Button onClick={onReturn}>Volver al Resumen</Button>
        </EmptyContent>
      </Empty>
    </section>
  );
}

export function StatusBadge({ children, tone = "neutral" }) {
  const variant = tone === "danger" ? "destructive" : tone === "neutral" ? "outline" : "secondary";
  return <Badge variant={variant} data-tone={tone}>{children}</Badge>;
}

export function FilterBar({ children, className }) {
  return <div className={cn("renew-filter-bar", className)}>{children}</div>;
}

export function ResponsiveDataView({ children, className }) {
  return <div className={cn("renew-responsive-data-view", className)}>{children}</div>;
}

export function EntitySheet({ open, onOpenChange, title, description, children, className }) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className={className}>
        <SheetHeader className="sr-only">
          <SheetTitle>{title}</SheetTitle>
          <SheetDescription>{description}</SheetDescription>
        </SheetHeader>
        {children}
      </SheetContent>
    </Sheet>
  );
}
