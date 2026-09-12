import { usePagedQuery } from '../lib/usePagedQuery';
import { AdminQuery } from './AdminQuery';
import { csvCell } from '../lib/reporting';
import { useEffect, useRef, useState, type FormEvent } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import {
  Activity, Boxes, ClipboardList, Database, Download, FileClock, KeyRound,
  LayoutDashboard, LockKeyhole, PackageSearch, Pencil, Plus, RefreshCw,
  ArrowDown, ArrowUp, ScrollText, Settings, Tag, Trash2, Undo2, UserRoundCog, Users, WalletCards,
} from '../icons';
import type { Customer, EmployeeAccount, Product, TeamMember } from "../../shared/types";
import { request, useWorkspace } from "../api";
import {
  Badge, Button, Card, DateRange, Empty, Field, Heading, Modal, Notice,
  Pager, SearchBox, Stat, Status, TextActionModal, ConfirmActionModal, day, download, money, today,
} from "../ui";

type Page<T> = { items: T[]; page: number; pageSize: number; total: number; pages: number };
type AdminProps = { reason: string; members: TeamMember[]; reloadMembers: () => Promise<void> };
const pageSize = 25;
const sections = [
  ["overview", "Tổng quan", LayoutDashboard], ["customers", "Khách hàng", Users],
  ["orders", "Toa & thực giao", ClipboardList], ["products", "Sản phẩm & bảng giá", PackageSearch],
  ["inventory", "Kho công ty", Boxes], ["funds", "Quỹ & chương trình", WalletCards],
  ["employees", "Nhân viên", UserRoundCog], ["catalogs", "Danh mục", Tag],
  ["imports", "Nhập dữ liệu", FileClock], ["audit", "Nhật ký", ScrollText],
  ["system", "Cài đặt hệ thống", Settings],
] as const;
function requireReason(reason: string) { if (reason.trim().length < 3) throw new Error("Nhập lý do quản trị từ 3 ký tự trước khi lưu"); return reason.trim(); }

type BulkResource = "customers" | "orders" | "products" | "users";
type BulkAction = "trash" | "restore" | "purge";
type BulkRef = { key: string; id: string; ownerId?: string; label: string; trashed: boolean };
type BulkResponse = { successCount: number; skippedCount: number; results: { id: string; ownerId?: string; status: "success"|"skipped"; message: string }[] };
const actionLabel: Record<BulkAction,string> = { trash: "Đưa vào thùng rác", restore: "Khôi phục", purge: "Xoá vĩnh viễn" };

function SelectionBox({ checked, partial = false, label, onChange }: { checked: boolean; partial?: boolean; label: string; onChange: () => void }) {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => { if (ref.current) ref.current.indeterminate = partial; }, [partial]);
  return <input ref={ref} className="row-selector" type="checkbox" checked={checked} aria-label={label} onChange={onChange}/>;
}

function useBulkActions(resource: BulkResource, rows: BulkRef[], reason: string, reload: () => Promise<void>, resetKey: string) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [pending, setPending] = useState<{ action: BulkAction; rows: BulkRef[]; reason:string; requestId:string }|null>(null);
  const [result, setResult] = useState<BulkResponse|null>(null);
  const [busy, setBusy] = useState(false);
  const submitting = useRef(false);
  const { notify } = useWorkspace();
  useEffect(() => { setSelected(new Set()); setResult(null); }, [resetKey]);
  const chosen = rows.filter((row) => selected.has(row.key));
  const allTrashed = chosen.length > 0 && chosen.every((row) => row.trashed);
  const noneTrashed = chosen.every((row) => !row.trashed);
  const all = rows.length > 0 && chosen.length === rows.length;
  const toggle = (key: string) => setSelected((current) => { const next = new Set(current); if (next.has(key)) next.delete(key); else next.add(key); return next; });
  const toggleAll = () => setSelected(all ? new Set() : new Set(rows.map((row) => row.key)));
  const begin = (action: BulkAction, only?: BulkRef[]) => {
    try { requireReason(reason); const targets = only ?? chosen; if (!targets.length) throw new Error("Chọn ít nhất một dòng"); setPending({ action, rows: targets, reason:reason.trim(), requestId:crypto.randomUUID() }); setResult(null); } catch (error) { notify((error as Error).message); }
  };
  const submit = async () => {
    if (!pending || submitting.current) return;
    submitting.current = true;
    setBusy(true);
    try {
      const response = await request<BulkResponse>(`/api/admin/${resource}/bulk-actions`, {
        action: pending.action,
        items: pending.rows.map(({ id, ownerId }) => ownerId ? { id, ownerId } : { id }),
        reason: pending.reason,
        idempotencyKey: pending.requestId,
      });
      setResult(response);
      const skipped = new Set(response.results.filter((item) => item.status === "skipped").map((item) => `${item.ownerId ?? ""}:${item.id}`));
      setSelected(skipped);
      setPending(null);
      notify(`Đã xử lý ${response.successCount} dòng${response.skippedCount ? `, giữ lại ${response.skippedCount} dòng bị chặn` : ""}.`);
      await reload();
    } catch (error) { notify((error as Error).message); }
    finally { submitting.current = false; setBusy(false); }
  };
  const controls = <>
    {selected.size > 0 && <div className="bulk-bar" role="region" aria-label="Thao tác các dòng đã chọn"><strong>Đã chọn {selected.size} dòng</strong><div className="heading-actions">{noneTrashed && <Button variant="danger" onClick={() => begin("trash")}>Xoá</Button>}{allTrashed && <><Button onClick={() => begin("restore")}>Khôi phục</Button><Button variant="danger" onClick={() => begin("purge")}>Xoá vĩnh viễn</Button></>}{!noneTrashed && !allTrashed && <><Button onClick={() => begin("restore", chosen.filter((row) => row.trashed))}>Khôi phục dòng trong thùng rác</Button><Button variant="danger" onClick={() => begin("trash", chosen.filter((row) => !row.trashed))}>Xoá dòng đang hoạt động</Button></>}<Button onClick={() => setSelected(new Set())}>Bỏ chọn</Button></div></div>}
    {result?.skippedCount ? <Notice type="error"><strong>{result.skippedCount} dòng chưa xử lý:</strong><ul>{result.results.filter((item) => item.status === "skipped").map((item) => <li key={`${item.ownerId}:${item.id}`}>{item.message}</li>)}</ul></Notice> : null}
    {pending && <Modal title={`${actionLabel[pending.action]} ${pending.rows.length} dòng`} onClose={() => !busy && setPending(null)}><p>Hệ thống sẽ xử lý từng dòng và giữ lại những dòng không đủ điều kiện.</p><ul className="bulk-preview">{pending.rows.slice(0, 8).map((row) => <li key={row.key}>{row.label}</li>)}{pending.rows.length > 8 && <li>…và {pending.rows.length - 8} dòng khác</li>}</ul>{pending.action === "trash" && resource === "orders" && <Notice>Toa đã giao sẽ được tính lại KPI, quỹ, ngân sách và kho đúng một lần.</Notice>}<div className="modal-actions"><Button disabled={busy} onClick={() => setPending(null)}>Huỷ</Button><Button busy={busy} variant={pending.action === "purge" ? "danger" : "primary"} onClick={() => void submit()}>{actionLabel[pending.action]}</Button></div></Modal>}
  </>;
  return { selected, chosen, all, partial: chosen.length > 0 && !all, toggle, toggleAll, begin, controls };
}

