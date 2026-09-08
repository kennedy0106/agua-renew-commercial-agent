import { LegacyButton, LegacyInput, LegacyTextarea } from "./controls.jsx";
import { useCallback, useEffect, useRef, useState } from "react";
import { api, queryString } from "../api.js";
import { Icon } from "../icons.jsx";
import { nextTabValue } from "../tab-navigation.js";
import { ConfirmDialog, Drawer } from "./Drawer.jsx";
import { PageHeader } from "./Shell.jsx";
import {
  BadgeDollarSign,
  Boxes,
  CheckCircle2,
  FileText,
  PackageCheck,
  Plus,
  ReceiptText,
  ShoppingBag,
  Sparkles,
} from "lucide-react";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select.jsx";
import { DateTimePicker } from "./OpportunityDrawer.jsx";

const money = new Intl.NumberFormat("es-PE", {
  style: "currency",
  currency: "PEN",
});
const quoteStatus = {
  DRAFT: "Borrador",
  SENT: "Enviada",
  ACCEPTED: "Aceptada",
  REJECTED: "Rechazada",
  EXPIRED: "Vencida",
};
const orderStatus = {
  CONFIRMED: "Confirmado",
  IN_PREPARATION: "En preparación",
  READY: "Listo",
  DELIVERED: "Entregado",
  CANCELLED: "Cancelado",
};
const paymentStatus = {
  PENDING: "Pendiente",
  PARTIAL: "Parcial",
  PAID: "Pagado",
  REFUNDED: "Reembolsado",
};
const groupProducts = (items) =>
  items.reduce(
    (groups, item) => ({
      ...groups,
      [item.category]: [...(groups[item.category] ?? []), item],
    }),
    {},
  );
const REVENUE_TABS = [
  ["quotes", "Cotizaciones", FileText],
  ["orders", "Pedidos", ShoppingBag],
  ["catalog", "Catálogo", Boxes],
];

function RevenueSelect({ label, value, options, onValueChange, disabled = false }) {
  return (
    <div className="renew-revenue-select">
      {label ? <span>{label}</span> : null}
      <Select value={value} onValueChange={onValueChange} disabled={disabled}>
        <SelectTrigger aria-label={label || "Seleccionar opción"}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent
          position="popper"
          side="bottom"
          align="start"
          sideOffset={8}
          avoidCollisions={false}
          className="renew-revenue-select-menu"
        >
          <SelectGroup>
            {options.map(([optionValue, optionLabel]) => (
              <SelectItem key={optionValue} value={optionValue}>
                {optionLabel}
              </SelectItem>
            ))}
          </SelectGroup>
        </SelectContent>
      </Select>
    </div>
  );
}

