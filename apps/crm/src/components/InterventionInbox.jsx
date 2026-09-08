import { useCallback, useDeferredValue, useEffect, useRef, useState } from "react";
import { AlertCircle, ArrowDownUp, ArrowRight, Bot, CalendarDays, CheckCircle2, ExternalLink, Image, Megaphone, MessageCircleMore, Search, X } from "lucide-react";
import { api, queryString } from "../api.js";
import { PageHeader } from "./Shell.jsx";
import { DataState, EntitySheet, FilterBar, ResponsiveDataView, StatusBadge } from "./patterns.jsx";
import { useIsMobile } from "@/hooks/use-mobile.js";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert.jsx";
import { Avatar, AvatarFallback } from "@/components/ui/avatar.jsx";
import { Badge } from "@/components/ui/badge.jsx";
import { Button } from "@/components/ui/button.jsx";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card.jsx";
import { Field, FieldDescription, FieldGroup, FieldLabel, FieldSet, FieldLegend } from "@/components/ui/field.jsx";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group.jsx";
import { Input } from "@/components/ui/input.jsx";
import { Pagination, PaginationContent, PaginationItem } from "@/components/ui/pagination.jsx";
import { ScrollArea } from "@/components/ui/scroll-area.jsx";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select.jsx";
import { Spinner } from "@/components/ui/spinner.jsx";
import { Textarea } from "@/components/ui/textarea.jsx";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group.jsx";
import { cn } from "@/lib/utils.js";

export const inboxBuckets = [
  ["ACTIONABLE", "Por revisar", "actionable"], ["READY", "Listos", "ready"],
  ["NEEDS_DATA", "Faltan datos", "needs_data"], ["HANDED_OFF", "Derivados", "handed_off"],
];
const qualificationLabels = { UNREVIEWED: "Sin revisar", NEEDS_DATA: "Faltan datos", READY: "Listo para WhatsApp", HANDED_OFF: "Derivado" };
const intentLabels = { EXPLORING: "Explorando", INTERESTED: "Interesado", QUALIFIED: "Calificado", READY_TO_BUY: "Listo para comprar" };
const qualityLabels = { INSUFFICIENT: "Insuficiente", PARTIAL: "Parcial", COMPLETE: "Completa" };
const productLabels = { "20l": "Bidón 20 L", "1l": "Botella 1 L", "625ml": "Botella 625 ml", "10_5l": "Galonera 10.5 L" };
const modalityLabels = { maquila: "Maquila", distribution_agua_renew: "Distribución ReNew", final_customer: "Consumo final" };
const channelLabels = { instagram: "Instagram", facebook_messenger: "Messenger" };
const priorityLabels = { URGENT: "Urgente", HIGH: "Alta", MEDIUM: "Media", LOW: "Normal" };
const formatDate = (value) => value ? new Intl.DateTimeFormat("es-PE", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "America/Lima" }).format(new Date(value)) : "Sin actividad reciente";

