import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ChevronRight, Filter, RotateCcw } from '../icons';
import type { ReportMode, ReportRow } from "../lib/reporting";
import {
  dimensionLabels,
  exportSalesCsv,
  groupRows,
  reportRows,
  reportTotals,
} from "../lib/reporting";
import { request, useWorkspace } from "../api";
import {
  Badge,
  Button,
  Card,
  DateRange,
  Empty,
  Heading,
  Modal,
  SearchBox,
  day,
  download,
  money,
  today,
} from "../ui";

type HptSaleOutReport = {
  source: "HPT DMS";
  from: string;
  to: string;
  retrievedAt: string;
  quantity: number;
  total: string;
  rows: { date: string; customer: string; amount: string }[];
};

export function SalesReport({ mode }: { mode: ReportMode }) {
  const { state, user, adminTarget } = useWorkspace();
  const initial = {
    from: state.settings.periodStart,
    to: today(),
    query: "",
    subtractDiscount: true,
  };
  const [draft, setDraft] = useState(initial);
  const [applied, setApplied] = useState(initial);
  const [groups, setGroups] = useState<string[]>(["date"]);
  const [detail, setDetail] = useState<ReportRow[] | null>(null);
  const [hpt, setHpt] = useState<HptSaleOutReport | null>(null);
  const [hptError, setHptError] = useState("");
  const [hptLoading, setHptLoading] = useState(false);
  const rows = useMemo(
    () => reportRows(state, mode, applied),
    [state, mode, applied],
  );
  const total = reportTotals(rows);
  const grouped = useMemo(() => groupRows(rows, groups), [rows, groups]);
  const reset = () => {
    setDraft(initial);
    setApplied(initial);
  };
  const loadHpt = async () => {
    setHptLoading(true);
    setHptError("");
    try {
      setHpt(
        await request<HptSaleOutReport>(
          `/api/integrations/hpt/sale-out?from=${encodeURIComponent(applied.from)}&to=${encodeURIComponent(applied.to)}`,
        ),
      );
    } catch (error) {
      setHpt(null);
      setHptError((error as Error).message);
    } finally {
      setHptLoading(false);
    }
  };
  const addGroup = (value: string) =>
    setGroups((old) => (old.includes(value) ? old : [...old, value]));
  return (
    <>
      <Heading
        title={mode === "ordered" ? "Doanh số bán hàng" : "Doanh số thực giao"}
        description={
          mode === "ordered"
            ? "Theo ngày khách đặt; phần thực giao không bị cộng lặp."
            : "Theo ngày thực giao; KPI theo giá gốc và quỹ theo chênh lệch thực tế."
        }
        actions={
          <Button
            onClick={() =>
              download(
                `${mode}-${applied.from}-${applied.to}.csv`,
                exportSalesCsv(rows),
                "text/csv;charset=utf-8",
              )
            }
          >
            Xuất CSV
          </Button>
        }
      />
      <Card
        title="Bộ lọc báo cáo"
        subtitle="Chỉnh bộ lọc rồi chọn Áp dụng để giữ nguyên kết quả đang xem."
      >
        <div className="toolbar">
          <DateRange
            from={draft.from}
            to={draft.to}
            setFrom={(from) => setDraft((x) => ({ ...x, from }))}
            setTo={(to) => setDraft((x) => ({ ...x, to }))}
          />
          <SearchBox
            value={draft.query}
            onChange={(query) => setDraft((x) => ({ ...x, query }))}
            placeholder="Khách hàng, sản phẩm, địa chỉ…"
          />
          {mode === "delivered" && (
            <label className="check-label">
              <input
                type="checkbox"
                checked={draft.subtractDiscount}
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    subtractDiscount: event.target.checked,
                  }))
                }
              />
              Trừ chiết khấu
            </label>
          )}
          <Button variant="primary" onClick={() => setApplied(draft)}>
            <Filter size={16} />
            Áp dụng
          </Button>
          <Button onClick={reset}>
            <RotateCcw size={16} />
            Đặt lại
          </Button>
        </div>
        <div className="stats-inline">
          {mode === "delivered" && (
            <span>
              Tiền hàng:{" "}
              {applied.subtractDiscount ? "đã trừ CK" : "chưa trừ CK"}
            </span>
          )}
          <span>
            Tiền hàng <strong>{money(total.revenue)}</strong>
          </span>
          <span>
            {mode === "delivered" ? "KPI " : "Quỹ "}
            {mode === "delivered" && total.employeeSales !== null ? (
              <strong>{money(total.employeeSales)}</strong>
            ) : total.margin === null ? (
              <Badge tone="amber">Chưa đủ căn cứ</Badge>
            ) : (
              <strong
                className={Number(total.margin) < 0 ? "negative" : "positive"}
              >
                {money(total.margin)}
              </strong>
            )}
          </span>
          {mode === "delivered" && (
            <span>
              Quỹ{" "}
              {total.margin === null ? (
                <Badge tone="amber">Chưa đủ căn cứ</Badge>
              ) : (
                <strong
                  className={Number(total.margin) < 0 ? "negative" : "positive"}
                >
                  {money(total.margin)}
                </strong>
              )}
            </span>
          )}
          <span>
            {total.orders} toa · {rows.length} dòng
          </span>
        </div>
      </Card>
      {mode === "delivered" && user.role === "admin" && !adminTarget && (
        <Card
          title="Đối chiếu thực giao HPT DMS"
          subtitle="Đọc báo cáo HPT theo ngày và khách hàng. Dữ liệu này không tự chốt toa, không thay KPI hoặc quỹ trong TrueCare."
          actions={
            <Button onClick={() => void loadHpt()} disabled={hptLoading}>
              {hptLoading ? "Đang tải HPT…" : "Tải dữ liệu HPT"}
            </Button>
          }
        >
          {hptError ? (
            <Badge tone="amber">{hptError}</Badge>
          ) : hpt ? (
            <>
              <div className="stats-inline">
                <span>Khoảng HPT <strong>{day(hpt.from)} – {day(hpt.to)}</strong></span>
                <span>Số lượng HPT <strong>{hpt.quantity}</strong></span>
                <span>Thực giao HPT <strong>{money(hpt.total)}</strong></span>
                <span>TrueCare <strong>{money(total.revenue)}</strong></span>
                <span>
                  Chênh lệch{" "}
                  <strong className={BigInt(hpt.total) - BigInt(total.revenue) < 0n ? "negative" : "positive"}>
                    {money((BigInt(hpt.total) - BigInt(total.revenue)).toString())}
                  </strong>
                </span>
              </div>
              <div className="table-scroll" tabIndex={0} role="region" aria-label="Dữ liệu thực giao từ HPT DMS">
                <table>
                  <thead><tr><th>Ngày</th><th>Khách hàng HPT</th><th className="numeric">Thực giao</th></tr></thead>
                  <tbody>{hpt.rows.map((row, index) => <tr key={`${row.date}-${row.customer}-${index}`}><td>{day(row.date)}</td><td>{row.customer}</td><td className="numeric">{money(row.amount)}</td></tr>)}</tbody>
                </table>
              </div>
            </>
          ) : (
            <p className="muted">Tải dữ liệu để so sánh báo cáo HPT với các phiếu thực giao đã ghi trong TrueCare.</p>
          )}
        </Card>
      )}
      <div className="report-layout">
        <Card
          title="Nhóm kết quả"
          subtitle="Chỉ thay cách xem, không thay tổng số."
        >
          <div className="group-picker">
            <div>
              <small>Đang nhóm</small>
              {groups.map((key, index) => (
                <div className="group-token" key={key}>
                  {dimensionLabels[key]}
                  <button
                    aria-label={`Bỏ nhóm ${dimensionLabels[key]}`}
                    onClick={() => setGroups(groups.filter((x) => x !== key))}
                  >
                    ×
                  </button>
                  {index > 0 && (
                    <button
                      aria-label={`Đưa ${dimensionLabels[key]} lên`}
                      onClick={() =>
                        setGroups(
                          groups.map((x, n) =>
                            n === index
                              ? groups[index - 1]
                              : n === index - 1
                                ? key
                                : x,
                          ),
                        )
                      }
                    >
                      ↑
                    </button>
                  )}
                </div>
              ))}
            </div>
            <div>
              <small>Thêm chiều xem</small>
              {Object.keys(dimensionLabels)
                .filter((key) => !groups.includes(key))
                .map((key) => (
                  <button
                    key={key}
                    onClick={() => addGroup(key)}
                    className="add-group"
                  >
                    + {dimensionLabels[key]}
                  </button>
                ))}
            </div>
          </div>
        </Card>
        <Card title="Kết quả">
          <div className="grouped">
            {grouped.length ? (
              grouped.map((group) => (
                <ReportGroup
                  key={group.key}
                  group={group}
                  onDetail={setDetail}
                />
              ))
            ) : (
              <Empty title="Không có số liệu trong bộ lọc" />
            )}
          </div>
        </Card>
      </div>
      {detail && <Detail rows={detail} onClose={() => setDetail(null)} />}
    </>
  );
}
function ReportGroup({
  group,
  onDetail,
}: {
  group: ReturnType<typeof groupRows>[number];
  onDetail: (rows: ReportRow[]) => void;
}) {
  return (
    <details open>
      <summary>
        <span>{group.value}</span>
        <span>
          {group.quantity} đơn vị · <b>{money(group.total)}</b>
          <button
            className="table-link report-detail"
            onClick={(event) => {
              event.preventDefault();
              onDetail(group.rows);
            }}
          >
            Xem chi tiết <ChevronRight size={14} />
          </button>
        </span>
      </summary>
      {group.children.map((child) => (
        <ReportGroup key={child.key} group={child} onDetail={onDetail} />
      ))}
    </details>
  );
}
function Detail({ rows, onClose }: { rows: ReportRow[]; onClose: () => void }) {
  const navigate = useNavigate();
  return (
    <Modal title="Chi tiết doanh số" onClose={onClose} wide>
      <div className="table-scroll" tabIndex={0} role="region" aria-label="Bảng dữ liệu có thể cuộn">
        <table>
          <thead>
            <tr>
              <th>Ngày</th>
              <th>Toa</th>
              <th>Khách hàng</th>
              <th>Sản phẩm</th>
              <th className="numeric">SL</th>
              <th className="numeric">Tiền hàng</th>
              <th className="numeric">Quỹ</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id}>
                <td>{day(row.date)}</td>
                <td>
                  <button
                    className="table-link"
                    onClick={() => {
                      onClose();
                      navigate(`/orders/${row.orderId}`);
                    }}
                  >
                    {row.code}
                  </button>
                </td>
                <td>{row.customer}</td>
                <td>{row.product}</td>
                <td className="numeric">
                  {row.quantity} {row.unit}
                </td>
                <td className="numeric">{money(row.revenue)}</td>
                <td
                  className={`numeric ${row.margin !== null && Number(row.margin) < 0 ? "negative" : "positive"}`}
                >
                  {row.margin === null ? "Chờ đối chiếu" : money(row.margin)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Modal>
  );
}
