import { useEffect, useMemo, useState, type FormEvent } from "react";
import {
  Download,
  KeyRound,
  LockKeyhole,
  Plus,
  RefreshCw,
  ShieldCheck,
  Trash2,
  UnlockKeyhole,
  Users,
} from "lucide-react";
import type { EmployeeAccount, TeamMember } from "../../shared/types";
import type { Catalogs } from "../../shared/catalogs";
import { request, useWorkspace } from "../api";
import {
  Badge,
  Button,
  Card,
  DateRange,
  Empty,
  Field,
  Heading,
  Modal,
  Notice,
  SearchBox,
  money,
  today,
} from "../ui";

type Audit = {
  id: string;
  actor_id: string;
  target_user_id: string | null;
  action: string;
  reason: string;
  details: Record<string, unknown>;
  created_at: string;
};
export function AdminConsole() {
  const { state, command, adminTarget, setAdminTarget, adminReason, notify } =
    useWorkspace();
  const [members, setMembers] = useState<TeamMember[]>([]),
    [audit, setAudit] = useState<Audit[]>([]),
    [q, setQ] = useState(""),
    [from, setFrom] = useState(new Date().toISOString().slice(0, 7) + "-01"),
    [to, setTo] = useState(today()),
    [busy, setBusy] = useState(false),
    [create, setCreate] = useState(false),
    [reset, setReset] = useState<EmployeeAccount | null>(null),
    [prices, setPrices] = useState(false),
    [catalogsEditor, setCatalogsEditor] = useState(false),
    [selected, setSelected] = useState<string[]>([]);
  const load = async () => {
    setBusy(true);
    try {
      const [teamData, auditData] = await Promise.all([
        request<{ members: TeamMember[] }>(
          `/api/admin/team?from=${from}&to=${to}`,
        ),
        request<{ entries: Audit[] }>("/api/admin/audit?limit=30"),
      ]);
      setMembers(teamData.members);
      setAudit(auditData.entries);
    } catch (e) {
      notify((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  useEffect(() => {
    void load();
  }, [from, to]);
  const rows = useMemo(
    () =>
      members.filter((m) =>
        [m.displayName, m.username, m.email]
          .join(" ")
          .toLowerCase()
          .includes(q.toLowerCase()),
      ),
    [members, q],
  );
  const total = useMemo(
    () =>
      rows.reduce(
        (x, m) => ({
          ordered: x.ordered + Number(m.summary.ordered),
          delivered: x.delivered + Number(m.summary.delivered),
          fund: x.fund + Number(m.summary.fund),
          available: x.available + Number(m.summary.available),
        }),
        { ordered: 0, delivered: 0, fund: 0, available: 0 },
      ),
    [rows],
  );
  const reason = () => {
    if (adminReason.trim().length < 3)
      throw new Error(
        "Nhập lý do quản trị ở thanh phía trên trước khi thao tác",
      );
  };
  const select = (member: TeamMember) => {
    setAdminTarget({
      id: member.id,
      email: member.email,
      username: member.username,
      displayName: member.displayName,
      role: member.role,
      active: member.active,
      createdAt: member.createdAt,
      updatedAt: member.updatedAt,
    });
    notify(`Đã mở dữ liệu của ${member.displayName}.`);
  };
  const status = async (member: TeamMember) => {
    try {
      reason();
      setBusy(true);
      await request(
        `/api/admin/users/${member.id}`,
        { active: !member.active, reason: adminReason },
        "PATCH",
      );
      await load();
      notify(member.active ? "Đã khóa tài khoản." : "Đã mở lại tài khoản.");
    } catch (e) {
      notify((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const remove = async (member: TeamMember) => {
    if (
      !confirm(
        `Xóa tài khoản ${member.displayName} và toàn bộ dữ liệu liên quan?`,
      )
    )
      return;
    try {
      reason();
      setBusy(true);
      await request(
        `/api/admin/users/${member.id}`,
        { reason: adminReason },
        "DELETE",
      );
      if (adminTarget?.id === member.id) setAdminTarget(null);
      await load();
      notify("Đã xóa tài khoản.");
    } catch (e) {
      notify((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const exportTeam = () => {
    const csv = [
      "Nhân viên,Email,Trạng thái,Doanh số đặt,Thực giao,Quỹ,Quỹ khả dụng",
      ...rows.map((m) =>
        [
          m.displayName,
          m.email,
          m.active ? "Hoạt động" : "Đã khóa",
          m.summary.ordered,
          m.summary.delivered,
          m.summary.fund,
          m.summary.available,
        ]
          .map((v) => `"${String(v).replaceAll('"', '""')}"`)
          .join(","),
      ),
    ].join("\n");
    const url = URL.createObjectURL(
      new Blob([csv], { type: "text/csv;charset=utf-8" }),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = `truecare-toan-doi-${from}-${to}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };
  return (
    <>
      <Heading
        eyebrow="ADMIN CONSOLE"
        title="Quản trị hệ thống"
        description="Quản lý nhân viên, dữ liệu thực giao, quỹ dư và bảng giá toàn đội."
        actions={
          <>
            <Button onClick={() => void load()} busy={busy}>
              <RefreshCw size={16} />
              Tải lại
            </Button>
            <Button onClick={exportTeam}>
              <Download size={16} />
              Xuất CSV
            </Button>
            <Button onClick={() => setCatalogsEditor(true)}>
              Danh mục dùng chung
            </Button>
            <Button variant="primary" onClick={() => setCreate(true)}>
              <Plus size={16} />
              Tạo nhân viên
            </Button>
          </>
        }
      />
      <Notice type="info">
        Mọi chỉnh sửa trên dữ liệu nhân viên yêu cầu lý do ở thanh quản trị và
        được ghi vào nhật ký bất biến.
      </Notice>
      <div className="stats-grid">
        <div className="stat">
          <span className="stat-label">Nhân viên hiển thị</span>
          <strong>{rows.length}</strong>
        </div>
        <div className="stat">
          <span className="stat-label">Doanh số đặt</span>
          <strong>{money(total.ordered)}</strong>
        </div>
        <div className="stat">
          <span className="stat-label">Thực giao</span>
          <strong>{money(total.delivered)}</strong>
        </div>
        <div className="stat">
          <span className="stat-label">Quỹ khả dụng</span>
          <strong className={total.available < 0 ? "negative" : ""}>
            {money(total.available)}
          </strong>
        </div>
      </div>
      <Card title="Bộ lọc báo cáo">
        <div className="toolbar">
          <DateRange from={from} to={to} setFrom={setFrom} setTo={setTo} />
          <SearchBox
            value={q}
            onChange={setQ}
            placeholder="Tìm nhân viên, username, email…"
          />
          <Button onClick={() => setPrices(true)} disabled={!selected.length}>
            Cập nhật giá ({selected.length})
          </Button>
        </div>
      </Card>
      <Card
        title="Toàn đội"
        subtitle="Chọn một nhân viên để xem và chỉnh sửa toàn bộ workspace của họ."
      >
        {rows.length ? (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th />
                  <th>Nhân viên</th>
                  <th>Trạng thái</th>
                  <th className="numeric">Đặt hàng</th>
                  <th className="numeric">Thực giao</th>
                  <th className="numeric">Quỹ</th>
                  <th className="numeric">Khả dụng</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {rows.map((member) => (
                  <tr key={member.id}>
                    <td>
                      <input
                        aria-label={`Chọn ${member.displayName}`}
                        type="checkbox"
                        checked={selected.includes(member.id)}
                        onChange={(e) =>
                          setSelected((x) =>
                            e.target.checked
                              ? [...x, member.id]
                              : x.filter((id) => id !== member.id),
                          )
                        }
                      />
                    </td>
                    <td>
                      <strong>{member.displayName}</strong>
                      <small>
                        @{member.username} · {member.email}
                      </small>
                    </td>
                    <td>
                      <Badge tone={member.active ? "green" : "red"}>
                        {member.active ? "Hoạt động" : "Đã khóa"}
                      </Badge>
                    </td>
                    <td className="numeric">{money(member.summary.ordered)}</td>
                    <td className="numeric">
                      {money(member.summary.delivered)}
                    </td>
                    <td className="numeric">{money(member.summary.fund)}</td>
                    <td
                      className={`numeric ${Number(member.summary.available) < 0 ? "negative" : ""}`}
                    >
                      {money(member.summary.available)}
                    </td>
                    <td>
                      <div className="heading-actions">
                        <Button onClick={() => select(member)}>
                          Mở dữ liệu
                        </Button>
                        <Button onClick={() => void status(member)}>
                          {member.active ? (
                            <LockKeyhole size={15} />
                          ) : (
                            <UnlockKeyhole size={15} />
                          )}
                          {member.active ? "Khóa" : "Mở"}
                        </Button>
                        <Button onClick={() => setReset(member)}>
                          <KeyRound size={15} />
                          Reset
                        </Button>
                        <Button
                          variant="danger"
                          onClick={() => void remove(member)}
                        >
                          <Trash2 size={15} />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <Empty
            title="Chưa có nhân viên"
            description="Tạo tài khoản nhân viên đầu tiên."
          />
        )}
      </Card>
      <Card
        title={
          "Thùng tạm giữ" + (adminTarget ? " · " + adminTarget.displayName : "")
        }
        subtitle="Khôi phục sẽ kiểm tra lại tồn kho và ngân sách. Xoá hoàn toàn không đảo số liệu lần thứ hai."
      >
        {state.orders.some((order) => order.deletedAt && !order.purgedAt) ? (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Toa</th>
                  <th>Ngày xoá</th>
                  <th>Lý do</th>
                  <th className="numeric">Tiền đã thu còn treo</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {state.orders
                  .filter((order) => order.deletedAt && !order.purgedAt)
                  .map((order) => (
                    <tr key={order.id}>
                      <td>
                        <strong>{order.code}</strong>
                        <small>
                          {order.statusBeforeDelete ?? order.status}
                        </small>
                      </td>
                      <td>
                        {new Date(order.deletedAt!).toLocaleString("vi-VN")}
                      </td>
                      <td>{order.deletionReason}</td>
                      <td className="numeric">
                        {money(
                          state.payments
                            .filter((payment) => payment.orderId === order.id)
                            .reduce(
                              (sum, payment) => sum + Number(payment.amount),
                              0,
                            ),
                        )}
                      </td>
                      <td>
                        <div className="heading-actions">
                          <Button
                            onClick={async () => {
                              try {
                                reason();
                                await command("restoreOrder", {
                                  id: order.id,
                                  reason: adminReason,
                                });
                                notify("Đã khôi phục toa và áp lại số liệu.");
                              } catch (error) {
                                notify((error as Error).message);
                              }
                            }}
                          >
                            Khôi phục
                          </Button>
                          <Button
                            variant="danger"
                            onClick={async () => {
                              if (
                                !confirm(
                                  "Xoá hoàn toàn " +
                                    order.code +
                                    "? Dấu vết kiểm toán vẫn được giữ.",
                                )
                              )
                                return;
                              try {
                                reason();
                                await command("purgeOrder", {
                                  id: order.id,
                                  reason: adminReason,
                                });
                                notify(
                                  "Đã xoá nội dung toa khỏi thùng tạm giữ.",
                                );
                              } catch (error) {
                                notify((error as Error).message);
                              }
                            }}
                          >
                            Xoá hoàn toàn
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        ) : (
          <Empty title="Thùng tạm giữ đang trống" />
        )}
      </Card>
      <Card
        title="Nhật ký quản trị"
        subtitle="Mật khẩu không bao giờ xuất hiện trong nhật ký."
      >
        {audit.length ? (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Thời điểm</th>
                  <th>Thao tác</th>
                  <th>Lý do</th>
                  <th>Đối tượng</th>
                </tr>
              </thead>
              <tbody>
                {audit.map((entry) => (
                  <tr key={entry.id}>
                    <td>
                      {new Date(entry.created_at).toLocaleString("vi-VN")}
                    </td>
                    <td>
                      <strong>{entry.action}</strong>
                    </td>
                    <td>{entry.reason}</td>
                    <td>
                      <small>{entry.target_user_id || "Hệ thống"}</small>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <Empty title="Chưa có thao tác quản trị" />
        )}
      </Card>
      {create && (
        <CreateEmployee
          onClose={() => setCreate(false)}
          onSaved={async () => {
            setCreate(false);
            await load();
          }}
        />
      )}
      {reset && (
        <ResetPassword
          account={reset}
          onClose={() => setReset(null)}
          onSaved={() => {
            setReset(null);
            notify("Đã đặt lại mật khẩu.");
          }}
        />
      )}
      {prices && (
        <BulkPrice
          userIds={selected}
          members={members}
          onClose={() => setPrices(false)}
          onSaved={async () => {
            setPrices(false);
            await load();
            notify("Đã cập nhật bảng giá.");
          }}
        />
      )}
      {catalogsEditor && state.catalogs && (
        <CatalogEditor
          catalogs={state.catalogs}
          onClose={() => setCatalogsEditor(false)}
          onSaved={() => {
            setCatalogsEditor(false);
            notify("Đã cập nhật danh mục dùng chung.");
          }}
        />
      )}
    </>
  );
}
function CatalogEditor({
  catalogs,
  onClose,
  onSaved,
}: {
  catalogs: Catalogs;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { command, busy, notify } = useWorkspace();
  const fields: [keyof Catalogs, string][] = [
    ["districts", "Huyện / khu vực"],
    ["visitDays", "Thứ đi tuyến (đúng 6 dòng, Thứ Hai đến Thứ Bảy)"],
    ["storeTypes", "Loại cửa hiệu"],
    ["routes", "Tuyến bán hàng"],
    ["brands", "Nhãn hiệu"],
    ["groups", "Nhóm hàng"],
    ["units", "Đơn vị bán"],
    ["frequencies", "Tần suất ghé"],
  ];
  const save = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    try {
      const form = new FormData(event.currentTarget);
      const payload = Object.fromEntries(
        fields.map(([key]) => [
          key,
          String(form.get(key) ?? "")
            .split("\n")
            .map((value) => value.trim())
            .filter(Boolean),
        ]),
      );
      await command("saveCatalog", {
        ...payload,
        reason: form.get("reason"),
      });
      onSaved();
    } catch (error) {
      notify((error as Error).message);
    }
  };
  return (
    <Modal title="Danh mục dùng chung toàn đội" onClose={onClose} wide>
      <form className="form-stack" onSubmit={save}>
        <Notice>
          Mỗi dòng là một lựa chọn. Thay đổi áp dụng cho mọi nhân viên và được
          kiểm tra phiên bản để tránh ghi đè.
        </Notice>
        <Field label="Lý do thay đổi">
          <textarea name="reason" required />
        </Field>
        <div className="form-grid">
          {fields.map(([key, label]) => (
            <Field key={key} label={label}>
              <textarea
                name={key}
                rows={5}
                defaultValue={catalogs[key].join("\n")}
              />
            </Field>
          ))}
        </div>
        <div className="modal-actions">
          <Button type="button" onClick={onClose}>
            Huỷ
          </Button>
          <Button variant="primary" busy={busy}>
            Lưu danh mục
          </Button>
        </div>
      </form>
    </Modal>
  );
}
function CreateEmployee({
  onClose,
  onSaved,
}: {
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const { adminReason, notify, busy } = useWorkspace();
  const save = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    try {
      const f = new FormData(e.currentTarget);
      await request("/api/admin/users", {
        email: f.get("email"),
        username: f.get("username"),
        displayName: f.get("displayName"),
        password: f.get("password"),
        reason: adminReason,
      });
      await onSaved();
      notify("Đã tạo tài khoản nhân viên.");
    } catch (x) {
      notify((x as Error).message);
    }
  };
  return (
    <Modal title="Tạo tài khoản nhân viên" onClose={onClose}>
      <form className="form-stack" onSubmit={save}>
        <Notice>
          Nhập lý do quản trị ở thanh trên trước khi lưu. Mật khẩu tối thiểu 10
          ký tự.
        </Notice>
        <Field label="Tên hiển thị">
          <input name="displayName" required />
        </Field>
        <Field label="Tên đăng nhập">
          <input name="username" required autoComplete="off" />
        </Field>
        <Field label="Email">
          <input name="email" type="email" required />
        </Field>
        <Field label="Mật khẩu tạm">
          <input
            name="password"
            type="password"
            minLength={10}
            required
            autoComplete="new-password"
          />
        </Field>
        <div className="modal-actions">
          <Button type="button" onClick={onClose}>
            Hủy
          </Button>
          <Button variant="primary" busy={busy}>
            Tạo tài khoản
          </Button>
        </div>
      </form>
    </Modal>
  );
}
function ResetPassword({
  account,
  onClose,
  onSaved,
}: {
  account: EmployeeAccount;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { adminReason, notify, busy } = useWorkspace();
  const save = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    try {
      const f = new FormData(e.currentTarget);
      await request(`/api/admin/users/${account.id}/reset-password`, {
        password: f.get("password"),
        reason: adminReason,
      });
      onSaved();
    } catch (x) {
      notify((x as Error).message);
    }
  };
  return (
    <Modal title={`Đặt lại mật khẩu: ${account.displayName}`} onClose={onClose}>
      <form className="form-stack" onSubmit={save}>
        <Field label="Mật khẩu mới">
          <input
            name="password"
            type="password"
            minLength={10}
            required
            autoComplete="new-password"
          />
        </Field>
        <div className="modal-actions">
          <Button type="button" onClick={onClose}>
            Hủy
          </Button>
          <Button variant="primary" busy={busy}>
            Đặt lại
          </Button>
        </div>
      </form>
    </Modal>
  );
}
function BulkPrice({
  userIds,
  members,
  onClose,
  onSaved,
}: {
  userIds: string[];
  members: TeamMember[];
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const { adminReason, notify, busy } = useWorkspace();
  const save = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    try {
      const f = new FormData(e.currentTarget);
      const patch: any = {};
      for (const key of ["cost", "price", "pack", "effectiveDate"])
        if (f.get(key) !== "")
          patch[key] = key === "pack" ? Number(f.get(key)) : f.get(key);
      await request("/api/admin/catalog/bulk-price", {
        userIds,
        match: { code: f.get("code") },
        patch,
        reason: adminReason,
      });
      await onSaved();
    } catch (x) {
      notify((x as Error).message);
    }
  };
  return (
    <Modal title="Cập nhật bảng giá hàng loạt" onClose={onClose}>
      <form className="form-stack" onSubmit={save}>
        <Notice>
          Áp dụng cho {userIds.length} nhân viên:{" "}
          {members
            .filter((m) => userIds.includes(m.id))
            .map((m) => m.displayName)
            .join(", ")}
          . Mã sản phẩm phải khớp duy nhất trong từng workspace.
        </Notice>
        <Field label="Mã sản phẩm">
          <input name="code" required />
        </Field>
        <div className="form-grid">
          <Field label="Giá vốn mới">
            <input name="cost" type="number" min="0" />
          </Field>
          <Field label="Giá chào mới">
            <input name="price" type="number" min="0" />
          </Field>
          <Field label="Quy cách mới">
            <input name="pack" type="number" min="1" />
          </Field>
          <Field label="Ngày hiệu lực">
            <input name="effectiveDate" type="date" />
          </Field>
        </div>
        <div className="modal-actions">
          <Button type="button" onClick={onClose}>
            Hủy
          </Button>
          <Button variant="primary" busy={busy}>
            Xác nhận cập nhật
          </Button>
        </div>
      </form>
    </Modal>
  );
}