export function AdminConsole() {
  const location = useLocation(), navigate = useNavigate();
  const { adminReason, setAdminReason, notify } = useWorkspace();
  const section = location.pathname.split("/")[2] || "overview";
  const [members, setMembers] = useState<TeamMember[]>([]);
  const reloadMembers = async () => setMembers((await request<{ members: TeamMember[] }>("/api/admin/team")).members);
  useEffect(() => { void reloadMembers().catch((error) => notify((error as Error).message)); }, []);
  const props = { reason: adminReason, members, reloadMembers };
  return <>
    <Heading eyebrow="ADMIN CONSOLE" title="Quản trị TrueCare" description="Theo dõi và xử lý dữ liệu toàn hệ thống tại một nơi." />
    <Card className="admin-reason-card"><Field label="Lý do thao tác quản trị"><input value={adminReason} onChange={(e) => setAdminReason(e.target.value)} placeholder="Bắt buộc khi sửa, xoá, gộp hoặc điều chỉnh số liệu" /></Field><small>Lý do được lưu cùng người thao tác, thời điểm và dữ liệu trước/sau.</small></Card>
    <nav className="admin-nav" aria-label="Chức năng quản trị">{sections.map(([key, label, Icon]) => <button key={key} className={section === key ? "active" : ""} onClick={() => navigate(`/admin/${key}`)}><Icon size={17}/>{label}</button>)}</nav>
    {section === "overview" && <Overview {...props}/>} {section === "customers" && <CustomersAdmin {...props}/>} {section === "orders" && <OrdersAdmin {...props}/>} {section === "products" && <ProductsAdmin {...props}/>} {section === "inventory" && <InventoryAdmin {...props}/>} {section === "funds" && <FundsAdmin {...props}/>} {section === "employees" && <EmployeesAdmin {...props}/>} {section === "catalogs" && <CatalogsAdmin {...props}/>} {section === "imports" && <ImportsAdmin {...props}/>} {section === "audit" && <AuditAdmin {...props}/>} {section === "system" && <SystemAdmin {...props}/>}
  </>;
}

function Overview({ members }: AdminProps) {
  const { notify } = useWorkspace(); const navigate = useNavigate(); const [data, setData] = useState<any>(null);
  const load = () => request<any>("/api/admin/dashboard").then(setData).catch((e) => notify(e.message)); useEffect(() => void load(), []);
  if (!data) return <Card><div className="loading-row">Đang tải tổng quan…</div></Card>;
  const s = data.summary;
  return <><div className="stats-grid"><Stat label="Nhân viên" value={String(s.employees)}/><Stat label="Toa đang theo dõi" value={String(s.orders)}/><Stat label="Giao một phần" value={String(s.partialOrders)} accent={s.partialOrders ? "warning" : ""}/><Stat label="Quỹ âm" value={String(s.negativeFunds)} accent={s.negativeFunds ? "negative" : ""}/><Stat label="Kho thấp" value={String(s.lowStock)} accent={s.lowStock ? "warning" : ""}/><Stat label="Dữ liệu cần đối chiếu" value={String(s.unresolved)} accent={s.unresolved ? "warning" : ""}/></div><div className="admin-grid"><Card title="Việc cần xử lý" actions={<Button onClick={load}><RefreshCw size={15}/>Tải lại</Button>}><div className="action-list"><button onClick={() => navigate("/admin/orders")}>Toa giao một phần <Badge tone="amber">{s.partialOrders}</Badge></button><button onClick={() => navigate("/admin/inventory")}>Sản phẩm sắp hết hoặc âm <Badge tone="amber">{s.lowStock}</Badge></button><button onClick={() => navigate("/admin/funds")}>Nhân viên có quỹ âm <Badge tone="red">{s.negativeFunds}</Badge></button><button onClick={() => navigate("/admin/customers")}>Nhóm khách có thể bị trùng <Badge tone="blue">{s.duplicateCustomers}</Badge></button><button onClick={() => navigate("/admin/products")}>Sản phẩm cần đối chiếu <Badge tone="blue">{s.productsNeedingReview}</Badge></button></div></Card><Card title="Tình trạng tài khoản"><div className="summary-list"><div><span>Đang hoạt động</span><strong>{members.filter((x) => x.active).length}</strong></div><div><span>Đã khóa</span><strong>{members.filter((x) => !x.active).length}</strong></div><div><span>Chưa từng đăng nhập</span><strong>{members.filter((x) => !x.lastLoginAt).length}</strong></div></div></Card></div></>;
}

