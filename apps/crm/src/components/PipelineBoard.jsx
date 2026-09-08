import { LegacyButton } from "./controls.jsx";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import { api, queryString } from "../api.js";
import { Icon } from "../icons.jsx";
import { ConfirmDialog } from "./Drawer.jsx";
import { Check, GripVertical, UserRound, X } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select.jsx";

const PRODUCT = {
  "20l": "Bidón 20 L",
  "1l": "Botella 1 L",
  "625ml": "Botella 625 ml",
  "10_5l": "Galonera 10.5 L",
};
const initialColumn = () => ({
  items: [],
  total: 0,
  nextCursor: null,
  loading: true,
});

export default function PipelineBoard({
  stages,
  filters,
  onSelect,
  onMoved,
  onError,
}) {
  const openStages = stages.filter((stage) => !stage.terminalKind);
  const terminals = stages.filter((stage) => stage.terminalKind);
  const [columns, setColumns] = useState(() =>
    Object.fromEntries(stages.map((stage) => [stage.key, initialColumn()])),
  );
  const [mobileStage, setMobileStage] = useState(openStages[0]?.key ?? "");
  const [stageDecision, setStageDecision] = useState(null);
  const [activeDrag, setActiveDrag] = useState(null);
  const stageRequests = useRef({});
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, {
      activationConstraint: { delay: 180, tolerance: 8 },
    }),
    useSensor(KeyboardSensor),
  );
  const shared = useMemo(
    () => ({ q: filters.q, ownerId: filters.ownerId }),
    [filters.q, filters.ownerId],
  );
  useEffect(() => {
    if (
      openStages.length &&
      !openStages.some((stage) => stage.key === mobileStage)
    )
      setMobileStage(openStages[0].key);
  }, [openStages, mobileStage]);
  const loadStage = useCallback(
    async (stageKey, { append = false, cursor = null } = {}) => {
      const request = (stageRequests.current[stageKey] ?? 0) + 1;
      stageRequests.current[stageKey] = request;
      setColumns((current) => ({
        ...current,
        [stageKey]: {
          ...(current[stageKey] ?? initialColumn()),
          loading: true,
        },
      }));
      try {
        const result = await api(
          `/api/crm/v1/pipeline/stages/${stageKey}/opportunities?${queryString({ limit: 20, cursor, ...shared })}`,
        );
        if (request !== stageRequests.current[stageKey]) return;
        setColumns((current) => {
          const items = append
            ? [...(current[stageKey]?.items ?? []), ...result.items]
            : result.items;
          return {
            ...current,
            [stageKey]: {
              items: [
                ...new Map(items.map((item) => [item.id, item])).values(),
              ],
              total: result.total,
              nextCursor: result.nextCursor,
              loading: false,
            },
          };
        });
      } catch (error) {
        if (request !== stageRequests.current[stageKey]) return;
        setColumns((current) => ({
          ...current,
          [stageKey]: {
            ...(current[stageKey] ?? initialColumn()),
            loading: false,
          },
        }));
        onError(error);
      }
    },
    [shared, onError],
  );
  const reload = useCallback(
    () => Promise.all(stages.map((stage) => loadStage(stage.key))),
    [loadStage, stages],
  );
  useEffect(() => {
    reload();
  }, [reload]);

  function move(item, stageKey) {
    if (!item || !stageKey || stageKey === item.stageKey) return;
    if (["WON", "LOST"].includes(stageKey)) {
      setStageDecision({ item, stageKey, reason: "" });
      return;
    }
    commitMove(item, stageKey, null);
  }

  async function commitMove(item, stageKey, reason) {
    setColumns((current) => ({
      ...current,
      [item.stageKey]: {
        ...current[item.stageKey],
        items: current[item.stageKey].items.filter(
          (candidate) => candidate.id !== item.id,
        ),
        total: Math.max(0, current[item.stageKey].total - 1),
      },
      [stageKey]: {
        ...current[stageKey],
        items: [{ ...item, stageKey }, ...(current[stageKey]?.items ?? [])],
        total: (current[stageKey]?.total ?? 0) + 1,
      },
    }));
    try {
      await api(`/api/crm/v1/opportunities/${item.id}/stage`, {
        method: "POST",
        body: { stageKey, reason, version: item.version },
      });
      await reload();
      onMoved("Etapa actualizada");
    } catch (error) {
      await reload();
      onError(error);
    }
  }

  return (
    <>
      <DndContext
        sensors={sensors}
        onDragStart={({ active, activatorEvent }) => {
          const keyboard = activatorEvent instanceof KeyboardEvent;
          document.documentElement.dataset.dragInput = keyboard
            ? "keyboard"
            : "pointer";
          setActiveDrag({ item: active.data.current?.item, keyboard });
        }}
        onDragCancel={() => {
          delete document.documentElement.dataset.dragInput;
          setActiveDrag(null);
        }}
        onDragEnd={({ active, over }) => {
          const item = active.data.current?.item;
          delete document.documentElement.dataset.dragInput;
          setActiveDrag(null);
          move(item, over?.id);
        }}
      >
        <section
          className="pipeline-board"
          aria-label="Pipeline de oportunidades"
        >
          <div className="mobile-column-picker">
            <label htmlFor="visible-pipeline-stage">Etapa visible</label>
            <Select value={mobileStage} onValueChange={setMobileStage}>
              <SelectTrigger id="visible-pipeline-stage">
                <SelectValue />
              </SelectTrigger>
              <SelectContent
                position="popper"
                side="bottom"
                align="start"
                sideOffset={8}
                collisionPadding={12}
                className="renew-opportunity-select-menu"
              >
                <SelectGroup>
                  {openStages.map((stage) => (
                    <SelectItem key={stage.id} value={stage.key}>
                      {stage.name} · {columns[stage.key]?.total ?? 0}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
          </div>
          <div className="pipeline-board-heading">
            <div>
              <h2>Pipeline activo</h2>
              <p>Arrastre cada oportunidad para actualizar su etapa.</p>
            </div>
            <div
              className="terminal-destinations"
              role="group"
              aria-label="Etapas de cierre"
            >
              {terminals.map((stage) => (
                <Terminal
                  key={stage.id}
                  stage={stage}
                  count={columns[stage.key]?.total ?? 0}
                />
              ))}
            </div>
          </div>
          <div className="kanban">
            {openStages.map((stage) => (
              <StageColumn
                key={stage.id}
                stage={stage}
                mobileActive={stage.key === mobileStage}
                column={columns[stage.key] ?? initialColumn()}
                stages={stages}
                onSelect={onSelect}
                onMove={move}
                onMore={() =>
                  loadStage(stage.key, {
                    append: true,
                    cursor: columns[stage.key].nextCursor,
                  })
                }
              />
            ))}
          </div>
        </section>
        <DragOverlay
          dropAnimation={
            activeDrag?.keyboard
              ? null
              : {
                  duration: 180,
                  easing: "cubic-bezier(0.23, 1, 0.32, 1)",
                }
          }
        >
          {activeDrag?.item ? (
            <article className="kanban-card drag-overlay">
              <div className="kanban-card-main">
                <OpportunitySummary item={activeDrag.item} />
              </div>
            </article>
          ) : null}
        </DragOverlay>
      </DndContext>
      {stageDecision ? (
        <ConfirmDialog
          title={
            stageDecision.stageKey === "WON"
              ? "Marcar oportunidad como ganada"
              : "Marcar oportunidad como perdida"
          }
          description={
            stageDecision.stageKey === "WON"
              ? `${stageDecision.item.contactName} pasará al historial de cierres y conservará toda su actividad.`
              : `Registre por qué no avanzó la oportunidad de ${stageDecision.item.contactName}.`
          }
          confirmLabel={
            stageDecision.stageKey === "WON"
              ? "Confirmar como ganada"
              : "Confirmar pérdida"
          }
          tone={stageDecision.stageKey === "LOST" ? "danger" : "primary"}
          inputLabel={
            stageDecision.stageKey === "LOST" ? "Motivo de pérdida" : undefined
          }
          inputHint={
            stageDecision.stageKey === "LOST"
              ? "Sea específico: precio, plazo, competencia u otra razón verificable."
              : undefined
          }
          value={stageDecision.reason}
          onValueChange={(reason) =>
            setStageDecision((current) => ({ ...current, reason }))
          }
          onClose={() => setStageDecision(null)}
          onConfirm={() => {
            const decision = stageDecision;
            setStageDecision(null);
            commitMove(
              decision.item,
              decision.stageKey,
              decision.reason || null,
            );
          }}
        />
      ) : null}
    </>
  );
}

function StageColumn({
  stage,
  column,
  stages,
  onSelect,
  onMove,
  onMore,
  mobileActive,
}) {
  const { setNodeRef, isOver } = useDroppable({ id: stage.key });
  return (
    <section
      ref={setNodeRef}
      className={`kanban-column ${mobileActive ? "is-mobile-active" : ""} ${isOver ? "is-over" : ""}`}
      aria-labelledby={`pipeline-stage-${stage.id}`}
      aria-busy={column.loading}
    >
      <header>
        <span style={{ "--stage-color": stage.color }} />
        <h2 id={`pipeline-stage-${stage.id}`}>{stage.name}</h2>
        <b>{column.total}</b>
      </header>
      <div>
        {column.items.map((item) => (
          <OpportunityCard
            key={item.id}
            item={item}
            stages={stages}
            onSelect={onSelect}
            onMove={onMove}
          />
        ))}
        {column.loading && !column.items.length ? (
          <p role="status" aria-live="polite">Cargando oportunidades…</p>
        ) : null}
        {!column.loading && !column.items.length ? (
          <p className="kanban-empty"><strong>Etapa despejada</strong><span>Arrastre una oportunidad aquí para continuar.</span></p>
        ) : null}
        {column.nextCursor ? (
          <LegacyButton
            className="load-more"
            disabled={column.loading}
            onClick={onMore}
          >
            {column.loading ? "Cargando…" : "Cargar más"}
          </LegacyButton>
        ) : null}
      </div>
    </section>
  );
}

function OpportunityCard({ item, stages, onSelect, onMove }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } =
    useDraggable({ id: item.id, data: { item } });
  const style = transform
    ? { transform: `translate3d(${transform.x}px,${transform.y}px,0)` }
    : undefined;
  return (
    <article
      ref={setNodeRef}
      style={style}
      className={`kanban-card ${isDragging ? "is-dragging" : ""}`}
    >
      <LegacyButton
        className="kanban-drag-handle"
        type="button"
        aria-label={`Mover oportunidad de ${item.contactName}`}
        {...listeners}
        {...attributes}
      >
        <GripVertical aria-hidden="true" />
      </LegacyButton>
      <LegacyButton className="kanban-card-main" onClick={() => onSelect(item.id)}>
        <OpportunitySummary item={item} />
      </LegacyButton>
      <div className="mobile-stage-select">
        <label htmlFor={`opportunity-stage-${item.id}`}>Etapa</label>
        <Select
          value={item.stageKey}
          onValueChange={(stageKey) => onMove(item, stageKey)}
        >
          <SelectTrigger id={`opportunity-stage-${item.id}`}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent
            position="popper"
            side="bottom"
            align="start"
            sideOffset={8}
            collisionPadding={12}
            className="renew-opportunity-select-menu"
          >
            <SelectGroup>
              {stages.map((stage) => (
                <SelectItem key={stage.id} value={stage.key}>
                  {stage.name}
                </SelectItem>
              ))}
            </SelectGroup>
          </SelectContent>
        </Select>
      </div>
    </article>
  );
}

function OpportunitySummary({ item }) {
  const initials = item.contactName
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();
  return (
    <>
      <span className="kanban-card-avatar" aria-hidden="true">{initials}</span>
      <span className="kanban-card-copy">
        <strong>{item.contactName}</strong>
        <span>{PRODUCT[item.product] ?? "Producto pendiente"}</span>
      </span>
      <small className="kanban-card-owner">
        <UserRound aria-hidden="true" /> {item.ownerName ?? "Sin responsable"}
      </small>
      <Icon name="arrow" size={15} />
    </>
  );
}

function Terminal({ stage, count }) {
  const { setNodeRef, isOver } = useDroppable({ id: stage.key });
  const StatusIcon = stage.terminalKind === "WON" ? Check : X;
  return (
    <div
      ref={setNodeRef}
      className={`terminal-drop ${stage.terminalKind?.toLowerCase()} ${isOver ? "is-over" : ""}`}
    >
      <span style={{ "--stage-color": stage.color }}><StatusIcon aria-hidden="true" /></span>
      <div>
        <strong>{stage.name}</strong>
        <small>Soltar para cerrar</small>
      </div>
      <b>{count}</b>
    </div>
  );
}
