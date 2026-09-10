import { useEffect, useState, type FormEvent } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import Decimal from "decimal.js";
import {
  Plus,
  Save,
  Search,
  Trash2,
  Truck,
  Printer,
  RotateCcw,
  Check,
  ArrowLeft,
  Gift,
} from "lucide-react";
import type { Delivery, Order, OrderLine } from "../../shared/types";
import { useWorkspace } from "../api";
import {
  Badge,
  Button,
  Card,
  DateRange,
  day,
  Empty,
  Field,
  Heading,
  matches,
  Modal,
  money,
  Notice,
  number,
  Pager,
  SearchBox,
  Status,
  today,
} from "../ui";

export function Orders() {
  const { state } = useWorkspace();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const query = params.get("q") || "";
  const status = params.get("status") || "";
  const from = params.get("from") || "";
  const to = params.get("to") || "";
  const [page, setPage] = useState(1);
  function filter(k: string, v: string) {
    setParams((p) => {
      v ? p.set(k, v) : p.delete(k);
      return p;
    });
    setPage(1);
  }
  const rows = state.orders
    .filter(
      (o) =>
        !o.deletedAt &&
        !o.purgedAt &&
        matches(
          query,
          o.code,
          state.customers.find((c) => c.id === o.customerId)?.name,
        ) &&
        (!status || o.status === status) &&
        (!from || o.date >= from) &&
        (!to || o.date <= to),
    )
    .slice()
    .reverse();
  return (
    <>
      <Heading
        eyebrow="TOA & GIAO HÀNG"
        title="Đơn hàng"
        description="Từ đơn khách đặt đến từng lần thực giao, luôn có chứng từ đối chiếu."
        actions={
          <Button variant="primary" onClick={() => navigate("/orders/new")}>
            <Plus size={17} />
            Tạo đơn hàng
          </Button>
        }
      />
      <div className="summary-strip">
        <span>
          <strong>{rows.length}</strong> đơn trong bộ lọc
        </span>
        <span>
          Tổng tiền hàng{" "}
          <strong>
            {money(
              rows
                .filter((o) => o.status !== "cancelled" && o.status !== "draft")
                .reduce((s, o) => s.plus(o.total), new Decimal(0))
                .toFixed(0),
            )}
          </strong>
        </span>
        <span>{rows.filter((o) => o.status === "draft").length} bản nháp</span>
      </div>
      <Card>
        <div className="toolbar">
          <SearchBox
            value={query}
            onChange={(v) => filter("q", v)}
            placeholder="Tìm mã toa, tên khách hàng…"
          />
          <select
            value={status}
            onChange={(e) => filter("status", e.target.value)}
            aria-label="Trạng thái đơn"
          >
            <option value="">Tất cả trạng thái</option>
            <option value="draft">Nháp</option>
            <option value="confirmed">Đã chốt</option>
            <option value="partial">Giao một phần</option>
            <option value="delivered">Giao đủ</option>
            <option value="cancelled">Đã hủy</option>
          </select>
          <DateRange
            from={from}
            to={to}
            setFrom={(v) => filter("from", v)}
            setTo={(v) => filter("to", v)}
          />
        </div>
        {rows.length ? (
          <>
            <OrderTable orders={rows.slice((page - 1) * 15, page * 15)} />
            <Pager page={page} count={rows.length} onChange={setPage} />
          </>
        ) : (
          <Empty
            title="Chưa có đơn hàng"
            description="Chọn khách hàng và lập toa đầu tiên của bạn."
            action={
              <Button variant="primary" onClick={() => navigate("/orders/new")}>
                <Plus size={16} />
                Tạo đơn đầu tiên
              </Button>
            }
          />
        )}
      </Card>
    </>
  );
}
export function OrderTable({ orders }: { orders: Order[] }) {
  const { state } = useWorkspace();
  const navigate = useNavigate();
  return (
    <div className="table-scroll">
      <table>
        <thead>
          <tr>
            <th>Mã đơn / ngày</th>
            <th>Khách hàng</th>
            <th>Trạng thái</th>
            <th className="numeric">Thành tiền</th>
            <th className="numeric">Quỹ dự kiến</th>
          </tr>
        </thead>
        <tbody>
          {orders.map((o) => (
            <tr
              key={o.id}
              onClick={() => navigate(`/orders/${o.id}`)}
              className="clickable"
            >
              <td>
                <button className="table-link">{o.code}</button>
                <small>{day(o.date)}</small>
              </td>
              <td>
                <strong>
                  {state.customers.find((c) => c.id === o.customerId)?.name ||
                    "Chưa chọn khách"}
                </strong>
                <small>{o.lines.length} dòng hàng</small>
              </td>
              <td>
                <Status value={o.status} />
              </td>
              <td className="numeric strong">{money(o.total)}</td>
              <td
                className={`numeric ${Number(o.margin) < 0 ? "negative" : "positive"}`}
              >
                {o.margin === null ? (
                  <Badge tone="amber">Cần đối chiếu</Badge>
                ) : (
                  money(o.margin)
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
type DraftLine = {
  id: string;
  productId: string;
  quantity: number;
  price: string;
  kind: "sale" | "gift" | "display";
  sponsor: "employee" | "company";
  discount: string;
  fixedPrice: boolean;
  delivered?: number;
  returned?: number;
};
export function OrderEditor() {
  const { state, command, busy, notify } = useWorkspace();
  const { id } = useParams();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const order = state.orders.find((o) => o.id === id && !o.deletedAt);
  const [tab, setTab] = useState(id ? "invoice" : "customers");
  const [customerId, setCustomerId] = useState(
    order?.customerId || params.get("customer") || "",
  );
  const [date, setDate] = useState(order?.date || today());
  const [notes, setNotes] = useState(order?.notes || "");
  const [lines, setLines] = useState<DraftLine[]>(
    () => order?.lines.map((l) => ({ ...l, fixedPrice: !!l.fixedPrice })) || [],
  );
  const [dirty, setDirty] = useState(false);
  const [editingFinalized, setEditingFinalized] = useState(false);
  const [deliveryEdits, setDeliveryEdits] = useState(() =>
    state.deliveries
      .filter((delivery) => delivery.orderId === order?.id)
      .map((delivery) => ({
        id: delivery.id,
        lines: delivery.lines.map((line) => ({
          lineId: line.lineId,
          quantity: line.quantity,
        })),
      })),
  );
  const locked = !!order && order.status !== "draft" && !editingFinalized;
  const [casePrice, setCasePrice] = useState(false);
  const [q, setQ] = useState("");
  const [productQ, setProductQ] = useState("");
  const [routeOnly, setRouteOnly] = useState(false);
  const [error, setError] = useState("");
  const [action, setAction] = useState<
    "delivery" | "payment" | "return" | null
  >(null);
  const [promotionPreview, setPromotionPreview] = useState<DraftLine[] | null>(
    null,
  );
  useEffect(() => {
    if (order) {
      setCustomerId(order.customerId);
      setDate(order.date);
      setNotes(order.notes);
      setLines(order.lines.map((l) => ({ ...l, fixedPrice: !!l.fixedPrice })));
      setDeliveryEdits(
        state.deliveries
          .filter((delivery) => delivery.orderId === order.id)
          .map((delivery) => ({
            id: delivery.id,
            lines: delivery.lines.map((line) => ({
              lineId: line.lineId,
              quantity: line.quantity,
            })),
          })),
      );
      setEditingFinalized(false);
      setDirty(false);
    }
  }, [order?.id, order?.version]);
  useEffect(() => {
    const fn = (e: BeforeUnloadEvent) => {
      if (dirty) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", fn);
    return () => window.removeEventListener("beforeunload", fn);
  }, [dirty]);
  function changeLine(index: number, patch: Partial<DraftLine>) {
    setLines((ls) => ls.map((l, i) => (i === index ? { ...l, ...patch } : l)));
    setDirty(true);
  }
  function selectCustomer(value: string) {
    if (
      dirty &&
      value !== customerId &&
      !confirm(
        "Đổi khách hàng cho bản nháp đang nhập? Các dòng hàng được giữ lại.",
      )
    )
      return;
    setCustomerId(value);
    setDirty(true);
    setTab("invoice");
  }
  function add(productId: string) {
    const p = state.products.find((p) => p.id === productId)!;
    setLines([
      ...lines,
      {
        id: crypto.randomUUID(),
        productId,
        quantity: 1,
        price: p.price || "0",
        kind: "sale",
        sponsor: "employee",
        discount: "0",
        fixedPrice: false,
        delivered: 0,
        returned: 0,
      },
    ]);
    setDirty(true);
    setProductQ("");
  }
  const total = lines.reduce(
    (s, l) =>
      l.kind === "sale"
        ? s.plus(
            new Decimal(l.price || 0).times(l.quantity).minus(l.discount || 0),
          )
        : s,
    new Decimal(0),
  );
  const unresolved = lines.some((l) => {
    const p = state.products.find((p) => p.id === l.productId);
    return !p || (l.sponsor === "employee" && p.cost === null);
  });
  const margin = lines.reduce((s, l) => {
    const p = state.products.find((p) => p.id === l.productId);
    const cost = new Decimal(p?.cost || 0).times(l.quantity);
    return l.kind === "sale"
      ? s.plus(
          new Decimal(l.price || 0)
            .times(l.quantity)
            .minus(l.discount || 0)
            .minus(cost),
        )
      : l.sponsor === "employee"
        ? s.minus(cost)
        : s;
  }, new Decimal(0));
  async function save(confirmAfter = false) {
    setError("");
    try {
      let next;
      if (order && order.status !== "draft") {
        const reason = prompt("Lý do sửa toa đã chốt:");
        if (!reason?.trim()) return;
        next = await command("reviseOrder", {
          order: {
            id: order.id,
            customerId,
            date,
            notes,
            lines,
            deliveries: deliveryEdits,
          },
          reason,
        });
      } else {
        next = await command("saveOrder", {
          order: { id: order?.id, customerId, date, notes, lines },
        });
      }
      const saved = order
        ? next.orders.find((o) => o.id === order.id)
        : next.orders.at(-1);
      setDirty(false);
      setEditingFinalized(false);
      if (saved && confirmAfter)
        await command("confirmOrder", { id: saved.id });
      if (saved) navigate(`/orders/${saved.id}`, { replace: true });
      notify(
        order && order.status !== "draft"
          ? "Đã sửa toa và tính lại KPI, quỹ, kho."
          : confirmAfter
            ? "Đã chốt đơn. Quỹ sẽ ghi nhận khi thực giao."
            : "Đã lưu bản nháp.",
      );
    } catch (e) {
      setError((e as Error).message);
    }
  }
  async function confirmExisting() {
    try {
      await command("confirmOrder", { id: order!.id });
      notify("Đã chốt đơn.");
    } catch (e) {
      setError((e as Error).message);
    }
  }
  async function cancel() {
    const reason = prompt("Lý do hủy phần chưa giao của đơn:");
    if (!reason) return;
    try {
      await command("cancelOrder", { id: order!.id, reason });
      notify("Đã hủy phần chưa giao; lịch sử thực giao được giữ.");
    } catch (e) {
      setError((e as Error).message);
    }
  }
  async function removeOrder() {
    const reason = prompt(
      order?.status === "draft"
        ? "Lý do xoá bản nháp:"
        : "Lý do xoá toa (KPI, quỹ và kho sẽ được tính lại):",
    );
    if (!reason?.trim()) return;
    try {
      await command("deleteOrder", { id: order!.id, reason });
      notify(
        order!.status === "draft"
          ? "Đã chuyển bản nháp vào thùng tạm giữ."
          : "Đã đảo KPI/quỹ, hoàn kho và chuyển toa vào thùng tạm giữ.",
      );
      navigate("/orders");
    } catch (e) {
      setError((e as Error).message);
    }
  }
  return (
    <>
      <Heading
        eyebrow="NHẬP ĐƠN HÀNG"
        title={order ? order.code : "Tạo đơn hàng"}
        description={
          order
            ? `Ngày ${day(order.date)} · ${state.customers.find((c) => c.id === customerId)?.name || ""}`
            : "Chọn khách hàng, nhập toa và kiểm tra chi tiết trước khi chốt."
        }
        actions={
          <>
            <Button
              onClick={() => {
                if (!dirty || confirm("Rời khỏi bản nháp chưa lưu?"))
                  navigate("/orders");
              }}
            >
              <ArrowLeft size={16} />
              Danh sách
            </Button>
            {order && <Status value={order.status} />}
          </>
        }
      />
      {error && <Notice type="error">{error}</Notice>}
      <div className="order-toolbar">
        <Button
          onClick={() => {
            if (!dirty || confirm("Tạo mới và bỏ thay đổi chưa lưu?")) {
              navigate("/orders/new");
              setCustomerId("");
              setLines([]);
              setNotes("");
              setDirty(false);
              setTab("customers");
            }
          }}
        >
          <Plus size={16} />
          Tạo mới
        </Button>
        {!locked && (
          <Button busy={busy} variant="primary" onClick={() => void save()}>
            <Save size={16} />
            {order?.status === "draft" ? "Lưu nháp" : "Lưu chỉnh sửa"}
          </Button>
        )}
        {order && order.status !== "draft" && !editingFinalized && (
          <Button onClick={() => setEditingFinalized(true)}>
            <Save size={16} />
            Sửa toa
          </Button>
        )}
        <Button onClick={() => navigate("/orders")}>
          <Search size={16} />
          Tìm toa
        </Button>
        {!locked && (
          <Button
            disabled={!lines.length}
            onClick={() => setPromotionPreview(lines.map((l) => ({ ...l })))}
          >
            <Gift size={16} />
            Tính lại khuyến mãi
          </Button>
        )}
        {order && (
          <Button
            onClick={() =>
              printOrder(
                order,
                state.customers.find((c) => c.id === customerId)?.name ||
                  "Khách hàng",
              )
            }
          >
            <Printer size={16} />
            In toa
          </Button>
        )}
        {order && (
          <Button variant="danger" onClick={() => void removeOrder()}>
            <Trash2 size={16} />
            Xoá toa
          </Button>
        )}
        {order && ["confirmed", "partial"].includes(order.status) && (
          <Button onClick={() => void cancel()}>Huỷ phần chưa giao</Button>
        )}
      </div>
      <div className="tabs" role="tablist" aria-label="Các phần nhập đơn">
        {[
          ["customers", "01", "DS khách hàng"],
          ["invoice", "02", "Hóa đơn"],
          ["detail", "03", "Chi tiết"],
        ].map(([key, num, label]) => (
          <button
            key={key}
            role="tab"
            aria-selected={tab === key}
            className={tab === key ? "active" : ""}
            onClick={() => setTab(key)}
          >
            <span>{num}</span>
            {label}
          </button>
        ))}
      </div>
      {tab === "customers" && (
        <Card>
          <div className="toolbar">
            <SearchBox
              value={q}
              onChange={setQ}
              placeholder="Tìm khách hàng ở đây…"
            />
            <div className="segmented">
              <button
                className={routeOnly ? "active" : ""}
                onClick={() => setRouteOnly(true)}
              >
                Trong tuyến
              </button>
              <button
                className={!routeOnly ? "active" : ""}
                onClick={() => setRouteOnly(false)}
              >
                Tất cả
              </button>
            </div>
            <Button onClick={() => navigate("/customers")}>
              <Plus size={16} />
              Tạo / sửa khách
            </Button>
          </div>
          <div className="customer-picker">
            {state.customers
              .filter(
                (c) =>
                  !c.archived &&
                  matches(q, c.name, c.phone, c.address) &&
                  (!routeOnly || c.visitDays.includes(new Date().getDay())),
              )
              .map((c) => (
                <button
                  className={`customer-option ${customerId === c.id ? "selected" : ""}`}
                  key={c.id}
                  disabled={locked}
                  onClick={() => selectCustomer(c.id)}
                >
                  <div className="avatar">{c.name.slice(0, 1)}</div>
                  <div>
                    <strong>{c.name}</strong>
                    <span>{c.address || c.district || "Chưa có địa chỉ"}</span>
                    <small>
                      {c.phone || "Chưa có điện thoại"} ·{" "}
                      {c.route || "Chưa có tuyến"}
                    </small>
                  </div>
                  {customerId === c.id && <Check size={20} />}
                </button>
              ))}
          </div>
          {!state.customers.length && (
            <Empty
              title="Chưa có khách hàng"
              action={
                <Button onClick={() => navigate("/customers")}>
                  Tạo khách hàng
                </Button>
              }
            />
          )}
        </Card>
      )}
      {tab === "invoice" && (
        <>
          <Card title="Thông tin toa">
            <div className="form-grid three">
              <Field label="Khách hàng">
                <select
                  disabled={locked}
                  value={customerId}
                  onChange={(e) => selectCustomer(e.target.value)}
                >
                  <option value="">Chọn khách hàng</option>
                  {state.customers
                    .filter((c) => !c.archived)
                    .map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                </select>
              </Field>
              <Field label="Ngày đặt hàng">
                <input
                  disabled={locked}
                  type="date"
                  value={date}
                  onChange={(e) => {
                    setDate(e.target.value);
                    setDirty(true);
                  }}
                />
              </Field>
              <Field label="Cách nhập giá">
                <label className="checkbox-field">
                  <input
                    type="checkbox"
                    checked={casePrice}
                    onChange={(e) => setCasePrice(e.target.checked)}
                  />
                  Giá theo thùng
                </label>
              </Field>
            </div>
            <Field label="Ghi chú toa">
              <textarea
                disabled={locked}
                rows={2}
                value={notes}
                onChange={(e) => {
                  setNotes(e.target.value);
                  setDirty(true);
                }}
                placeholder="Ghi chú giao hàng, yêu cầu của khách…"
              />
            </Field>
          </Card>
          <Card
            title="Hàng bán & khuyến mãi"
            subtitle="Quà tặng, trưng bày được tách khỏi doanh số bán."
          >
            {!locked && (
              <div className="product-search">
                <SearchBox
                  value={productQ}
                  onChange={setProductQ}
                  placeholder="Tìm sản phẩm để thêm vào toa…"
                />
                {productQ && (
                  <div className="product-results">
                    {state.products
                      .filter(
                        (p) =>
                          !p.archived &&
                          matches(productQ, p.name, p.code, p.variant),
                      )
                      .slice(0, 12)
                      .map((p) => (
                        <button key={p.id} onClick={() => add(p.id)}>
                          <span>
                            <strong>{p.name}</strong>
                            <small>
                              {p.pack} {p.unit}/thùng · {p.variant}
                            </small>
                          </span>
                          <span>
                            {p.price === null ? "Chưa có giá" : money(p.price)}
                            <Plus size={16} />
                          </span>
                        </button>
                      ))}
                  </div>
                )}
              </div>
            )}
            {lines.length ? (
              <div className="table-scroll">
                <table className="line-table">
                  <thead>
                    <tr>
                      <th>Sản phẩm / loại dòng</th>
                      <th>Thùng</th>
                      <th>Lẻ</th>
                      <th className="numeric">
                        {casePrice ? "Giá / thùng" : "Giá / đơn vị"}
                      </th>
                      <th>Giảm tiền</th>
                      <th className="numeric">Thành tiền</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {lines.map((l, i) => {
                      const p = state.products.find(
                        (p) => p.id === l.productId,
                      );
                      if (!p) return null;
                      const lineTotal = new Decimal(l.price || 0)
                        .times(l.quantity)
                        .minus(l.discount || 0);
                      return (
                        <tr key={l.id}>
                          <td>
                            <strong>{p.name}</strong>
                            <small>
                              {number(l.quantity)} {p.unit} · {p.pack} {p.unit}
                              /thùng
                            </small>
                            <div className="line-options">
                              <select
                                aria-label={`Loại dòng ${i + 1}`}
                                value={l.kind}
                                disabled={locked}
                                onChange={(e) =>
                                  changeLine(i, {
                                    kind: e.target.value as DraftLine["kind"],
                                  })
                                }
                              >
                                <option value="sale">Hàng bán</option>
                                <option value="gift">Quà tặng</option>
                                <option value="display">Trưng bày</option>
                              </select>
                              {l.kind !== "sale" && (
                                <select
                                  aria-label={`Nguồn chi phí dòng ${i + 1}`}
                                  value={l.sponsor}
                                  disabled={locked}
                                  onChange={(e) =>
                                    changeLine(i, {
                                      sponsor: e.target
                                        .value as DraftLine["sponsor"],
                                    })
                                  }
                                >
                                  <option value="employee">
                                    Nhân viên chịu
                                  </option>
                                  <option value="company">Công ty chịu</option>
                                </select>
                              )}
                            </div>
                          </td>
                          <td>
                            <input
                              aria-label={`Số thùng dòng ${i + 1}`}
                              type="number"
                              min="0"
                              step="1"
                              disabled={locked}
                              value={Math.floor(l.quantity / p.pack)}
                              onChange={(e) =>
                                changeLine(i, {
                                  quantity:
                                    Number(e.target.value) * p.pack +
                                    (l.quantity % p.pack),
                                })
                              }
                            />
                          </td>
                          <td>
                            <input
                              aria-label={`Số lẻ dòng ${i + 1}`}
                              type="number"
                              min="0"
                              step="1"
                              disabled={locked}
                              value={l.quantity % p.pack}
                              onChange={(e) =>
                                changeLine(i, {
                                  quantity:
                                    Math.floor(l.quantity / p.pack) * p.pack +
                                    Number(e.target.value),
                                })
                              }
                            />
                          </td>
                          <td>
                            <input
                              aria-label={`Giá dòng ${i + 1}`}
                              type="number"
                              min="0"
                              step="any"
                              disabled={locked || l.kind !== "sale"}
                              value={
                                casePrice
                                  ? new Decimal(l.price || 0)
                                      .times(p.pack)
                                      .toString()
                                  : l.price
                              }
                              onChange={(e) =>
                                changeLine(i, {
                                  price: casePrice
                                    ? new Decimal(e.target.value || 0)
                                        .div(p.pack)
                                        .toString()
                                    : e.target.value,
                                })
                              }
                            />
                            <label className="small-check">
                              <input
                                type="checkbox"
                                disabled={locked}
                                checked={l.fixedPrice}
                                onChange={(e) =>
                                  changeLine(i, {
                                    fixedPrice: e.target.checked,
                                  })
                                }
                              />
                              Cố định giá
                            </label>
                          </td>
                          <td>
                            <input
                              aria-label={`Giảm tiền dòng ${i + 1}`}
                              type="number"
                              min="0"
                              disabled={locked || l.kind !== "sale"}
                              value={l.discount}
                              onChange={(e) =>
                                changeLine(i, { discount: e.target.value })
                              }
                            />
                          </td>
                          <td className="numeric strong">
                            {l.kind === "sale" ? (
                              money(lineTotal.toString())
                            ) : (
                              <Badge tone="green">Không thu tiền</Badge>
                            )}
                          </td>
                          <td>
                            {!locked && (
                              <button
                                aria-label={`Xóa dòng ${i + 1}`}
                                className="icon-button danger-text"
                                onClick={() => {
                                  setLines(lines.filter((_, j) => i !== j));
                                  setDirty(true);
                                }}
                              >
                                <Trash2 size={16} />
                              </button>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : (
              <Empty
                title="Thêm mặt hàng đầu tiên"
                description="Tìm tên hoặc mã sản phẩm ở phía trên. Bạn có thể nhập theo thùng và đơn vị lẻ."
              />
            )}
          </Card>
        </>
      )}
      {tab === "detail" && (
        <>
          <Card
            title="Đối chiếu quỹ dự kiến"
            subtitle="Chưa cộng vào quỹ khả dụng cho đến khi thực giao."
          >
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>Sản phẩm</th>
                    <th className="numeric">Số lượng</th>
                    <th className="numeric">Giá bán</th>
                    <th className="numeric">Giá gốc</th>
                    <th className="numeric">Quỹ dòng</th>
                  </tr>
                </thead>
                <tbody>
                  {lines.map((l) => {
                    const p = state.products.find((p) => p.id === l.productId);
                    const original = order?.lines.find((x) => x.id === l.id);
                    const cost = locked ? original?.cost : p?.cost;
                    const margin =
                      cost == null
                        ? null
                        : l.kind === "sale"
                          ? new Decimal(l.price)
                              .minus(cost)
                              .times(l.quantity)
                              .minus(l.discount)
                          : new Decimal(l.sponsor === "employee" ? cost : 0)
                              .times(l.quantity)
                              .neg();
                    return (
                      <tr key={l.id}>
                        <td>
                          {p?.name || original?.name}
                          <small>
                            {l.kind === "gift"
                              ? "Quà tặng"
                              : l.kind === "display"
                                ? "Trưng bày"
                                : "Hàng bán"}
                          </small>
                        </td>
                        <td className="numeric">
                          {number(l.quantity)} {p?.unit}
                        </td>
                        <td className="numeric">
                          {l.kind === "sale" ? money(l.price) : "—"}
                        </td>
                        <td className="numeric">
                          {cost == null ? (
                            <Badge tone="amber">Thiếu giá</Badge>
                          ) : (
                            money(cost)
                          )}
                        </td>
                        <td
                          className={`numeric ${margin?.isNegative() ? "negative" : "positive"}`}
                        >
                          {margin === null
                            ? "Chờ đối chiếu"
                            : money(margin.toString())}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Card>
          {order && (
            <Card title="Giao hàng, thu tiền & đổi trả">
              <div className="toolbar">
                {["confirmed", "partial"].includes(order.status) && (
                  <Button
                    variant="primary"
                    onClick={() => setAction("delivery")}
                  >
                    <Truck size={16} />
                    Ghi nhận thực giao
                  </Button>
                )}
                <Button onClick={() => setAction("payment")}>
                  Ghi nhận thu tiền
                </Button>
                {state.deliveries.some((d) => d.orderId === order.id) && (
                  <Button onClick={() => setAction("return")}>
                    <RotateCcw size={16} />
                    Nhận hàng trả
                  </Button>
                )}
              </div>
              {state.deliveries
                .filter((d) => d.orderId === order.id)
                .map((d) => (
                  <div className="delivery-row" key={d.id}>
                    <div>
                      <strong>{d.code}</strong>
                      <small>
                        {day(d.date)} ·{" "}
                        {d.lines.reduce((s, l) => s + l.quantity, 0)} đơn vị
                      </small>
                    </div>
                    <span>{money(d.total)}</span>
                    <span className="positive">
                      Quỹ{" "}
                      {d.margin === null ? "cần đối chiếu" : money(d.margin)}
                    </span>
                  </div>
                ))}
              {!state.deliveries.some((d) => d.orderId === order.id) && (
                <Empty
                  title="Đơn chưa có lần giao"
                  description="Chỉ ghi nhận hàng đã giao thực tế cho khách."
                />
              )}
              {editingFinalized && deliveryEdits.length > 0 && (
                <div className="form-stack">
                  <Notice type="warning">
                    Nhập lại đúng số thực giao của từng phiếu. Hệ thống sẽ từ
                    chối nếu thấp hơn lượng đã trả hoặc cao hơn lượng đặt mới.
                  </Notice>
                  {deliveryEdits.map((delivery, deliveryIndex) => (
                    <Card
                      key={delivery.id}
                      title={
                        state.deliveries.find((item) => item.id === delivery.id)
                          ?.code ?? "Phiếu giao"
                      }
                    >
                      <div className="form-grid">
                        {delivery.lines.map((part, partIndex) => (
                          <Field
                            key={part.lineId}
                            label={
                              lines.find((line) => line.id === part.lineId)
                                ?.productId
                                ? (state.products.find(
                                    (product) =>
                                      product.id ===
                                      lines.find(
                                        (line) => line.id === part.lineId,
                                      )?.productId,
                                  )?.name ?? "Dòng đã giao")
                                : "Dòng đã giao"
                            }
                          >
                            <input
                              type="number"
                              min="0"
                              step="1"
                              value={part.quantity}
                              onChange={(event) => {
                                const quantity = Number(event.target.value);
                                setDeliveryEdits((items) =>
                                  items.map((item, i) =>
                                    i === deliveryIndex
                                      ? {
                                          ...item,
                                          lines: item.lines.map((line, j) =>
                                            j === partIndex
                                              ? { ...line, quantity }
                                              : line,
                                          ),
                                        }
                                      : item,
                                  ),
                                );
                                setDirty(true);
                              }}
                            />
                          </Field>
                        ))}
                      </div>
                    </Card>
                  ))}
                </div>
              )}
              <div className="detail-meta">
                <div>
                  <span>Đã thu</span>
                  <strong>
                    {money(
                      state.payments
                        .filter((p) => p.orderId === order.id)
                        .reduce((s, p) => s + Number(p.amount), 0),
                    )}
                  </strong>
                </div>
                <div>
                  <span>Thực giao</span>
                  <strong>
                    {money(
                      state.deliveries
                        .filter((d) => d.orderId === order.id)
                        .reduce((s, d) => s + Number(d.total), 0),
                    )}
                  </strong>
                </div>
              </div>
            </Card>
          )}
        </>
      )}
      <div className="order-summary">
        <div>
          <span>Tiền hàng sau giảm</span>
          <strong>{money(total.toString())}</strong>
        </div>
        <div>
          <span>Quỹ dự kiến sau quà</span>
          <strong className={margin.isNegative() ? "negative" : "positive"}>
            {unresolved ? "Chờ đối chiếu" : money(margin.toString())}
          </strong>
        </div>
        <div>
          <span>Quỹ cũ cần hỗ trợ</span>
          <strong>
            {unresolved ? "—" : money(Decimal.max(0, margin.neg()).toString())}
          </strong>
        </div>
        {!locked && (!order || order.status === "draft") && (
          <Button
            variant="primary"
            busy={busy}
            disabled={!lines.length || !customerId}
            onClick={() =>
              void (order && !dirty ? confirmExisting() : save(true))
            }
          >
            <Check size={17} />
            Chốt đơn
          </Button>
        )}
        {editingFinalized && (
          <Button
            variant="primary"
            busy={busy}
            disabled={!dirty || !lines.length || !customerId}
            onClick={() => void save()}
          >
            <Check size={17} />
            Lưu và tính lại
          </Button>
        )}
        {locked && ["confirmed", "partial"].includes(order!.status) && (
          <Button variant="primary" onClick={() => setAction("delivery")}>
            <Truck size={17} />
            Ghi nhận thực giao
          </Button>
        )}
      </div>
      {promotionPreview && (
        <Modal
          title="Xem trước tính lại khuyến mãi"
          onClose={() => setPromotionPreview(null)}
        >
          <Notice>
            Toa hiện dùng quà và chiết khấu đã nhập. Các dòng cố định giá được
            giữ nguyên. Áp dụng thay thế phiên bản hiện tại, không cộng thêm
            quà.
          </Notice>
          <p>
            {promotionPreview.filter((l) => l.kind !== "sale").length} dòng quà
            / trưng bày ·{" "}
            {money(
              promotionPreview.reduce((s, l) => s + Number(l.discount), 0),
            )}{" "}
            giảm giá
          </p>
          <div className="modal-actions">
            <Button onClick={() => setPromotionPreview(null)}>Thoát</Button>
            <Button
              variant="primary"
              onClick={() => {
                setLines(promotionPreview);
                setDirty(true);
                setPromotionPreview(null);
                notify("Đã áp dụng bản khuyến mãi; không nhân đôi dòng quà.");
              }}
            >
              Áp dụng
            </Button>
          </div>
        </Modal>
      )}
      {action && order && (
        <OrderAction
          action={action}
          order={order}
          onClose={() => setAction(null)}
        />
      )}
    </>
  );
}
function OrderAction({
  action,
  order,
  onClose,
}: {
  action: "delivery" | "payment" | "return";
  order: Order;
  onClose: () => void;
}) {
  const { state, command, busy, notify } = useWorkspace();
  const deliveries = state.deliveries.filter((d) => d.orderId === order.id);
  const [deliveryId, setDeliveryId] = useState(deliveries.at(-1)?.id || "");
  const delivery = deliveries.find((d) => d.id === deliveryId);
  const [error, setError] = useState("");
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    const form = new FormData(e.currentTarget);
    try {
      if (action === "payment")
        await command("recordPayment", {
          orderId: order.id,
          date: form.get("date"),
          amount: form.get("amount"),
          notes: form.get("notes"),
        });
      else {
        const source =
          action === "delivery"
            ? order.lines.map((l) => ({ lineId: l.id }))
            : delivery?.lines || [];
        const lines = source
          .map((l) => ({
            lineId: l.lineId,
            quantity: Number(form.get(l.lineId) || 0),
            restock: form.get("restock") === "on",
          }))
          .filter((l) => l.quantity > 0);
        await command(
          action === "delivery" ? "recordDelivery" : "recordReturn",
          {
            orderId: order.id,
            deliveryId,
            date: form.get("date"),
            lines,
            notes: form.get("notes"),
            reason: form.get("notes"),
          },
        );
      }
      notify("Đã lưu chứng từ và cập nhật số liệu.");
      onClose();
    } catch (e) {
      setError((e as Error).message);
    }
  }
  return (
    <Modal
      title={
        action === "delivery"
          ? "Ghi nhận hàng thực giao"
          : action === "payment"
            ? "Ghi nhận tiền đã thu"
            : "Nhận hàng khách trả"
      }
      onClose={onClose}
      wide={action !== "payment"}
    >
      <form onSubmit={submit} className="form-stack">
        {error && <Notice type="error">{error}</Notice>}
        <Field label="Ngày thực tế">
          <input name="date" type="date" defaultValue={today()} required />
        </Field>
        {action === "return" && (
          <>
            <Field label="Phiếu giao gốc">
              <select
                value={deliveryId}
                onChange={(e) => setDeliveryId(e.target.value)}
              >
                {deliveries.map((d) => (
                  <option value={d.id} key={d.id}>
                    {d.code} · {day(d.date)}
                  </option>
                ))}
              </select>
            </Field>
            <label className="checkbox-field">
              <input type="checkbox" name="restock" />
              Đã nhận lại hàng và đủ điều kiện nhập kho
            </label>
          </>
        )}
        {action === "payment" ? (
          <Field label="Số tiền đã thu (đ)">
            <input type="number" min="1" name="amount" required />
          </Field>
        ) : (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Sản phẩm</th>
                  <th className="numeric">
                    {action === "delivery"
                      ? "Còn phải giao"
                      : "Đã giao trong phiếu"}
                  </th>
                  <th>Số lượng {action === "delivery" ? "giao" : "trả"}</th>
                </tr>
              </thead>
              <tbody>
                {order.lines
                  .filter((l) =>
                    action === "delivery"
                      ? l.quantity > l.delivered
                      : delivery?.lines.some((d) => d.lineId === l.id),
                  )
                  .map((l) => {
                    const max =
                      action === "delivery"
                        ? l.quantity - l.delivered
                        : delivery?.lines.find((d) => d.lineId === l.id)
                            ?.quantity || 0;
                    return (
                      <tr key={l.id}>
                        <td>
                          {l.name}
                          <small>
                            {l.kind === "sale" ? "Hàng bán" : "Quà / trưng bày"}
                          </small>
                        </td>
                        <td className="numeric">
                          {max} {l.unit}
                        </td>
                        <td>
                          <input
                            aria-label={`Số lượng ${l.name}`}
                            name={l.id}
                            type="number"
                            min="0"
                            max={max}
                            step="1"
                            defaultValue={action === "delivery" ? max : 0}
                          />
                        </td>
                      </tr>
                    );
                  })}
              </tbody>
            </table>
          </div>
        )}
        <Field label={action === "return" ? "Lý do trả hàng" : "Ghi chú"}>
          <textarea name="notes" required={action === "return"} />
        </Field>
        {action === "return" && (
          <Notice>
            Quỹ và doanh số được đảo theo chứng từ gốc. Đổi hàng: ghi trả tại
            đây rồi tạo đơn thay thế để giữ đủ lịch sử.
          </Notice>
        )}
        <div className="modal-actions">
          <Button type="button" onClick={onClose}>
            Hủy
          </Button>
          <Button variant="primary" busy={busy}>
            Xác nhận{" "}
            {action === "delivery"
              ? "thực giao"
              : action === "payment"
                ? "thu tiền"
                : "nhận trả"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
function printOrder(order: Order, customer: string) {
  const escape = (s: string) =>
    s.replace(
      /[&<>"']/g,
      (c) =>
        ({
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          '"': "&quot;",
          "'": "&#39;",
        })[c]!,
    );
  const win = window.open("", "_blank");
  if (!win) return;
  win.document.write(
    `<!doctype html><html lang="vi"><head><title>${escape(order.code)}</title><style>body{font:14px Arial;padding:32px;color:#152b3c}table{width:100%;border-collapse:collapse}th,td{padding:12px;border-bottom:1px solid #ddd;text-align:left}h1{font-size:24px}.total{text-align:right;font-size:18px}</style></head><body><h1>TrueCare · ${escape(order.code)}</h1><p>Khách hàng: ${escape(customer)} · Ngày ${day(order.date)}</p><table><thead><tr><th>Sản phẩm</th><th>Số lượng</th><th>Đơn giá</th><th>Thành tiền</th></tr></thead><tbody>${order.lines.map((l) => `<tr><td>${escape(l.name)}${l.kind === "sale" ? "" : " (tặng)"}</td><td>${l.quantity} ${escape(l.unit)}</td><td>${l.kind === "sale" ? money(l.price) : "—"}</td><td>${l.kind === "sale" ? money(new Decimal(l.price).times(l.quantity).minus(l.discount).toString()) : "Tặng"}</td></tr>`).join("")}</tbody></table><p class="total"><b>Tổng cộng: ${money(order.total)}</b></p><p>${escape(order.notes)}</p></body></html>`,
  );
  win.document.close();
  win.print();
}