export function InterventionInbox({ user, notify, onError }) {
  const isMobile = useIsMobile();
  const [bucket, setBucket] = useState("ACTIONABLE");
  const [q, setQ] = useState("");
  const [sort, setSort] = useState("RECENT");
  const [days, setDays] = useState("ALL");
  const [page, setPage] = useState(1);
  const [data, setData] = useState(null);
  const [listError, setListError] = useState("");
  const [selected, setSelected] = useState(null);
  const [detail, setDetail] = useState(null);
  const [detailError, setDetailError] = useState("");
  const [actionState, setActionState] = useState({ key: "", error: "", conflict: false });
  const [loading, setLoading] = useState(true);
  const listRequest = useRef(0);
  const detailRequest = useRef(0);
  const loadedPage = useRef(1);
  const listRegion = useRef(null);
  const selectedTrigger = useRef(null);
  const deferredQuery = useDeferredValue(q);

  const load = useCallback(async () => {
    const request = ++listRequest.current;
    setLoading(true); setListError("");
    try {
      const result = await api(`/api/crm/v1/intervention-inbox?${queryString({ bucket, q: deferredQuery, sort, days: days === "ALL" ? "" : days, page, pageSize: 20 })}`);
      if (request === listRequest.current) {
        const resolvedPage = result.page ?? page;
        loadedPage.current = resolvedPage;
        setData(result);
        setPage(resolvedPage);
        requestAnimationFrame(() => {
          const viewport = listRegion.current?.querySelector('[data-slot="scroll-area-viewport"]');
          if (viewport) viewport.scrollTop = 0;
        });
      }
    } catch (error) {
      if (request === listRequest.current) { setPage(loadedPage.current); setListError(error.message || "No pudimos actualizar la cola."); onError(error); }
    } finally { if (request === listRequest.current) setLoading(false); }
  }, [bucket, deferredQuery, sort, days, page, onError]);
  useEffect(() => { load(); }, [load]);

  async function open(item, trigger) {
    const request = ++detailRequest.current;
    selectedTrigger.current = trigger ?? selectedTrigger.current;
    setSelected(item); setDetail(null); setDetailError(""); setActionState({ key: "", error: "", conflict: false });
    try {
      const result = await api(`/api/crm/v1/opportunities/${item.id}`);
      if (request === detailRequest.current) setDetail(result);
    } catch (error) {
      if (request === detailRequest.current) { setDetailError(error.message || "No pudimos cargar la revisión."); onError(error); }
    }
  }
  async function mutate(key, work, message) {
    setActionState({ key, error: "", conflict: false });
    try {
      const result = await work(); notify(message); await load();
      if (selected) await open(result?.opportunity ? { ...selected, ...result.opportunity } : selected);
      return result;
    } catch (error) {
      const conflict = error.status === 409;
      setActionState({ key: "", conflict, error: conflict ? "Este prospecto cambió en otra sesión. Recargue la revisión antes de continuar." : error.message || "No pudimos guardar el cambio." });
      onError(error); throw error;
    } finally {
      setActionState((current) => current.error ? current : { key: "", error: "", conflict: false });
    }
  }
  function closeReview({ restoreFocus = true } = {}) {
    detailRequest.current += 1; setSelected(null); setDetail(null); setDetailError(""); setActionState({ key: "", error: "", conflict: false });
    if (restoreFocus) requestAnimationFrame(() => selectedTrigger.current?.focus());
  }
  function resetListScroll() {
    const viewport = listRegion.current?.querySelector('[data-slot="scroll-area-viewport"]');
    if (viewport) viewport.scrollTop = 0;
  }
  function chooseBucket(value) { if (!value || loading) return; closeReview({ restoreFocus: false }); loadedPage.current = 1; resetListScroll(); setBucket(value); setPage(1); }
  function changeTemporalFilter(setter, value) { if (!value || loading) return; closeReview({ restoreFocus: false }); loadedPage.current = 1; resetListScroll(); setter(value); setPage(1); }
  function changePage(next) { if (loading || next < 1 || next > totalPages) return; closeReview({ restoreFocus: false }); resetListScroll(); setPage(next); }

  const totalPages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;
  const currentBucket = inboxBuckets.find(([value]) => value === bucket);
  const reviewProps = {
    item: selected, detail, detailError, user, actionState, onClose: closeReview,
    onRetry: () => open(selected), onConflictReload: () => open(selected),
    onQualify: (form) => mutate("qualify", () => api(`/api/crm/v1/opportunities/${selected.id}/qualification`, { method: "POST", body: { version: detail.opportunity.version, ...form } }), "Clasificación confirmada"),
  };

  return <div className="renew-inbox-page">
    <PageHeader title="Bandeja Meta" description="Prospectos clasificados por las automatizaciones, listos para revisión y contacto humano." actions={
      <InputGroup className="renew-inbox-search"><InputGroupAddon><Search aria-hidden="true" /></InputGroupAddon><InputGroupInput aria-label="Buscar en la bandeja" value={q} onChange={(event) => { closeReview({ restoreFocus: false }); loadedPage.current = 1; resetListScroll(); setQ(event.target.value); setPage(1); }} placeholder="Nombre, teléfono, mensaje o anuncio" /></InputGroup>
    } />
    <FilterBar className="renew-inbox-filters">
      <div className="renew-bucket-mobile"><label htmlFor="inbox-bucket">Vista de la bandeja</label><Select value={bucket} onValueChange={chooseBucket}><SelectTrigger id="inbox-bucket"><SelectValue /></SelectTrigger><SelectContent position="popper" side="bottom" align="start" sideOffset={8} avoidCollisions={false} className="renew-bucket-select-menu"><SelectGroup>{inboxBuckets.map(([value, label, countKey]) => <SelectItem value={value} key={value}>{label} ({data ? data.counts?.[countKey] ?? 0 : "—"})</SelectItem>)}</SelectGroup></SelectContent></Select></div>
      <ToggleGroup className="renew-bucket-desktop" type="single" variant="outline" value={bucket} onValueChange={chooseBucket} aria-label="Clasificación de la bandeja">
        {inboxBuckets.map(([value, label, countKey]) => <ToggleGroupItem value={value} key={value} aria-label={`${label}, ${data ? data.counts?.[countKey] ?? 0 : "sin conteo"}`}><span>{label}</span><Badge variant="secondary">{data ? data.counts?.[countKey] ?? 0 : "—"}</Badge></ToggleGroupItem>)}
      </ToggleGroup>
      <div className="renew-inbox-temporal-filters">
        <Select value={sort} onValueChange={(value) => changeTemporalFilter(setSort, value)} disabled={loading}>
          <SelectTrigger aria-label="Ordenar mensajes" className="renew-inbox-temporal-trigger"><ArrowDownUp aria-hidden="true" /><SelectValue /></SelectTrigger>
          <SelectContent position="popper" side="bottom" align="end" sideOffset={8} className="renew-bucket-select-menu"><SelectGroup><SelectItem value="RECENT">Más recientes</SelectItem><SelectItem value="PRIORITY">Mayor prioridad</SelectItem></SelectGroup></SelectContent>
        </Select>
        <Select value={days} onValueChange={(value) => changeTemporalFilter(setDays, value)} disabled={loading}>
          <SelectTrigger aria-label="Filtrar mensajes por días" className="renew-inbox-temporal-trigger"><CalendarDays aria-hidden="true" /><SelectValue /></SelectTrigger>
          <SelectContent position="popper" side="bottom" align="end" sideOffset={8} className="renew-bucket-select-menu"><SelectGroup><SelectItem value="ALL">Cualquier fecha</SelectItem><SelectItem value="1">Últimas 24 horas</SelectItem><SelectItem value="7">Últimos 7 días</SelectItem><SelectItem value="30">Últimos 30 días</SelectItem><SelectItem value="90">Últimos 90 días</SelectItem></SelectGroup></SelectContent>
        </Select>
      </div>
    </FilterBar>
    <ResponsiveDataView className="renew-inbox-layout">
      <Card className="renew-inbox-queue" aria-busy={loading}>
        <CardHeader><div><CardTitle>{currentBucket?.[1]}</CardTitle><p aria-live="polite">{data ? `${data.total} oportunidades en esta vista` : "Cargando oportunidades…"}</p></div><StatusBadge tone="success"><span className="renew-live-dot" />Datos de Meta activos</StatusBadge></CardHeader>
        <CardContent>
          {listError ? <Alert variant="destructive" className="renew-inbox-partial-error"><AlertCircle /><AlertTitle>No se pudo actualizar la cola</AlertTitle><AlertDescription>{listError}</AlertDescription><Button variant="outline" onClick={load}>Reintentar</Button></Alert> : null}
          {loading && !data ? <DataState kind="loading" title="Cargando cola de Meta" /> : null}
          {data?.items.length ? <div className="renew-inbox-scroll-region" ref={listRegion}><ScrollArea className={cn("renew-inbox-scroll", loading && "is-updating")} aria-hidden={loading || undefined}><div className="renew-inbox-list" role="list" aria-label={`Prospectos en ${currentBucket?.[1]}`}>{data.items.map((item, index) => <div className="renew-inbox-list-item" role="listitem" style={{ "--inbox-index": index }} key={item.id}><Button variant="ghost" className={cn("renew-inbox-row", selected?.id === item.id && "is-selected")} onClick={(event) => open(item, event.currentTarget)} aria-pressed={selected?.id === item.id}>
            <Avatar><AvatarFallback>{item.contactName.slice(0, 1).toUpperCase()}</AvatarFallback></Avatar>
            <span className="renew-lead-main"><span className="renew-lead-heading"><strong>{item.contactName}</strong><small>{channelLabels[item.sourceChannel] ?? item.sourceChannel} · {formatDate(item.lastMetaMessageAt)}</small></span><span className="renew-lead-message">{item.lastMessage || item.automationSummary}</span><span className="renew-lead-facts">{item.product ? <Badge variant="outline">{productLabels[item.product] ?? item.product}</Badge> : null}{item.modality ? <Badge variant="outline">{modalityLabels[item.modality] ?? item.modality}</Badge> : null}{item.missingFields.map((field) => <Badge variant="secondary" key={field}>Falta {field.toLowerCase()}</Badge>)}</span></span>
            <span className="renew-lead-state"><StatusBadge tone={item.priority === "URGENT" ? "danger" : item.priority === "HIGH" ? "warning" : "neutral"}>{priorityLabels[item.priority] ?? item.priority}</StatusBadge><ArrowRight aria-hidden="true" /></span>
          </Button></div>)}</div></ScrollArea>{loading ? <div className="renew-inbox-page-loading" role="status" aria-live="polite"><Spinner /><span>Cargando página {page}…</span></div> : null}</div> : null}
          {data && !data.items.length ? <DataState title={q.trim() || days !== "ALL" ? "Sin resultados para estos filtros" : `No hay prospectos en “${currentBucket?.[1]}”`} description={q.trim() || days !== "ALL" ? "Cambie la búsqueda o amplíe el período de actividad." : "Cambie de vista o espere la próxima actualización de Meta."} /> : null}
          {data && data.total > data.pageSize ? <Pagination className="renew-inbox-pagination" aria-label="Paginación de prospectos"><PaginationContent><PaginationItem><Button variant="outline" disabled={loading || page <= 1} onClick={() => changePage(page - 1)}>Anterior</Button></PaginationItem><PaginationItem><span aria-live="polite">{loading ? `Cargando página ${page}…` : `Página ${data.page ?? page} de ${totalPages}`}</span></PaginationItem><PaginationItem><Button variant="outline" disabled={loading || page >= totalPages} onClick={() => changePage(page + 1)}>Siguiente</Button></PaginationItem></PaginationContent></Pagination> : null}
        </CardContent>
      </Card>
      {!isMobile ? <ReviewSurface {...reviewProps} /> : null}
      {isMobile ? <EntitySheet open={Boolean(selected)} onOpenChange={(openState) => { if (!openState) closeReview(); }} className="renew-inbox-mobile-sheet" title={selected ? `Revisión de ${selected.contactName}` : "Revisión de prospecto"} description="Detalle y clasificación del prospecto seleccionado en la Bandeja Meta.">{selected ? <ReviewContent {...reviewProps} /> : null}</EntitySheet> : null}
    </ResponsiveDataView>
  </div>;
}