type CustomerRow = Customer & { usage: { orders: number; visits: number; revenue: string } };
function CustomersAdmin({ reason }: AdminProps) {
  const navigate=useNavigate();const [merge,setMerge]=useState<CustomerRow|null>(null);
  const query=usePagedQuery<CustomerRow>('/api/admin/customers','customers',{q:'',status:'active'});
  const rows=query.loading?null:query.data,page=query.page,setPage=query.setPage;
  const load=async()=>{query.reload();};

  const refs = (rows?.items ?? []).filter((row) => !row.mergedInto).map((row) => ({ key: `:${row.id}`, id: row.id, label: `${row.name} · ${row.phone || "không có SĐT"}`, trashed: !!row.deletedAt }));
  const bulk = useBulkActions("customers", refs, reason, load, query.resetKey);
  const refOf = (row: CustomerRow) => refs.find((item) => item.id === row.id)!;
  return <><Card title="Danh bạ khách hàng toàn hệ thống" actions={<Button variant="primary" onClick={() => navigate("/customers")}><Plus size={15}/>Tạo hoặc sửa khách</Button>}><AdminQuery query={query} dates={false} statuses={{active:'Đang hoạt động',deleted:'Thùng rác',merged:'Đã gộp',all:'Tất cả'}}/>{bulk.controls}{rows?.items.length ? <div className="table-scroll" tabIndex={0} role="region" aria-label="Bảng dữ liệu có thể cuộn"><table><thead><tr><th className="select-column"><SelectionBox checked={bulk.all} partial={bulk.partial} label="Chọn tất cả khách hàng trên trang" onChange={bulk.toggleAll}/></th><th>Khách hàng</th><th>Khu vực / tuyến</th><th className="numeric">Toa</th><th className="numeric">Thực giao</th><th>Trạng thái</th><th/></tr></thead><tbody>{rows.items.map((row) => <tr key={row.id}><td className="select-column">{!row.mergedInto && <SelectionBox checked={bulk.selected.has(`:${row.id}`)} label={`Chọn ${row.name}`} onChange={() => bulk.toggle(`:${row.id}`)}/>}</td><td><strong>{row.name}</strong><small>{row.phone || "Chưa có điện thoại"}</small></td><td>{row.district}<small>{row.route}</small></td><td className="numeric">{row.usage.orders}</td><td className="numeric">{money(row.usage.revenue)}</td><td>{row.mergedInto ? <Badge>Đã gộp</Badge> : row.deletedAt ? <Badge tone="red">Thùng rác</Badge> : <Badge tone="green">Hoạt động</Badge>}</td><td><div className="heading-actions">{!row.deletedAt && !row.mergedInto && <><Button onClick={() => setMerge(row)}>Gộp</Button><Button variant="danger" onClick={() => bulk.begin("trash", [refOf(row)])}><Trash2 size={14}/>Xoá</Button></>}{row.deletedAt && <><Button onClick={() => bulk.begin("restore", [refOf(row)])}><Undo2 size={14}/>Khôi phục</Button><Button variant="danger" onClick={() => bulk.begin("purge", [refOf(row)])}>Xoá vĩnh viễn</Button></>}</div></td></tr>)}</tbody></table></div> : <Empty title="Không có khách hàng phù hợp"/>}{rows && <Pager page={page} count={rows.total} size={pageSize} onChange={setPage}/>}</Card>{merge && <MergeCustomer source={merge} reason={reason} onClose={() => setMerge(null)} onSaved={async () => { setMerge(null); await load(); }}/>}</>;
}
function MergeCustomer({ source, reason, onClose, onSaved }: { source: CustomerRow; reason: string; onClose: () => void; onSaved: () => Promise<void> }) {
  const { notify } = useWorkspace(); const [targets, setTargets] = useState<CustomerRow[]>([]), [targetId, setTargetId] = useState(""); useEffect(() => { void request<Page<CustomerRow>>("/api/admin/customers?status=active&pageSize=100").then((x) => setTargets(x.items.filter((row) => row.id !== source.id))); }, []);
  const save = async () => { try { requireReason(reason); if (!targetId) throw new Error("Chọn khách hàng nhận dữ liệu"); await request(`/api/admin/customers/${source.id}/merge`, { targetId, reason, idempotencyKey: crypto.randomUUID() }); notify("Đã gộp khách và chuyển toàn bộ lịch sử."); await onSaved(); } catch (error) { notify((error as Error).message); } };
  return <Modal title={`Gộp khách: ${source.name}`} onClose={onClose}><Notice>Toàn bộ toa và lượt ghé sẽ chuyển sang khách được chọn. Khách nguồn được giữ làm dấu vết.</Notice><Field label="Khách hàng nhận dữ liệu"><select value={targetId} onChange={(e) => setTargetId(e.target.value)}><option value="">Chọn khách hàng</option>{targets.map((row) => <option key={row.id} value={row.id}>{row.name} · {row.phone}</option>)}</select></Field><div className="modal-actions"><Button onClick={onClose}>Huỷ</Button><Button variant="primary" onClick={() => void save()}>Xác nhận gộp</Button></div></Modal>;
}

function OrdersAdmin({ members, reason }: AdminProps) {
  const {setAdminTarget}=useWorkspace();const navigate=useNavigate();
  const query=usePagedQuery<any>('/api/admin/orders','orders',{q:'',status:'all',ownerId:'',from:today().slice(0,7)+'-01',to:today()});
  const rows=query.loading?null:query.data,page=query.page,setPage=query.setPage;
  const load=async()=>{query.reload();};
  const open = (row: any) => { const member = members.find((x) => x.id === row.ownerId); if (member) setAdminTarget(member); navigate(`/orders/${row.id}`); };

  const refs = (rows?.items ?? []).map((row) => ({ key: `${row.ownerId}:${row.id}`, id: row.id, ownerId: row.ownerId, label: `${row.code} · ${row.customerName} · ${row.ownerName}`, trashed: !!row.deletedAt }));
  const bulk = useBulkActions("orders", refs, reason, load, query.resetKey);
  const refOf = (row: any) => refs.find((item) => item.key === `${row.ownerId}:${row.id}`)!;
  return <Card title="Toa và thực giao toàn đội"><AdminQuery query={query} members={members} statuses={{all:'Mọi trạng thái',draft:'Nháp',confirmed:'Đã chốt',partial:'Giao một phần',delivered:'Giao đủ',trash:'Thùng tạm giữ'}}/>{bulk.controls}{rows?.items.length ? <div className="table-scroll" tabIndex={0} role="region" aria-label="Bảng dữ liệu có thể cuộn"><table><thead><tr><th className="select-column"><SelectionBox checked={bulk.all} partial={bulk.partial} label="Chọn tất cả toa trên trang" onChange={bulk.toggleAll}/></th><th>Toa</th><th>Nhân viên</th><th>Khách hàng</th><th>Ngày</th><th>Trạng thái</th><th className="numeric">Tiền hàng</th><th/></tr></thead><tbody>{rows.items.map((row) => <tr key={`${row.ownerId}:${row.id}`}><td className="select-column"><SelectionBox checked={bulk.selected.has(`${row.ownerId}:${row.id}`)} label={`Chọn toa ${row.code}`} onChange={() => bulk.toggle(`${row.ownerId}:${row.id}`)}/></td><td><strong>{row.code}</strong></td><td>{row.ownerName}</td><td>{row.customerName}</td><td>{day(row.date)}</td><td>{row.deletedAt ? <Badge tone="red">Thùng tạm giữ</Badge> : <Status value={row.status}/>}</td><td className="numeric">{money(row.total)}</td><td><div className="heading-actions">{row.deletedAt ? <><Button onClick={() => bulk.begin("restore", [refOf(row)])}><Undo2 size={14}/>Khôi phục</Button><Button variant="danger" onClick={() => bulk.begin("purge", [refOf(row)])}>Xoá hẳn</Button></> : <><Button onClick={() => open(row)}>Mở toa</Button><Button variant="danger" onClick={() => bulk.begin("trash", [refOf(row)])}><Trash2 size={14}/>Xoá</Button></>}</div></td></tr>)}</tbody></table></div> : <Empty title="Không có toa phù hợp"/>}{rows && <Pager page={page} count={rows.total} size={pageSize} onChange={setPage}/>}</Card>;
}