export function Revenue({ user, notify, onError }) {
  const [tab, setTab] = useState("quotes");
  const [tabInput, setTabInput] = useState("pointer");
  const [products, setProducts] = useState({ items: [] });
  const [quotes, setQuotes] = useState({ items: [], total: 0 });
  const [orders, setOrders] = useState({ items: [], total: 0 });
  const [loading, setLoading] = useState(true);
  const [productForm, setProductForm] = useState(null);
  const [paymentOrder, setPaymentOrder] = useState(null);
  const [quoteDecision, setQuoteDecision] = useState(null);
  const [actionBusy, setActionBusy] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [page, setPage] = useState(1);
  const loadRequest = useRef(0);
  const load = useCallback(async () => {
    const request = ++loadRequest.current;
    setLoading(true);
    setLoadError("");
    try {
      const result = await api(
        tab === "catalog"
          ? "/api/crm/v1/products"
          : tab === "quotes"
            ? `/api/crm/v1/quotes?${queryString({ page, pageSize: 25 })}`
            : `/api/crm/v1/orders?${queryString({ page, pageSize: 25 })}`,
      );
      if (request !== loadRequest.current) return;
      if (tab === "catalog") setProducts(result);
      else if (tab === "quotes") setQuotes(result);
      else setOrders(result);
    } catch (error) {
      if (request === loadRequest.current) {
        setLoadError(error.message || "No pudimos cargar la información de ingresos.");
        onError(error);
      }
    } finally {
      if (request === loadRequest.current) setLoading(false);
    }
  }, [tab, page, onError]);
  useEffect(() => {
    load();
  }, [load]);
  async function mutate(work, message) {
    if (actionBusy) return;
    setActionBusy(true);
    try {
      await work();
      notify(message);
      setProductForm(null);
      setPaymentOrder(null);
      await load();
    } catch (error) {
      onError(error);
    } finally {
      setActionBusy(false);
    }
  }
  function moveTab(event, current) {
    const next = nextTabValue(REVENUE_TABS, current, event.key);
    if (!next) return;
    event.preventDefault();
    setTabInput("keyboard");
    setPage(1);
    setTab(next);
    requestAnimationFrame(() =>
      document.getElementById(`revenue-tab-${next}`)?.focus(),
    );
  }
  const currentCount =
    tab === "quotes"
      ? quotes.total
      : tab === "orders"
        ? orders.total
        : products.items.length;
  return (
    <>
      <div className="renew-revenue-page">
        <PageHeader
          title="Ingresos"
          description="Cotizaciones, pedidos y cobros conectados al cierre comercial."
        />
        <section className="renew-revenue-command" aria-label="Secciones de ingresos">
          <div className="renew-revenue-command-copy">
            <span className="renew-revenue-command-icon">
              <BadgeDollarSign aria-hidden="true" />
            </span>
            <div>
              <h2>Control comercial</h2>
              <p>{currentCount} {tab === "catalog" ? "productos registrados" : tab === "orders" ? "pedidos en esta vista" : "cotizaciones en esta vista"}</p>
            </div>
          </div>
          <div
            className={`view-toggle revenue-tabs ${tabInput === "keyboard" ? "is-keyboard-navigation" : ""}`}
            role="tablist"
            aria-label="Cambiar sección de ingresos"
          >
            {REVENUE_TABS.map(([value, label, TabIcon]) => (
              <LegacyButton
                id={`revenue-tab-${value}`}
                role="tab"
                aria-selected={tab === value}
                aria-controls={`revenue-panel-${value}`}
                tabIndex={tab === value ? 0 : -1}
                className={tab === value ? "active" : ""}
                onClick={(event) => {
                  setTabInput(event.detail === 0 ? "keyboard" : "pointer");
                  setPage(1);
                  setTab(value);
                }}
                onKeyDown={(event) => moveTab(event, value)}
                key={value}
              >
                <TabIcon aria-hidden="true" />
                {label}
              </LegacyButton>
            ))}
          </div>
        </section>
        {loading ? <div className="surface content-skeleton skeleton renew-revenue-loading" role="status" aria-live="polite"><span className="sr-only">Cargando ingresos</span></div> : null}
        {loadError ? (
          <div className="renew-revenue-error" role="alert">
            <strong>No pudimos cargar esta sección</strong>
            <p>{loadError}</p>
            <LegacyButton className="button secondary" onClick={load}>Reintentar</LegacyButton>
          </div>
        ) : null}
      {!loading && !loadError && tab === "quotes" ? (
        <div
          className={`renew-revenue-panel ${tabInput === "keyboard" ? "is-keyboard-navigation" : ""}`}
          id="revenue-panel-quotes"
          role="tabpanel"
          aria-labelledby="revenue-tab-quotes"
        >
          <QuoteLedger
            data={quotes}
            page={page}
            onPageChange={setPage}
            busy={actionBusy}
            onAccept={setQuoteDecision}
            onStatus={(quote, status) =>
              mutate(
                () =>
                  api(`/api/crm/v1/quotes/${quote.id}/status`, {
                    method: "POST",
                    body: { version: quote.version, status },
                  }),
                status === "ACCEPTED"
                  ? "Cotización aceptada y pedido creado"
                  : "Estado de cotización actualizado",
              )
            }
          />
        </div>
      ) : null}
      {!loading && !loadError && tab === "orders" ? (
        <div
          className={`renew-revenue-panel ${tabInput === "keyboard" ? "is-keyboard-navigation" : ""}`}
          id="revenue-panel-orders"
          role="tabpanel"
          aria-labelledby="revenue-tab-orders"
        >
          <OrderLedger
            data={orders}
            page={page}
            onPageChange={setPage}
            busy={actionBusy}
            canManage={user.role !== "ADVISOR"}
            onUpdate={(order, patch) =>
              mutate(
                () =>
                  api(`/api/crm/v1/orders/${order.id}`, {
                    method: "PATCH",
                    body: { version: order.version, patch },
                  }),
                "Pedido actualizado",
              )
            }
            onPayment={setPaymentOrder}
          />
        </div>
      ) : null}
      {!loading && !loadError && tab === "catalog" ? (
        <div
          className={`renew-revenue-panel ${tabInput === "keyboard" ? "is-keyboard-navigation" : ""}`}
          id="revenue-panel-catalog"
          role="tabpanel"
          aria-labelledby="revenue-tab-catalog"
        >
          <Catalog
            data={products}
            canManage={user.role !== "ADVISOR"}
            busy={actionBusy}
            onCreate={() =>
              setProductForm({
                productKey: "",
                name: "",
                category: "",
                description: "",
              })
            }
            onToggle={(product) =>
              mutate(
                () =>
                  api(`/api/crm/v1/products/${product.id}`, {
                    method: "PATCH",
                    body: {
                      version: product.version,
                      patch: { active: !product.active },
                    },
                  }),
                product.active ? "Producto desactivado" : "Producto activado",
              )
            }
          />
        </div>
      ) : null}
      </div>
      {productForm ? (
        <ProductDrawer
          form={productForm}
          busy={actionBusy}
          onClose={() => setProductForm(null)}
          onCreate={(form) =>
            mutate(
              () => api("/api/crm/v1/products", { method: "POST", body: form }),
              "Producto creado",
            )
          }
        />
      ) : null}
      {paymentOrder ? (
        <PaymentDrawer
          order={paymentOrder}
          busy={actionBusy}
          onClose={() => setPaymentOrder(null)}
          onSave={(form) =>
            mutate(
              () =>
                api(`/api/crm/v1/orders/${paymentOrder.id}/payments`, {
                  method: "POST",
                  body: form,
                }),
              "Pago registrado",
            )
          }
        />
      ) : null}
      {quoteDecision ? (
        <ConfirmDialog
          title="Aceptar cotización"
          description={`${quoteDecision.quote_number} se marcará como aceptada y creará un pedido por ${money.format(quoteDecision.total)}.`}
          confirmLabel="Aceptar y crear pedido"
          busy={actionBusy}
          onClose={() => setQuoteDecision(null)}
          onConfirm={() => {
            const quote = quoteDecision;
            setQuoteDecision(null);
            mutate(
              () =>
                api(`/api/crm/v1/quotes/${quote.id}/status`, {
                  method: "POST",
                  body: { version: quote.version, status: "ACCEPTED" },
                }),
              "Cotización aceptada y pedido creado",
            );
          }}
        />
      ) : null}
    </>
  );
}