function ReviewSurface(props) {
  if (!props.item) return <Card className="renew-inbox-review renew-inbox-review-empty"><DataState title="Seleccione un prospecto" description="Revise la clasificación automática, confirme los datos y decida el siguiente paso." /></Card>;
  return <Card className="renew-inbox-review"><ReviewContent {...props} /></Card>;
}

function ReviewContent({ item, detail, detailError, user, actionState, onClose, onRetry, onConflictReload, onQualify }) {
  if (!item) return null;
  const canEdit = Boolean(user);
  return <div className="renew-review-content">
    <header className="renew-review-header"><div><Badge variant="outline"><MessageCircleMore />{channelLabels[item.sourceChannel] ?? item.sourceChannel}</Badge><h2>{item.contactName}</h2><p>{detail ? `${item.phoneE164 || "Teléfono pendiente"} · ${detail.messages.length} mensajes observados` : "Cargando datos del prospecto…"}</p></div><Button variant="ghost" size="icon" onClick={onClose} aria-label="Cerrar revisión"><X aria-hidden="true" /></Button></header>
    {detailError ? <DataState kind="error" title="No pudimos cargar la revisión" description={detailError} actionLabel="Reintentar" onAction={onRetry} /> : null}
    {!detail && !detailError ? <DataState kind="loading" title="Cargando revisión" /> : null}
    {detail ? <ScrollArea className="renew-review-scroll"><div className="renew-review-body">
      {actionState.error ? <Alert variant="destructive"><AlertCircle /><AlertTitle>{actionState.conflict ? "Conflicto de versión" : "No se guardó el cambio"}</AlertTitle><AlertDescription>{actionState.error}</AlertDescription>{actionState.conflict ? <Button variant="outline" onClick={onConflictReload}>Recargar revisión</Button> : null}</Alert> : null}
      <Handoff item={{ ...item, ...detail.opportunity }} />
      <section className="renew-review-summary" aria-labelledby={`review-summary-${item.id}`}>
        <header className="renew-review-section-heading"><span><Bot aria-hidden="true" /></span><div><h3 id={`review-summary-${item.id}`}>Diagnóstico comercial</h3><p>Lectura automática y estado operativo de este prospecto.</p></div></header>
        <Alert className="renew-automation-alert"><Bot /><AlertTitle>Lectura de la automatización</AlertTitle><AlertDescription>{item.automationSummary}</AlertDescription></Alert>
        <dl className="renew-review-facts"><Fact label="Estado" value={qualificationLabels[item.qualificationStatus] ?? item.qualificationStatus} /><Fact label="Intención" value={intentLabels[item.intentLevel] ?? item.intentLevel} /><Fact label="Calidad de datos" value={qualityLabels[item.dataQuality] ?? item.dataQuality} /></dl>
        {item.reviewReason ? <Alert><AlertCircle /><AlertTitle>Motivo de revisión</AlertTitle><AlertDescription>{item.reviewReason}</AlertDescription></Alert> : null}
      </section>
      <SourceReference item={{ ...item, ...detail.opportunity }} />
      <QualificationForm key={`${detail.opportunity.version}-${item.id}`} item={{ ...item, ...detail.opportunity }} canEdit={canEdit} busy={actionState.key === "qualify"} onSave={onQualify} />
      <Conversation messages={detail.messages} />
    </div></ScrollArea> : null}
  </div>;
}