function ProductsAdmin({ reason }: AdminProps) {
  const navigate=useNavigate();const [price,setPrice]=useState<Product|null>(null),[history,setHistory]=useState<Product|null>(null);
  const query=usePagedQuery<any>('/api/admin/products','products',{q:'',status:'active'});
  const rows=query.loading?null:query.data,page=query.page,setPage=query.setPage;
  const load=async()=>{query.reload();};

  const refs = (rows?.items ?? []).map((row) => ({ key: `:${row.id}`, id: row.id, label: `${row.code || "Không mã"} · ${row.name}`, trashed: !!row.deletedAt }));
  const bulk = useBulkActions("products", refs, reason, load, query.resetKey);
  const refOf = (row: any) => refs.find((item) => item.id === row.id)!;
  return <><Card title="Sản phẩm và bảng giá dùng chung" actions={<Button variant="primary" onClick={() => navigate("/products")}><Plus size={15}/>Thêm sản phẩm</Button>}><AdminQuery query={query} dates={false} statuses={{active:'Đang kinh doanh',archived:'Ngừng kinh doanh',deleted:'Thùng rác',all:'Tất cả'}}/>{bulk.controls}{rows?.items.length ? <div className="table-scroll" tabIndex={0} role="region" aria-label="Bảng dữ liệu có thể cuộn"><table><thead><tr><th className="select-column"><SelectionBox checked={bulk.all} partial={bulk.partial} label="Chọn tất cả sản phẩm trên trang" onChange={bulk.toggleAll}/></th><th>Mã / sản phẩm</th><th>Quy cách</th><th className="numeric">Giá gốc</th><th className="numeric">Giá chào</th><th className="numeric">Đang dùng</th><th>Trạng thái</th><th/></tr></thead><tbody>{rows.items.map((row) => <tr key={row.id}><td className="select-column"><SelectionBox checked={bulk.selected.has(`:${row.id}`)} label={`Chọn ${row.name}`} onChange={() => bulk.toggle(`:${row.id}`)}/></td><td><strong>{row.code || "—"} · {row.name}</strong><small>{row.group} · {row.brand}</small></td><td>{row.pack} {row.unit}/thùng</td><td className="numeric">{row.cost == null ? "Chưa có" : money(row.cost)}</td><td className="numeric">{row.price == null ? "Chưa có" : money(row.price)}</td><td className="numeric">{row.usage.orders} toa</td><td>{row.deletedAt ? <Badge tone="red">Thùng rác</Badge> : row.archived ? <Badge tone="amber">Ngừng kinh doanh</Badge> : <Badge tone="green">Đang kinh doanh</Badge>}</td><td><div className="heading-actions"><Button onClick={() => setHistory(row)}>Lịch sử</Button>{row.deletedAt ? <><Button onClick={() => bulk.begin("restore", [refOf(row)])}><Undo2 size={14}/>Khôi phục</Button><Button variant="danger" onClick={() => bulk.begin("purge", [refOf(row)])}>Xoá hẳn</Button></> : <><Button onClick={() => setPrice(row)}><Pencil size={14}/>Cập nhật giá</Button><Button variant="danger" onClick={() => bulk.begin("trash", [refOf(row)])}><Trash2 size={14}/>Xoá</Button></>}</div></td></tr>)}</tbody></table></div> : <Empty title="Chưa có sản phẩm"/>}{rows && <Pager page={page} count={rows.total} size={pageSize} onChange={setPage}/>}</Card>{price && <PriceModal product={price} reason={reason} onClose={() => setPrice(null)} onSaved={async () => { setPrice(null); await load(); }}/>} {history && <PriceHistoryModal product={history} onClose={() => setHistory(null)}/>}</>;
}
function PriceModal({ product, reason, onClose, onSaved }: { product: Product; reason: string; onClose: () => void; onSaved: () => Promise<void> }) { const { notify } = useWorkspace(); const save = async (e: FormEvent<HTMLFormElement>) => { e.preventDefault(); try { requireReason(reason); const f = new FormData(e.currentTarget); await request("/api/admin/catalog/bulk-price", { match: { code: product.code }, patch: { cost: f.get("cost"), price: f.get("price"), pack: Number(f.get("pack")), effectiveDate: f.get("effectiveDate") }, reason, idempotencyKey: crypto.randomUUID() }); notify("Đã cập nhật bảng giá toàn hệ thống."); await onSaved(); } catch (error) { notify((error as Error).message); } }; return <Modal title={`Cập nhật giá · ${product.name}`} onClose={onClose}><Notice>Giá mới áp dụng toàn hệ thống. Toa cũ vẫn giữ giá tại thời điểm lập chứng từ.</Notice><form className="form-stack" onSubmit={save}><div className="form-grid"><Field label="Giá gốc"><input name="cost" type="number" min="0" defaultValue={product.cost ?? ""}/></Field><Field label="Giá chào"><input name="price" type="number" min="0" defaultValue={product.price ?? ""}/></Field><Field label="Quy cách"><input name="pack" type="number" min="1" defaultValue={product.pack}/></Field><Field label="Ngày hiệu lực"><input name="effectiveDate" type="date" defaultValue={product.effectiveDate}/></Field></div><div className="modal-actions"><Button type="button" onClick={onClose}>Huỷ</Button><Button variant="primary">Lưu bảng giá</Button></div></form></Modal>; }

function PriceHistoryModal({ product, onClose }: { product: Product; onClose: () => void }) { const { notify } = useWorkspace(); const [entries, setEntries] = useState<any[]>([]); useEffect(() => { void request<{ entries: any[] }>(`/api/admin/products/${product.id}/prices`).then((x) => setEntries(x.entries)).catch((e) => notify(e.message)); }, []); return <Modal title={`Lịch sử giá · ${product.name}`} onClose={onClose} wide>{entries.length ? <div className="table-scroll" tabIndex={0} role="region" aria-label="Bảng dữ liệu có thể cuộn"><table><thead><tr><th>Hiệu lực</th><th className="numeric">Giá gốc</th><th className="numeric">Giá chào</th><th>Quy cách</th><th>Lý do</th></tr></thead><tbody>{entries.map((entry) => <tr key={entry.id}><td>{day(entry.effective_date)}</td><td className="numeric">{entry.cost == null ? "—" : money(entry.cost)}</td><td className="numeric">{entry.quote_price == null ? "—" : money(entry.quote_price)}</td><td>{entry.pack}</td><td>{entry.reason}</td></tr>)}</tbody></table></div> : <Empty title="Chưa có lịch sử giá"/>}</Modal>; }