function QuoteLedger({ data, page, onPageChange, busy, onStatus, onAccept }) {
  const accepted = data.items.filter((quote) => quote.status === "ACCEPTED");
  const acceptedTotal = accepted.reduce((sum, quote) => sum + Number(quote.total || 0), 0);
  return (
    <section className="surface revenue-ledger quote-ledger">
      <header>
        <div className="renew-revenue-heading">
          <span><ReceiptText aria-hidden="true" /></span>
          <div>
            <h2>Cotizaciones comerciales</h2>
            <p>Documentos emitidos desde las oportunidades.</p>
          </div>
        </div>
        <div className="renew-revenue-summary" aria-label="Resumen de cotizaciones">
          <span><small>Aceptadas en página</small><strong>{accepted.length}</strong></span>
          <span><small>Valor en página</small><strong>{money.format(acceptedTotal)}</strong></span>
        </div>
      </header>
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th scope="col">Cotización</th>
              <th scope="col">Cliente</th>
              <th scope="col">Estado</th>
              <th scope="col">Total</th>
              <th scope="col">Emisión</th>
              <th scope="col">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {data.items.map((quote) => (
              <tr key={quote.id}>
                <td>
                  <strong>{quote.quote_number}</strong>
                  <small>Revisión {quote.revision}</small>
                </td>
                <td>
                  {quote.contact_name}
                  <small>{quote.opportunity_title}</small>
                </td>
                <td>
                  <span
                    className={`status-chip status-${quote.status.toLowerCase()}`}
                  >
                    {quoteStatus[quote.status]}
                  </span>
                </td>
                <td>
                  <strong>{money.format(quote.total)}</strong>
                  {Number(quote.discount_total) > 0 ? (
                    <small>
                      {money.format(quote.discount_total)} de descuento
                    </small>
                  ) : null}
                </td>
                <td>
                  {new Date(quote.created_at).toLocaleDateString("es-PE")}
                </td>
                <td>
                  <div className="row-actions">
                    <a
                      className="icon-button quiet"
                      href={`/api/crm/v1/quotes/${quote.id}/pdf`}
                      target="_blank"
                      rel="noreferrer"
                      aria-label={`Abrir PDF ${quote.quote_number}`}
                    >
                      <Icon name="quote" />
                    </a>
                    {quote.status === "DRAFT" ? (
                      <LegacyButton
                        className="text-button"
                        disabled={busy}
                        onClick={() => onStatus(quote, "SENT")}
                      >
                        Marcar enviada
                      </LegacyButton>
                    ) : null}
                    {quote.status === "SENT" ? (
                      <LegacyButton
                        className="text-button"
                        disabled={busy}
                        onClick={() => onAccept(quote)}
                      >
                        Aceptar
                      </LegacyButton>
                    ) : null}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!data.items.length ? (
        <Empty
          icon={FileText}
          title="Aún no hay cotizaciones"
          text="Las cotizaciones creadas desde una oportunidad aparecerán aquí, listas para seguimiento y aprobación."
        />
      ) : null}
      <RevenuePagination data={data} page={page} onPageChange={onPageChange} />
    </section>
  );
}

function OrderLedger({ data, page, onPageChange, busy, canManage, onUpdate, onPayment }) {
  const paidOrders = data.items.filter((order) => order.payment_status === "PAID");
  const collected = data.items.reduce((sum, order) => sum + Number(order.paid || 0), 0);
  return (
    <section className="surface revenue-ledger order-ledger">
      <header>
        <div className="renew-revenue-heading">
          <span><PackageCheck aria-hidden="true" /></span>
          <div>
            <h2>Pedidos confirmados</h2>
            <p>Pedidos originados en cotizaciones aceptadas.</p>
          </div>
        </div>
        <div className="renew-revenue-summary" aria-label="Resumen de pedidos">
          <span><small>Pagados en página</small><strong>{paidOrders.length}</strong></span>
          <span><small>Cobrado en página</small><strong>{money.format(collected)}</strong></span>
        </div>
      </header>
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th scope="col">Pedido</th>
              <th scope="col">Cliente</th>
              <th scope="col">Preparación</th>
              <th scope="col">Pago</th>
              <th scope="col">Total</th>
              <th scope="col">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {data.items.map((order) => (
              <tr key={order.id}>
                <td>
                  <strong>{order.order_number}</strong>
                  <small>
                    {new Date(order.created_at).toLocaleDateString("es-PE")}
                  </small>
                </td>
                <td>
                  {order.contact_name}
                  <small>{order.owner_name || "Sin asesor"}</small>
                </td>
                <td>
                  {canManage ? (
                    <RevenueSelect
                      label={`Preparación de ${order.order_number}`}
                      value={order.status}
                      onValueChange={(value) => onUpdate(order, { status: value })}
                      options={Object.entries(orderStatus)}
                      disabled={busy}
                    />
                  ) : (
                    orderStatus[order.status]
                  )}
                </td>
                <td>
                  <span
                    className={`status-chip payment-${order.payment_status.toLowerCase()}`}
                  >
                    {paymentStatus[order.payment_status]}
                  </span>
                  <small>{money.format(order.paid)} abonado</small>
                </td>
                <td>
                  <strong>{money.format(order.total)}</strong>
                </td>
                <td>
                  {canManage && order.payment_status !== "PAID" ? (
                    <LegacyButton
                      className="button secondary compact"
                      disabled={busy}
                      onClick={() => onPayment(order)}
                    >
                      Registrar pago
                    </LegacyButton>
                  ) : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!data.items.length ? (
        <Empty
          icon={ShoppingBag}
          title="Todavía no hay pedidos"
          text="Al aceptar una cotización se generará aquí el pedido automáticamente."
        />
      ) : null}
      <RevenuePagination data={data} page={page} onPageChange={onPageChange} />
    </section>
  );
}

function Catalog({ data, canManage, busy, onCreate, onToggle }) {
  return (
    <section className="surface catalog-panel">
      <header>
        <div className="renew-revenue-heading">
          <span><Boxes aria-hidden="true" /></span>
          <div>
            <h2>Catálogo comercial</h2>
            <p>{data.items.filter((item) => item.active).length} productos activos vinculados a reglas comerciales.</p>
          </div>
        </div>
        {canManage ? (
          <LegacyButton className="button primary" onClick={onCreate} disabled={busy}>
            <Plus aria-hidden="true" /> Nuevo producto
          </LegacyButton>
        ) : null}
      </header>
      <div className="catalog-groups">
        {Object.entries(groupProducts(data.items)).map(([category, items]) => (
          <section key={category}>
            <h3>{category}</h3>
            {items.map((product) => (
              <article
                className={`catalog-row${product.active ? "" : " disabled"}`}
                key={product.id}
              >
                <span>
                  <strong>{product.name}</strong>
                  <small>{product.product_key}</small>
                </span>
                <span
                  className={`status-chip ${product.active ? "status-accepted" : "status-expired"}`}
                >
                  {product.active ? "Activo" : "Inactivo"}
                </span>
                {canManage ? (
                  <LegacyButton
                    className="text-button"
                    disabled={busy}
                    onClick={() => onToggle(product)}
                  >
                    {product.active ? "Desactivar" : "Activar"}
                  </LegacyButton>
                ) : null}
              </article>
            ))}
          </section>
        ))}
      </div>
      {!data.items.length ? (
        <Empty
          icon={Boxes}
          title="Catálogo por configurar"
          text="Cree el primer producto cuando su clave ya exista en las reglas comerciales."
        />
      ) : null}
    </section>
  );
}

function ProductDrawer({ form, busy, onClose, onCreate }) {
  const [draft, setDraft] = useState(form);
  const field = (key) => ({
    value: draft[key],
    onChange: (event) =>
      setDraft((current) => ({ ...current, [key]: event.target.value })),
  });
  return (
    <Drawer label="nuevo producto" onClose={onClose} className="revenue-drawer">
      <header>
        <div>
          <h2>Nuevo producto</h2>
          <p>
            La clave debe existir en las reglas comerciales para poder cotizar.
          </p>
        </div>
        <LegacyButton
          className="icon-button quiet"
          onClick={onClose}
          aria-label="Cerrar producto"
        >
          <Icon name="close" />
        </LegacyButton>
      </header>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          onCreate(draft);
        }}
      >
        <label>
          <span>
            Clave comercial <small className="required-mark">Obligatorio</small>
          </span>
          <LegacyInput
            id="product-key"
            required
            pattern="[a-z0-9_]+"
            title="Use solo letras minúsculas, números y guion bajo."
            aria-describedby="product-key-hint"
            {...field("productKey")}
          />
          <small className="field-hint" id="product-key-hint">
            Solo minúsculas, números y guion bajo; por ejemplo, bidon_20l.
          </small>
        </label>
        <label>
          <span>
            Nombre <small className="required-mark">Obligatorio</small>
          </span>
          <LegacyInput required {...field("name")} />
        </label>
        <label>
          <span>
            Categoría <small className="required-mark">Obligatorio</small>
          </span>
          <LegacyInput required {...field("category")} />
        </label>
        <label>
          Descripción
          <LegacyTextarea rows="4" {...field("description")} />
        </label>
        <LegacyButton className="button primary" disabled={busy}>{busy ? "Creando…" : "Crear producto"}</LegacyButton>
      </form>
    </Drawer>
  );
}
function PaymentDrawer({ order, busy, onClose, onSave }) {
  const [form, setForm] = useState({
    amount: Math.max(0, Number(order.total) - Number(order.paid)).toFixed(2),
    method: "TRANSFER",
    reference: "",
    paidAt: "",
  });
  const field = (key) => ({
    value: form[key],
    onChange: (event) =>
      setForm((current) => ({ ...current, [key]: event.target.value })),
  });
  return (
    <Drawer label="registrar pago" onClose={onClose} className="revenue-drawer">
      <header>
        <div>
          <h2>Registrar pago</h2>
          <p>
            {order.order_number} · saldo{" "}
            {money.format(Number(order.total) - Number(order.paid))}
          </p>
        </div>
        <LegacyButton
          className="icon-button quiet"
          onClick={onClose}
          aria-label="Cerrar pago"
        >
          <Icon name="close" />
        </LegacyButton>
      </header>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          onSave({
            ...form,
            amount: Number(form.amount),
            paidAt: form.paidAt ? new Date(`${form.paidAt}:00-05:00`).toISOString() : null,
          });
        }}
      >
        <label>
          <span>
            Importe <small className="required-mark">Obligatorio</small>
          </span>
          <LegacyInput
            type="number"
            min="0.01"
            step="0.01"
            required
            {...field("amount")}
          />
        </label>
        <RevenueSelect
          label="Método"
          value={form.method}
          onValueChange={(value) => setForm((current) => ({ ...current, method: value }))}
          options={[["TRANSFER", "Transferencia"], ["CASH", "Efectivo"], ["CARD", "Tarjeta"], ["YAPE", "Yape"], ["PLIN", "Plin"], ["OTHER", "Otro"]]}
        />
        <label>
          Referencia
          <LegacyInput {...field("reference")} />
        </label>
        <DateTimePicker label="Fecha" value={form.paidAt} onChange={(value) => setForm((current) => ({ ...current, paidAt: value }))} />
        <LegacyButton className="button primary" disabled={busy}>{busy ? "Registrando…" : "Confirmar pago"}</LegacyButton>
      </form>
    </Drawer>
  );
}

function RevenuePagination({ data, page, onPageChange }) {
  const pageSize = Number(data.pageSize || 25);
  const totalPages = Math.max(1, Math.ceil(Number(data.total || 0) / pageSize));
  if (totalPages <= 1) return null;
  return (
    <nav className="renew-revenue-pagination" aria-label="Paginación de ingresos">
      <span>{data.total} registros</span>
      <div>
        <LegacyButton className="button secondary" disabled={page <= 1} onClick={() => onPageChange(page - 1)}>Anterior</LegacyButton>
        <span>Página {page} de {totalPages}</span>
        <LegacyButton className="button secondary" disabled={page >= totalPages} onClick={() => onPageChange(page + 1)}>Siguiente</LegacyButton>
      </div>
    </nav>
  );
}
function Empty({ icon: EmptyIcon = Sparkles, title = "Sin registros todavía", text }) {
  return (
    <div className="empty-state renew-revenue-empty">
      <span><EmptyIcon aria-hidden="true" /></span>
      <strong>{title}</strong>
      <p>{text}</p>
      <small><CheckCircle2 aria-hidden="true" /> Los nuevos registros aparecerán automáticamente.</small>
    </div>
  );
}