function Fact({ label, value }) { return <div><dt>{label}</dt><dd>{value || "—"}</dd></div>; }

function SourceReference({ item }) {
  const context = item.sourceContext ?? {};
  const channel = channelLabels[item.sourceChannel] ?? item.sourceChannel ?? "Meta";
  const isAd = Boolean(item.sourceAdId || item.sourceOrigin === "ad_automation" || context.source === "ADS");
  const title = context.adTitle || (isAd ? "Anuncio de Meta · referencia no disponible" : item.sourceOrigin === "organic_dm" ? "Conversación orgánica" : "Origen no identificado");
  const reference = context.ref || context.postId || null;
  const safeUrl = /^https:\/\//i.test(context.refererUri ?? "") ? context.refererUri : null;
  return <section className="renew-source-reference" aria-labelledby="source-reference-title">
    <header className="renew-review-section-heading"><span><Megaphone aria-hidden="true" /></span><div><h3 id="source-reference-title">Origen del contacto</h3><p>Referencia para retomar la conversación con el contexto correcto.</p></div></header>
    <dl>
      <Fact label="Canal" value={channel} />
      <Fact label={isAd ? "Anuncio" : "Entrada"} value={title} />
      {item.sourceAdId ? <Fact label="ID del anuncio" value={item.sourceAdId} /> : null}
      {reference ? <Fact label="Referencia" value={reference} /> : null}
    </dl>
    {safeUrl ? <Button asChild variant="outline"><a href={safeUrl} target="_blank" rel="noreferrer"><ExternalLink data-icon="inline-start" />Ver origen en Meta</a></Button> : null}
  </section>;
}
function ControlledSelect({ id, label, value, onValueChange, options, disabled, placeholder }) {
  return <Field data-disabled={disabled || undefined}><FieldLabel htmlFor={id}>{label}</FieldLabel><Select value={value || undefined} onValueChange={onValueChange} disabled={disabled}><SelectTrigger id={id}><SelectValue placeholder={placeholder} /></SelectTrigger><SelectContent position="popper" side="bottom" align="start" sideOffset={8} avoidCollisions={false} className="renew-field-select-menu"><SelectGroup>{placeholder ? <SelectItem value="__empty">{placeholder}</SelectItem> : null}{Object.entries(options).map(([optionValue, optionLabel]) => <SelectItem value={optionValue} key={optionValue}>{optionLabel}</SelectItem>)}</SelectGroup></SelectContent></Select></Field>;
}