function InventoryAdmin({ reason }: AdminProps) {
  const { notify } = useWorkspace(); const [data, setData] = useState<any>(null), [q, setQ] = useState(""), [adjust, setAdjust] = useState<any>(null); const load = () => request<any>(`/api/admin/inventory?q=${encodeURIComponent(q)}`).then(setData).catch((e) => notify(e.message)); useEffect(() => void load(), []);
  return <><Card title="Kho công ty" subtitle="Nhân viên chỉ xem. Giao, trả, xoá và khôi phục toa cập nhật số dư này."><div className="toolbar"><SearchBox value={q} onChange={setQ}/><Button onClick={load}>Áp dụng</Button></div>{data?.balances?.length ? <div className="table-scroll" tabIndex={0} role="region" aria-label="Bảng dữ liệu có thể cuộn"><table><thead><tr><th>Sản phẩm</th><th className="numeric">Tồn đơn vị</th><th>Trạng thái</th><th>Cập nhật</th><th/></tr></thead><tbody>{data.balances.map((row: any) => <tr key={row.productId}><td><strong>{row.product?.name ?? row.productId}</strong><small>{row.product?.code}</small></td><td className={`numeric ${row.quantity < 0 ? "negative" : ""}`}>{row.quantity}</td><td>{row.tracked ? row.quantity <= 12 ? <Badge tone="amber">Kho thấp</Badge> : <Badge tone="green">Đang theo dõi</Badge> : <Badge>Không theo dõi</Badge>}</td><td>{day(row.updatedAt)}</td><td><Button onClick={() => setAdjust(row)}>Điều chỉnh</Button></td></tr>)}</tbody></table></div> : <Empty title="Chưa khai báo tồn kho"/>}</Card>{adjust && <InventoryModal row={adjust} reason={reason} onClose={() => setAdjust(null)} onSaved={async () => { setAdjust(null); await load(); }}/>}</>;
}
function InventoryModal({ row, reason, onClose, onSaved }: any) { const { notify } = useWorkspace(); const save = async (e: FormEvent<HTMLFormElement>) => { e.preventDefault(); try { requireReason(reason); const f = new FormData(e.currentTarget); await request("/api/admin/inventory/adjust", { productId: row.productId, mode: f.get("mode"), quantity: Number(f.get("quantity")), tracked: true, reason, idempotencyKey: crypto.randomUUID() }); notify("Đã điều chỉnh kho công ty."); await onSaved(); } catch (error) { notify((error as Error).message); } }; return <Modal title={`Điều chỉnh kho · ${row.product?.name ?? row.productId}`} onClose={onClose}><form className="form-stack" onSubmit={save}><Field label="Cách nhập"><select name="mode"><option value="set">Đặt số tồn mới</option><option value="delta">Cộng/trừ biến động</option></select></Field><Field label="Số lượng"><input name="quantity" type="number" required/></Field><div className="modal-actions"><Button type="button" onClick={onClose}>Huỷ</Button><Button variant="primary">Lưu điều chỉnh</Button></div></form></Modal>; }

