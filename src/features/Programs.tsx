import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import Decimal from "decimal.js";
import { useWorkspace } from "../api";
import { Button, Card, Empty, Field, Heading, Modal, Notice, Status, money, today, matches } from "../ui";
import type { Program } from "../../shared/types";

export function Programs() {
  const { state, command, busy, user, adminTarget } = useWorkspace();
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("active");
  const [name, setName] = useState("Suất chào hàng");
  const [count, setCount] = useState(1);
  const [expires, setExpires] = useState(today());
  const [allow, setAllow] = useState(false);
  const [lines, setLines] = useState<{ productId: string; quantity: number; price: string }[]>([]);
  const [error, setError] = useState("");
  const [applying, setApplying] = useState<Program | null>(null);
  const [customerId, setCustomerId] = useState("");
  const [useCount, setUseCount] = useState(1);
  const productStatus = (p: typeof state.products[number]) => p.deletedAt ? "Đang ở thùng rác" : p.archived ? "Ngừng kinh doanh" : p.cost === null && p.price === null ? "Thiếu giá vốn và giá chào" : p.cost === null ? "Thiếu giá vốn" : p.price === null ? "Thiếu giá chào" : "";
  const eligible = state.products.filter(p => !productStatus(p) && matches(query, p.name, p.code));
  const blocked = state.products.filter(p => productStatus(p) && matches(query, p.name, p.code));
  const add = (id: string) => {
    const product = eligible.find(p => p.id === id);
    if (product && !lines.some(l => l.productId === id)) setLines([...lines, { productId: id, quantity: 1, price: product.price! }]);
  };
  const estimate = useMemo(() => {
    try {
      let price = new Decimal(0), cost = new Decimal(0);
      for (const line of lines) {
        const product = state.products.find(p => p.id === line.productId);
        if (!product || productStatus(product) || !Number.isSafeInteger(line.quantity) || line.quantity < 1) return null;
        const quote = new Decimal(line.price);
        if (!quote.isFinite() || quote.lt(0) || quote.gt(product.price!)) return null;
        price = price.plus(quote.times(line.quantity));
        cost = cost.plus(new Decimal(product.cost!).times(line.quantity));
      }
      const subsidy = Decimal.max(0, cost.minus(price));
      return { price, cost, subsidy, held: subsidy.times(Number.isSafeInteger(count) && count > 0 ? count : 0) };
    } catch { return null; }
  }, [lines, count, state.products]);
  const save = async () => {
    setError("");
    try { await command("reserveProgram", { name, count, expiresAt: expires, allowSubsidy: allow, mode: "bundle", lines }); setLines([]); }
    catch (cause) { setError((cause as Error).message); }
  };
  const apply = async () => {
    if (!applying) return;
    setError("");
    try {
      const result = await command("applyProgram", { id: applying.id, customerId, count: useCount, date: today() });
      const order = result.orders.find(order => order.id === result.commandResult?.orderId);
      setApplying(null);
      if (order) navigate(`/orders/${order.id}`);
    } catch (cause) { setError((cause as Error).message); }
  };
  const status = (p: Program) => p.archivedAt ? "archived" : p.status === "active" && p.expiresAt < today() ? "expired" : p.status;
  const rows = state.programs.filter(p => filter === "all" || status(p) === filter);
  const customers = state.customers.filter(c => !c.archived && !c.deletedAt && !c.mergedInto);
  return <>
    <Heading title="Chương trình chào hàng" description="Tạo suất, kiểm tra ngân sách và dùng suất để lập toa." />
    {error && !applying && <Notice type="error">{error}</Notice>}
    <div className="program-grid">
      <Card title="Tạo suất chào"><div className="form-stack">
        <Field label="Tên chương trình"><input value={name} onChange={e => setName(e.target.value)} /></Field>
        <div className="form-grid">
          <Field label="Số suất"><input type="number" min="1" max="1000000" value={count} onChange={e => setCount(Number(e.target.value))} /></Field>
          <Field label="Hết hạn"><input type="date" min={today()} value={expires} onChange={e => setExpires(e.target.value)} /></Field>
        </div>
        <Field label="Tìm sản phẩm"><input type="search" value={query} onChange={e => setQuery(e.target.value)} placeholder="Mã hoặc tên sản phẩm" /></Field>
        <Field label="Thêm sản phẩm" hint="Chọn sản phẩm đang kinh doanh và đủ giá vốn/giá chào.">
          <select value="" onChange={e => add(e.target.value)}><option value="">Chọn sản phẩm đủ điều kiện</option>
            <optgroup label="Có thể dùng">{eligible.map(p => <option key={p.id} value={p.id}>{p.code} · {p.name}</option>)}</optgroup>
            <optgroup label="Chưa đủ điều kiện">{blocked.map(p => <option key={p.id} value={p.id} disabled>{p.code} · {p.name} — {productStatus(p)}</option>)}</optgroup>
          </select>
        </Field>
        {blocked.length > 0 && <Notice>{blocked.length} sản phẩm đang bị ẩn khỏi danh sách chọn vì thiếu giá hoặc không còn kinh doanh.
          {user.role === "admin" ? <Button onClick={() => navigate("/products")}>Cập nhật bảng giá</Button> : <p>Liên hệ quản trị viên để cập nhật bảng giá.</p>}
        </Notice>}
        {!eligible.length && <Notice type="warning">Không có sản phẩm phù hợp. Kiểm tra từ khóa hoặc giá sản phẩm.</Notice>}
        {lines.map((line, index) => <div className="program-line" key={line.productId}>
          <span data-testid="program-selected-product">{state.products.find(p => p.id === line.productId)?.name}</span>
          <input aria-label={`Số lượng sản phẩm ${index + 1}`} type="number" min="1" value={line.quantity} onChange={e => setLines(lines.map((l, i) => i === index ? { ...l, quantity: Number(e.target.value) } : l))} />
          <input aria-label={`Giá chào sản phẩm ${index + 1}`} type="number" min="0" value={line.price} onChange={e => setLines(lines.map((l, i) => i === index ? { ...l, price: e.target.value } : l))} />
          <Button aria-label={`Bỏ sản phẩm ${index + 1}`} onClick={() => setLines(lines.filter((_, i) => i !== index))}>×</Button>
        </div>)}
        <label className="checkbox-field"><input type="checkbox" checked={allow} onChange={e => setAllow(e.target.checked)} />Cho phép dùng quỹ đã giao nếu cần bù</label>
        {estimate && lines.length > 0 && <Notice>Giá trị mỗi suất: {money(estimate.price.toString())} · Cần bù: {money(estimate.subsidy.toString())} · Ngân sách sẽ giữ: {money(estimate.held.toString())}. Quỹ khả dụng: {money(state.summary.available)}.</Notice>}
        <Notice>Mỗi suất được hỗ trợ tối đa 200.000đ. Khi lưu kiểm tra bảng giá và quỹ; khi dùng suất kiểm tra thêm tồn kho.</Notice>
        <Button variant="primary" busy={busy} disabled={!lines.length || !estimate || !Number.isSafeInteger(count) || count < 1 || !name.trim() || expires < today()} onClick={() => void save()}>Lưu & giữ ngân sách</Button>
      </div></Card>
      <Card title="Chương trình đã lưu">
        <Field label="Trạng thái chương trình"><select value={filter} onChange={e => setFilter(e.target.value)}><option value="active">Đang hoạt động</option><option value="expired">Hết hạn</option><option value="cancelled">Đã hủy</option><option value="archived">Đã lưu trữ</option><option value="all">Tất cả</option></select></Field>
        {rows.length ? <div className="program-list">{rows.map(p => <div key={p.id}><div><strong>{p.name}</strong><small>{p.remaining}/{p.count} suất · hết hạn {p.expiresAt}</small></div><span><Status value={status(p)} /><b>Giữ {money(status(p) === "active" ? p.reserved : "0")}</b></span>
          <Button disabled={status(p) !== "active" || p.remaining < 1} onClick={() => { setApplying(p); setUseCount(1); setCustomerId(""); setError(""); }}>Dùng suất</Button>
        </div>)}</div> : <Empty title="Chưa có chương trình phù hợp" description="Đổi bộ lọc hoặc tạo chương trình mới." />}
      </Card>
    </div>
    {applying && <Modal title="Dùng suất tạo toa" onClose={() => !busy && setApplying(null)}>
      <div className="form-stack">
        {error && <Notice type="error">{error}</Notice>}
        <Notice>{applying.name}. Xác nhận sẽ tạo toa đã chốt và chuyển phần ngân sách giữ sang toa. {adminTarget && `Đang thao tác cho ${adminTarget.displayName}.`}</Notice>
        <Field label="Khách hàng nhận suất"><select value={customerId} onChange={e => setCustomerId(e.target.value)}><option value="">Chọn khách</option>{customers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></Field>
        <Field label="Số suất sử dụng"><input type="number" min="1" max={applying.remaining} value={useCount} onChange={e => setUseCount(Number(e.target.value))} /></Field>
        <p>Tổng giá trị: {money(new Decimal(applying.price).times(Number.isFinite(useCount) ? useCount : 0).toString())} · Còn lại sau sử dụng: {applying.remaining - useCount} suất.</p>
        <div className="modal-actions"><Button disabled={busy} onClick={() => setApplying(null)}>Hủy</Button><Button variant="primary" busy={busy} disabled={!customerId || !Number.isSafeInteger(useCount) || useCount < 1 || useCount > applying.remaining} onClick={() => void apply()}>Xác nhận tạo toa</Button></div>
      </div>
    </Modal>}
  </>;
}