function QualificationForm({ item, canEdit, busy, onSave }) {
  const [form, setForm] = useState({ qualificationStatus: item.qualificationStatus === "HANDED_OFF" ? "READY" : item.qualificationStatus, intentLevel: item.intentLevel, dataQuality: item.dataQuality, priorityScore: item.priorityScore, product: item.product ?? "", modality: item.modality ?? "", summary: item.automationSummary ?? "", reviewReason: item.reviewReason ?? "" });
  const set = (key, value) => setForm((current) => ({ ...current, [key]: value === "__empty" ? "" : value }));
  return <form className="renew-qualification-form" onSubmit={(event) => { event.preventDefault(); onSave({ ...form, priorityScore: Number(form.priorityScore) }).catch(() => {}); }}>
    <FieldSet disabled={!canEdit || busy}><FieldLegend>Confirmar clasificación</FieldLegend><FieldDescription>{canEdit ? "Revise y confirme los datos antes del contacto humano." : "Asuma el lead para editar su clasificación."}</FieldDescription><FieldGroup className="renew-form-grid">
      <ControlledSelect id="qualification-product" label="Producto" value={form.product} onValueChange={(value) => set("product", value)} options={productLabels} disabled={!canEdit || busy} placeholder="Sin confirmar" />
      <ControlledSelect id="qualification-modality" label="Modalidad" value={form.modality} onValueChange={(value) => set("modality", value)} options={modalityLabels} disabled={!canEdit || busy} placeholder="Sin confirmar" />
      <ControlledSelect id="qualification-intent" label="Intención" value={form.intentLevel} onValueChange={(value) => set("intentLevel", value)} options={intentLabels} disabled={!canEdit || busy} />
      <ControlledSelect id="qualification-quality" label="Calidad" value={form.dataQuality} onValueChange={(value) => set("dataQuality", value)} options={qualityLabels} disabled={!canEdit || busy} />
      <ControlledSelect id="qualification-result" label="Resultado" value={form.qualificationStatus} onValueChange={(value) => set("qualificationStatus", value)} options={{ UNREVIEWED: "Sin revisar", NEEDS_DATA: "Faltan datos", READY: "Listo para WhatsApp" }} disabled={!canEdit || busy} />
      <Field data-disabled={!canEdit || busy || undefined}><FieldLabel htmlFor="qualification-priority">Prioridad</FieldLabel><Input id="qualification-priority" disabled={!canEdit || busy} type="number" min="0" max="100" value={form.priorityScore} onChange={(event) => set("priorityScore", event.target.value)} /></Field>
      <Field className="renew-form-wide" data-disabled={!canEdit || busy || undefined}><FieldLabel htmlFor="qualification-summary">Resumen confirmado <span aria-hidden="true">*</span></FieldLabel><Textarea id="qualification-summary" disabled={!canEdit || busy} rows="3" required value={form.summary} onChange={(event) => set("summary", event.target.value)} /></Field>
      <Field className="renew-form-wide" data-disabled={!canEdit || busy || undefined}><FieldLabel htmlFor="qualification-reason">Motivo de revisión</FieldLabel><Input id="qualification-reason" disabled={!canEdit || busy} value={form.reviewReason} onChange={(event) => set("reviewReason", event.target.value)} /></Field>
    </FieldGroup></FieldSet>
    {canEdit ? <Button className="w-full" variant="secondary" disabled={busy}>{busy ? <Spinner data-icon="inline-start" /> : <CheckCircle2 data-icon="inline-start" />}{busy ? "Guardando…" : "Guardar clasificación"}</Button> : null}
  </form>;
}