function FundsAdmin({ members }: AdminProps) {
  const { notify, setAdminTarget } = useWorkspace(); const navigate = useNavigate();
  const query=usePagedQuery<any>('/api/admin/funds','funds',{q:'',ownerId:'',from:'',to:''});
  const rows=query.data,page=query.page,setPage=query.setPage,owner=query.draft.ownerId;
  const open=(id:string,path:string)=>{const member=members.find((item)=>item.id===id);if(member)setAdminTarget(member);navigate(path);};
  return <><Card title="Quỹ toàn đội"><AdminQuery query={query} members={members}/><Button disabled={!owner} onClick={()=>open(owner,'/fund')}>Điều chỉnh quỹ nhân viên</Button>{rows?.items.length?<div className="table-scroll" tabIndex={0} role="region" aria-label="Bảng dữ liệu có thể cuộn"><table><thead><tr><th>Ngày</th><th>Nhân viên</th><th>Loại</th><th>Nội dung</th><th className="numeric">Số tiền</th></tr></thead><tbody>{rows.items.map((row)=><tr key={`${row.ownerId}:${row.id}`}><td>{day(row.date)}</td><td>{row.ownerName}</td><td>{row.type}</td><td>{row.notes}</td><td className={`numeric ${Number(row.amount)<0?"negative":"positive"}`}>{money(row.amount)}</td></tr>)}</tbody></table></div>:<Empty title="Chưa có bút toán quỹ"/>}{rows&&<Pager page={page} count={rows.total} size={pageSize} onChange={setPage}/>}</Card><ProgramsTable members={members}/></>;
}
function ProgramsTable({ members }: { members: TeamMember[] }) {
  const { notify,setAdminTarget,refresh }=useWorkspace();const [cancelling,setCancelling]=useState<any>(null);const navigate=useNavigate();
  const query=usePagedQuery<any>('/api/admin/programs','programs',{q:'',ownerId:'',status:'all',from:'',to:''});
  const rows=query.data,page=query.page,setPage=query.setPage;
  return <><Card title="Chương trình toàn đội"><AdminQuery query={query} members={members} statuses={{all:'Mọi trạng thái',active:'Đang áp dụng',expired:'Hết hạn',cancelled:'Đã hủy'}}/>{rows?.items.length?<div className="table-scroll" tabIndex={0} role="region" aria-label="Bảng dữ liệu có thể cuộn"><table><thead><tr><th>Chương trình</th><th>Nhân viên</th><th>Trạng thái</th><th className="numeric">Quỹ giữ</th><th>Hết hạn</th><th/></tr></thead><tbody>{rows.items.map((row)=><tr key={`${row.ownerId}:${row.id}`}><td>{row.name}</td><td>{row.ownerName}</td><td><Status value={row.status}/></td><td className="numeric">{money(row.reserved)}</td><td>{day(row.expiresAt)}</td><td><div className="heading-actions">{row.status==='active'&&<Button variant="danger" onClick={()=>setCancelling(row)}>Hủy chương trình</Button>}<Button onClick={()=>{const member=members.find((item)=>item.id===row.ownerId);if(member)setAdminTarget(member);navigate("/programs")}}>Mở và xử lý</Button></div></td></tr>)}</tbody></table></div>:<Empty title="Chưa có chương trình"/>}{rows&&<Pager page={page} count={rows.total} size={pageSize} onChange={setPage}/>}</Card>{cancelling&&<ConfirmActionModal title="Hủy chương trình" confirmLabel="Hủy chương trình" subject={`${cancelling.name} · ${cancelling.ownerName}`} description="Giải phóng ngân sách của các suất chưa áp dụng. Toa đã tạo từ chương trình giữ nguyên." onClose={()=>setCancelling(null)} onConfirm={async(reason,key)=>{const {state}=await request<any>(`/api/admin/workspaces/${cancelling.ownerId}`);await request(`/api/admin/workspaces/${cancelling.ownerId}/commands`,{reason,command:{type:"cancelProgram",payload:{id:cancelling.id},idempotencyKey:key,version:state.version,sharedVersion:state.sharedVersion,inventoryVersion:state.inventoryVersion}});query.reload();await refresh();notify("Đã hủy chương trình và giải phóng ngân sách.");}}/>}</>;
}
function EmployeesAdmin({ members, reloadMembers, reason }: AdminProps) {
  const { notify, setAdminTarget } = useWorkspace(); const [create, setCreate] = useState(false), [edit, setEdit] = useState<EmployeeAccount|null>(null), [reset, setReset] = useState<EmployeeAccount|null>(null), [status, setStatus] = useState("active"), [page, setPage] = useState(1);
  const filtered = members.filter((member) => status === "all" || status === "deleted" ? status === "all" || !!member.deletedAt : status === "active" ? member.active && !member.deletedAt : !member.active && !member.deletedAt);
  const visible = filtered.slice((page - 1) * pageSize, page * pageSize);
  const refs = visible.map((member) => ({ key: `:${member.id}`, id: member.id, label: `${member.displayName} · @${member.username}`, trashed: !!member.deletedAt }));
  const bulk = useBulkActions("users", refs, reason, reloadMembers, `${status}:${page}`);
  const refOf = (member: TeamMember) => refs.find((item) => item.id === member.id)!;
  const action = async (member: TeamMember, kind: "toggle"|"revoke") => { try { requireReason(reason); const path = kind === "revoke" ? `/api/admin/users/${member.id}/revoke-sessions` : `/api/admin/users/${member.id}`; await request(path, kind === "toggle" ? { active: !member.active, reason } : { reason }, kind === "toggle" ? "PATCH" : "POST"); notify("Đã cập nhật tài khoản."); await reloadMembers(); } catch (error) { notify((error as Error).message); } };
  return <><Card title="Tài khoản nhân viên" actions={<Button variant="primary" onClick={() => setCreate(true)}><Plus size={15}/>Tạo nhân viên</Button>}><div className="toolbar"><select aria-label="Trạng thái tài khoản" value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }}><option value="active">Đang hoạt động</option><option value="locked">Đã khoá</option><option value="deleted">Thùng rác</option><option value="all">Tất cả</option></select></div>{bulk.controls}{visible.length ? <div className="table-scroll" tabIndex={0} role="region" aria-label="Bảng dữ liệu có thể cuộn"><table><thead><tr><th className="select-column"><SelectionBox checked={bulk.all} partial={bulk.partial} label="Chọn tất cả tài khoản trên trang" onChange={bulk.toggleAll}/></th><th>Nhân viên</th><th>Vai trò</th><th>Trạng thái</th><th>Lần đăng nhập cuối</th><th/></tr></thead><tbody>{visible.map((member) => <tr key={member.id}><td className="select-column"><SelectionBox checked={bulk.selected.has(`:${member.id}`)} label={`Chọn ${member.displayName}`} onChange={() => bulk.toggle(`:${member.id}`)}/></td><td><strong>{member.displayName}</strong><small>@{member.username} · {member.email}</small></td><td>{member.role}</td><td>{member.deletedAt ? <Badge tone="red">Thùng rác</Badge> : <Badge tone={member.active ? "green" : "amber"}>{member.active ? "Hoạt động" : "Đã khoá"}</Badge>}</td><td>{member.lastLoginAt ? new Date(member.lastLoginAt).toLocaleString("vi-VN") : "Chưa đăng nhập"}</td><td><div className="heading-actions">{member.deletedAt ? <><Button onClick={() => bulk.begin("restore", [refOf(member)])}><Undo2 size={14}/>Khôi phục</Button><Button variant="danger" onClick={() => bulk.begin("purge", [refOf(member)])}>Xoá hẳn</Button></> : <><Button onClick={() => setAdminTarget(member)}>Mở dữ liệu</Button><Button onClick={() => setEdit(member)}><Pencil size={14}/>Sửa</Button><Button onClick={() => void action(member, "toggle")}><LockKeyhole size={14}/>{member.active ? "Khoá" : "Mở"}</Button><Button onClick={() => setReset(member)}><KeyRound size={14}/>Mật khẩu</Button><Button onClick={() => void action(member, "revoke")}>Thu hồi phiên</Button><Button variant="danger" onClick={() => bulk.begin("trash", [refOf(member)])}><Trash2 size={14}/>Xoá</Button></>}</div></td></tr>)}</tbody></table></div> : <Empty title="Chưa có tài khoản phù hợp"/>}<Pager page={page} count={filtered.length} size={pageSize} onChange={setPage}/></Card>{create && <EmployeeModal reason={reason} onClose={() => setCreate(false)} onSaved={async () => { setCreate(false); await reloadMembers(); }}/>} {edit && <EmployeeModal account={edit} reason={reason} onClose={() => setEdit(null)} onSaved={async () => { setEdit(null); await reloadMembers(); }}/>} {reset && <PasswordModal account={reset} reason={reason} onClose={() => setReset(null)}/>}</>;
}
function EmployeeModal({ account, reason, onClose, onSaved }: { account?: EmployeeAccount; reason: string; onClose: () => void; onSaved: () => Promise<void> }) { const { notify } = useWorkspace(); const save = async (e: FormEvent<HTMLFormElement>) => { e.preventDefault(); try { requireReason(reason); const fields = Object.fromEntries(new FormData(e.currentTarget)); await request(account ? `/api/admin/users/${account.id}` : "/api/admin/users", { ...fields, reason }, account ? "PATCH" : "POST"); notify(account ? "Đã cập nhật nhân viên." : "Đã tạo nhân viên."); await onSaved(); } catch (error) { notify((error as Error).message); } }; return <Modal title={account ? "Sửa tài khoản" : "Tạo nhân viên"} onClose={onClose}><form className="form-stack" onSubmit={save}><Field label="Tên hiển thị"><input name="displayName" defaultValue={account?.displayName} required/></Field><Field label="Tên đăng nhập"><input name="username" defaultValue={account?.username} required/></Field><Field label="Email"><input name="email" type="email" defaultValue={account?.email} required/></Field>{!account && <Field label="Mật khẩu tạm"><input name="password" type="password" minLength={10} required/></Field>}<div className="modal-actions"><Button type="button" onClick={onClose}>Huỷ</Button><Button variant="primary">Lưu</Button></div></form></Modal>; }
function PasswordModal({ account, reason, onClose }: { account: EmployeeAccount; reason: string; onClose: () => void }) { const { notify } = useWorkspace(); const save = async (e: FormEvent<HTMLFormElement>) => { e.preventDefault(); try { requireReason(reason); const form = new FormData(e.currentTarget); await request(`/api/admin/users/${account.id}/reset-password`, { password: form.get("password"), reason }); notify("Đã đặt lại mật khẩu."); onClose(); } catch (error) { notify((error as Error).message); } }; return <Modal title={`Đặt lại mật khẩu · ${account.displayName}`} onClose={onClose}><form className="form-stack" onSubmit={save}><Field label="Mật khẩu mới"><input name="password" type="password" minLength={10} required/></Field><div className="modal-actions"><Button type="button" onClick={onClose}>Huỷ</Button><Button variant="primary">Đặt mật khẩu</Button></div></form></Modal>; }

function CatalogsAdmin({ reason }: AdminProps) {
  const { notify } = useWorkspace();
  const [data, setData] = useState<any>(null);
  const [kind, setKind] = useState("districts");
  const [values, setValues] = useState<string[]>([]);
  const [entryStatus,setEntryStatus]=useState<Record<string,boolean>>({});
  const [renaming, setRenaming] = useState<string | null>(null);
  const load = async () => {
    try {
      const next = await request<any>("/api/admin/catalogs");
      setData(next);
      setValues([...(next.catalogs[kind] ?? [])]);
    } catch (error) { notify((error as Error).message); }
  };
  useEffect(() => { void load(); }, []);
  useEffect(() => { if (data) {setValues([...(data.catalogs[kind] ?? [])]);setEntryStatus(Object.fromEntries(data.entries.filter((entry:any)=>entry.kind===kind).map((entry:any)=>[entry.value,entry.active!==false])));} }, [kind, data]);
  const usageOf = (value: string) => data?.entries?.find((entry: any) => entry.kind === kind && entry.value === value)?.usage ?? 0;
  const save = async () => {
    try {
      requireReason(reason);
      await request(`/api/admin/catalogs/${kind}`, { values: values.map((value) => value.trim()).filter(Boolean), entryStatus, reason, idempotencyKey: crypto.randomUUID() }, "PUT");
      notify("Đã cập nhật danh mục."); await load();
    } catch (error) { notify((error as Error).message); }
  };
  const rename = async (oldValue: string, newValue: string) => {
    requireReason(reason);
    if (!newValue || newValue === oldValue) return;
    if (!(data.catalogs[kind]??[]).includes(oldValue)) {
      if(values.includes(newValue))throw new Error('Tên đã tồn tại');
      setValues(current=>current.map(value=>value===oldValue?newValue:value));return;
    }
    await request(`/api/admin/catalogs/${kind}/rename`, { oldValue, newValue, reason, idempotencyKey: crypto.randomUUID() });
    setValues(current=>current.map(value=>value===oldValue?newValue:value));
    setEntryStatus(current=>({...current,[newValue]:current[oldValue]??true}));
    data.catalogs[kind]=data.catalogs[kind].map((value:string)=>value===oldValue?newValue:value);
    data.entries=data.entries.map((entry:any)=>entry.kind===kind&&entry.value===oldValue?{...entry,value:newValue}:entry);
    notify("Đã đổi tên và cập nhật nơi đang sử dụng.");
  };
  const move = (index: number, delta: number) => setValues((current) => {
    const target = index + delta; if (target < 0 || target >= current.length) return current;
    const next = [...current]; [next[index], next[target]] = [next[target], next[index]]; return next;
  });
  const labels: Record<string,string> = { districts: "Huyện / khu vực", visitDays: "Lịch ghé", storeTypes: "Loại cửa hiệu", routes: "Tuyến", brands: "Nhãn hiệu", groups: "Nhóm hàng", units: "Đơn vị", frequencies: "Tần suất" };
  return <><Card title="Danh mục dùng chung" subtitle="Quản lý từng mục, thứ tự hiển thị và nơi đang sử dụng.">
    <div className="toolbar"><Field label="Loại danh mục"><select value={kind} onChange={(event) => setKind(event.target.value)}>{Object.entries(labels).map(([key,label]) => <option key={key} value={key}>{label}</option>)}</select></Field><Button disabled={kind==='visitDays'} onClick={() => setValues((current) => [...current, `Mục mới ${current.length + 1}`])}><Plus size={15}/>Thêm mục</Button></div>
    <div className="catalog-editor">{values.map((value,index) => <div className="catalog-row" key={`${value}:${index}`}><span className="catalog-position">{index + 1}</span><strong>{value}</strong><Badge tone={usageOf(value) ? "blue" : "muted"}>{usageOf(value)} nơi dùng</Badge><Button aria-label={`Đưa ${value} lên`} disabled={kind==="visitDays"||index===0} onClick={() => move(index,-1)}><ArrowUp size={14}/></Button><Button aria-label={`Đưa ${value} xuống`} disabled={kind==="visitDays"||index===values.length-1} onClick={() => move(index,1)}><ArrowDown size={14}/></Button><label className="checkbox-row"><input type="checkbox" aria-label={`Sử dụng ${value}`} disabled={kind==='visitDays'} checked={entryStatus[value]!==false} onChange={event=>setEntryStatus(current=>({...current,[value]:event.target.checked}))}/>Đang dùng</label><Button disabled={kind==='visitDays'} onClick={() => setRenaming(value)}><Pencil size={14}/>Đổi tên</Button><Button variant="danger" disabled={kind==='visitDays'||usageOf(value)>0} title={usageOf(value)>0?"Mục đang được sử dụng":""} onClick={() => setValues((current) => current.filter((_,position)=>position!==index))}><Trash2 size={14}/>Xóa</Button></div>)}</div>
    <div className="modal-actions"><Button variant="primary" onClick={() => void save()}>Lưu danh mục</Button></div>
  </Card>{renaming && <TextActionModal title="Đổi tên mục danh mục" label="Tên mới" initialValue={renaming} required onClose={() => setRenaming(null)} onConfirm={(value) => rename(renaming,value)}/>}</>;
}
function ImportsAdmin(_: AdminProps) {
  const navigate=useNavigate();const [detail,setDetail]=useState<any>(null);
  const query=usePagedQuery<any>('/api/admin/imports','imports',{q:'',status:'all',from:'',to:''});
  const rows=query.data,page=query.page,setPage=query.setPage;
  return <><Card title="Lịch sử nhập dữ liệu" actions={<Button variant="primary" onClick={()=>navigate("/imports")}><Database size={15}/>Nhập dữ liệu</Button>}><AdminQuery query={query} statuses={{all:'Mọi trạng thái',previewed:'Đã xem trước',committed:'Đã nhập',failed:'Lỗi'}}/>{rows?.items?.length?<div className="table-scroll" tabIndex={0} role="region" aria-label="Bảng dữ liệu có thể cuộn"><table><thead><tr><th>Thời điểm</th><th>Tệp</th><th>Loại</th><th>Trạng thái</th><th>Kết quả</th><th/></tr></thead><tbody>{rows.items.map((row)=><tr key={row.id}><td>{new Date(row.created_at).toLocaleString("vi-VN")}</td><td>{row.filename}</td><td>{row.kind}</td><td><Badge tone={row.status==="failed"?"red":row.status==="committed"?"green":"amber"}>{row.status}</Badge></td><td>{row.error_message||JSON.stringify(row.summary)}</td><td><Button onClick={()=>setDetail(row)}>Chi tiết</Button></td></tr>)}</tbody></table></div>:<Empty title="Chưa có lần nhập dữ liệu"/>}{rows&&<Pager page={page} count={rows.total} size={pageSize} onChange={setPage}/>}</Card>{detail&&<Modal title={`Chi tiết nhập · ${detail.filename}`} onClose={()=>setDetail(null)} wide><div className="audit-detail"><p><strong>Trạng thái:</strong> {detail.status}</p>{detail.error_message&&<Notice type="error">{detail.error_message}</Notice>}<pre>{JSON.stringify(detail.summary,null,2)}</pre></div></Modal>}</>;
}
function AuditAdmin({ members }: AdminProps) { const [detail,setDetail]=useState<any>(null);const query=usePagedQuery<any>('/api/admin/audit','audit',{q:'',actorId:'',from:'',to:'',action:'',objectType:''});const rows=query.data,page=query.page,setPage=query.setPage;const exportCsv = () => { if (!rows) return; download("nhat-ky-quan-tri.csv", ["Thời điểm,Người thao tác,Hành động,Lý do,Đối tượng", ...rows.items.map((x: any) => [x.created_at, x.actor_name, x.action, x.reason, x.object_id || x.target_name].map(csvCell).join(","))].join("\n"), "text/csv;charset=utf-8"); }; return <><Card title="Nhật ký quản trị" actions={<Button onClick={exportCsv}><Download size={15}/>Xuất CSV</Button>}><AdminQuery query={query}/><div className="toolbar"><Field label="Người thao tác"><select value={query.draft.actorId} onChange={event=>query.setDraft(current=>({...current,actorId:event.target.value}))}><option value="">Tất cả</option>{members.map(member=><option key={member.id} value={member.id}>{member.displayName}</option>)}</select></Field><Field label="Hành động"><input value={query.draft.action} onChange={event=>query.setDraft(current=>({...current,action:event.target.value}))}/></Field><Field label="Loại đối tượng"><input value={query.draft.objectType} onChange={event=>query.setDraft(current=>({...current,objectType:event.target.value}))}/></Field></div>{rows?.items?.length ? <div className="table-scroll" tabIndex={0} role="region" aria-label="Bảng dữ liệu có thể cuộn"><table><thead><tr><th>Thời điểm</th><th>Người thao tác</th><th>Hành động</th><th>Lý do</th><th>Đối tượng</th><th/></tr></thead><tbody>{rows.items.map((row: any) => <tr key={row.id}><td>{new Date(row.created_at).toLocaleString("vi-VN")}</td><td>{row.actor_name}</td><td><strong>{row.action}</strong></td><td>{row.reason}</td><td>{row.object_id || row.target_name}</td><td><Button onClick={() => setDetail(row)}>Chi tiết</Button></td></tr>)}</tbody></table></div> : <Empty title="Chưa có nhật ký phù hợp"/>}{rows && <Pager page={page} count={rows.total} size={pageSize} onChange={setPage}/>}</Card>{detail && <Modal title="Chi tiết thay đổi" onClose={() => setDetail(null)} wide><div className="audit-detail"><p><strong>Hành động:</strong> {detail.action}</p><p><strong>Lý do:</strong> {detail.reason}</p><h3>Trước thay đổi</h3><pre>{JSON.stringify(detail.before_data ?? detail.details, null, 2)}</pre><h3>Sau thay đổi</h3><pre>{JSON.stringify(detail.after_data, null, 2)}</pre></div></Modal>}</>; }