function Handoff({ item }) {
  const fallbackMessage = `Hola, ${item.contactName}. Soy parte del equipo comercial de Agua ReNew. Revisé su consulta${item.product ? ` sobre ${productLabels[item.product]}` : ""}. ¿Desea que continuemos por WhatsApp?`;
  const message = item.whatsappMessage || item.suggestedWhatsappMessage || item.extractedFields?.suggestedWhatsappMessage || fallbackMessage;
  const missing = [!item.phoneE164 && "teléfono", !item.product && "producto", !item.modality && "modalidad"].filter(Boolean);
  const link = missing.length === 0 ? `https://wa.me/${String(item.phoneE164).replace(/\D/g, "")}?text=${encodeURIComponent(message.trim())}` : null;
  return <section className="renew-handoff" aria-labelledby="handoff-title"><header><span><MessageCircleMore /></span><div><h3 id="handoff-title">Pasar a WhatsApp</h3><p>El enlace se crea automáticamente al completar los datos del prospecto.</p></div></header>
    {link ? <FieldGroup><Button asChild className="w-full renew-handoff-action"><a href={link} target="_blank" rel="noreferrer"><MessageCircleMore data-icon="inline-start" />Abrir WhatsApp</a></Button><Field><FieldLabel htmlFor="handoff-message">Mensaje preparado {item.analysisSource === "ai" ? <Badge variant="outline"><Bot aria-hidden="true" />Borrador de IA</Badge> : null}</FieldLabel><Textarea id="handoff-message" rows="4" value={message} disabled /></Field></FieldGroup> : <Alert><AlertCircle /><AlertTitle>Faltan datos para WhatsApp</AlertTitle><AlertDescription>Complete {missing.join(", ")} para crear el enlace.</AlertDescription></Alert>}
  </section>;
}

function Conversation({ messages }) {
  const conversational = messages.filter((message) => message.messageKind !== "event").slice(-4);
  return <section className="renew-conversation" aria-labelledby="conversation-title"><header><h3 id="conversation-title">Últimos mensajes</h3><Badge variant="outline">Solo lectura</Badge></header>{conversational.length ? conversational.map((message) => <article className={message.direction === "inbound" ? "is-inbound" : "is-outbound"} key={message.id}><p>{message.messageKind === "media" ? <><Image aria-hidden="true" />{message.displayContent || "Contenido multimedia compartido"}</> : (message.displayContent || String(message.content ?? "").replace(/�+/g, "").trim())}</p><small>{message.actorLabel || (message.direction === "inbound" ? "Cliente" : "Agua ReNew")} · {formatDate(message.sourceCreatedAt || message.createdAt)}</small></article>) : <DataState title="Sin mensajes conversacionales" description="Solo hay actividad técnica de Meta registrada para esta oportunidad." />}</section>;
}