function SystemAdmin(_: AdminProps) { const { notify } = useWorkspace(); const [data, setData] = useState<any>(null); const load = () => request<any>("/api/admin/system/health").then(setData).catch((e) => notify(e.message)); useEffect(() => void load(), []); return <><Card title="Trạng thái hệ thống" actions={<Button onClick={load}><Activity size={15}/>Kiểm tra lại</Button>}>{data ? <div className="health-grid"><div><span>API</span><Badge tone={data.api === "ok" ? "green" : "red"}>{data.api}</Badge></div><div><span>Cơ sở dữ liệu</span><Badge tone={data.database === "ok" ? "green" : "red"}>{data.database}</Badge></div><div><span>Độ trễ DB</span><strong>{data.latencyMs} ms</strong></div><div><span>Phiên bản triển khai</span><code>{data.deployment}</code></div><div><span>Runtime</span><code>{data.runtime}</code></div><div><span>Đăng ký công khai</span><Badge tone="green">Đã tắt</Badge></div></div> : <div className="loading-row">Đang kiểm tra…</div>}</Card><Notice>Thông tin bí mật, mật khẩu và khóa Supabase không bao giờ được trả về màn hình này. Sao lưu và khôi phục được thực hiện trong Supabase theo quy trình vận hành có kiểm tra.</Notice></>; }
