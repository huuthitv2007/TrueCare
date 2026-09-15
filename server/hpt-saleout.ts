import { DomainError, assert } from "./domain.js";

export type HptSaleOutRow = {
  date: string;
  customer: string;
  amount: string;
};

export type HptSaleOutReport = {
  source: "HPT DMS";
  from: string;
  to: string;
  retrievedAt: string;
  quantity: number;
  total: string;
  rows: HptSaleOutRow[];
};

type HptConfig = {
  baseUrl: string;
  companyCode: string;
  username: string;
  password: string;
};

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const DATE_VN = /^(\d{2})\/(\d{2})\/(\d{4})$/;
const MAX_RANGE_DAYS = 93;

const decodeHtml = (value: string) =>
  value
    .replace(/&amp;/gi, "&")
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code) =>
      String.fromCodePoint(Number.parseInt(code, 16)),
    );

const textOf = (value: string) =>
  decodeHtml(value.replace(/<br\s*\/?>/gi, " ").replace(/<[^>]*>/g, " "))
    .replace(/\s+/g, " ")
    .trim();

const attributesOf = (tag: string) =>
  Object.fromEntries(
    [...tag.matchAll(/([\w:-]+)\s*=\s*["']([^"']*)["']/g)].map(([, key, value]) => [
      key.toLowerCase(),
      decodeHtml(value),
    ]),
  );

const formOf = (html: string) => {
  const form = new URLSearchParams();
  for (const tag of html.match(/<input\b[^>]*>/gi) ?? []) {
    const attributes = attributesOf(tag);
    const type = (attributes.type ?? "text").toLowerCase();
    if (
      !attributes.name ||
      ["button", "image", "reset", "submit"].includes(type) ||
      (type === "checkbox" && !/\bchecked\b/i.test(tag))
    )
      continue;
    form.set(attributes.name, attributes.value ?? "");
  }
  return form;
};

const fieldOf = (html: string, name: string) => {
  for (const tag of html.match(/<input\b[^>]*>/gi) ?? []) {
    const attributes = attributesOf(tag);
    if (attributes.name === name) return attributes.value ?? "";
  }
  return "";
};

const moneyOf = (value: string) => {
  const negative = /-/.test(value);
  const digits = value.replace(/[^0-9]/g, "");
  return `${negative ? "-" : ""}${digits || "0"}`;
};

const dayOf = (value: string) => {
  const match = DATE_VN.exec(value.trim());
  return match ? `${match[3]}-${match[2]}-${match[1]}` : null;
};

const dateVn = (date: string) => {
  assert(DATE.test(date), "Khoảng ngày HPT không hợp lệ");
  const parsed = new Date(`${date}T00:00:00Z`);
  assert(!Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === date, "Khoảng ngày HPT không hợp lệ");
  const [year, month, day] = date.split("-");
  return `${day}/${month}/${year}`;
};

const configured = (): HptConfig => {
  const baseUrl = process.env.HPT_SALEOUT_BASE_URL ?? "";
  const companyCode = process.env.HPT_COMPANY_CODE ?? "";
  const username = process.env.HPT_USERNAME ?? "";
  const password = process.env.HPT_PASSWORD ?? "";
  if (!baseUrl || !companyCode || !username || !password)
    throw new DomainError(
      "HPT_NOT_CONFIGURED",
      "Chưa cấu hình kết nối HPT DMS trên máy chủ.",
      503,
    );
  let url: URL;
  try {
    url = new URL(baseUrl);
  } catch {
    throw new DomainError("HPT_CONFIG", "Địa chỉ HPT DMS không hợp lệ.", 503);
  }
  if (
    !["http:", "https:"].includes(url.protocol) ||
    !/(^|\.)hptbs\.com$/i.test(url.hostname)
  )
    throw new DomainError("HPT_CONFIG", "Địa chỉ HPT DMS không được phép.", 503);
  return { baseUrl: url.href, companyCode, username, password };
};

const parseRows = (html: string): HptSaleOutRow[] => {
  const tables = html.match(/<table\b[\s\S]*?<\/table>/gi) ?? [];
  const source = tables.find((table) => /Tên\s*KH|Tên khách hàng/i.test(textOf(table)));
  if (!source) return [];
  const rows: HptSaleOutRow[] = [];
  let currentDate = "";
  for (const row of source.match(/<tr\b[\s\S]*?<\/tr>/gi) ?? []) {
    const cells = [...row.matchAll(/<t[dh]\b[^>]*>([\s\S]*?)<\/t[dh]>/gi)]
      .map(([, value]) => textOf(value))
      .filter(Boolean);
    if (!cells.length || /^(Ngày|Tên KH|Doanh số)$/i.test(cells.join(" "))) continue;
    const firstDay = dayOf(cells[0]);
    if (firstDay && cells.length >= 3) {
      currentDate = firstDay;
      const customer = cells[1];
      const amount = moneyOf(cells.at(-1) ?? "");
      if (customer) rows.push({ date: currentDate, customer, amount });
    } else if (currentDate && cells.length >= 2) {
      const customer = cells[0];
      const amount = moneyOf(cells.at(-1) ?? "");
      if (customer) rows.push({ date: currentDate, customer, amount });
    }
  }
  return rows;
};

export const parseHptSaleOutHtml = (html: string) => {
  const summary = textOf(html).match(/Tổng\s*số\s*lượng\s*:\s*([\d.,]+)\s*Tổng\s*tiền\s*([\-.,\d]+)/i);
  return {
    quantity: Number((summary?.[1] ?? "0").replace(/[^0-9]/g, "")) || 0,
    total: moneyOf(summary?.[2] ?? "0"),
    rows: parseRows(html),
  };
};

export async function fetchHptSaleOut(from: string, to: string): Promise<HptSaleOutReport> {
  const start = dateVn(from);
  const end = dateVn(to);
  const elapsed = Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`);
  assert(elapsed >= 0 && elapsed / 86_400_000 <= MAX_RANGE_DAYS, "Khoảng truy vấn HPT tối đa 93 ngày");
  const config = configured();
  const cookies: string[] = [];
  const timeout = AbortSignal.timeout(20_000);
  const rememberCookies = (response: Response) => {
    const values = (response.headers as Headers & { getSetCookie?: () => string[] }).getSetCookie?.() ?? [];
    cookies.push(...values);
  };
  const request = async (url: string, init: RequestInit = {}) => {
    let response: Response;
    try {
      response = await fetch(url, {
        ...init,
        redirect: "manual",
        signal: timeout,
        headers: {
          Cookie: cookies.map((item) => item.split(";", 1)[0]).join("; "),
          ...(init.headers ?? {}),
        },
      });
    } catch {
      throw new DomainError("HPT_UNAVAILABLE", "Không kết nối được HPT DMS.", 502);
    }
    rememberCookies(response);
    return response;
  };
  const loginUrl = new URL(config.baseUrl);
  const loginPage = await request(loginUrl.href);
  if (!loginPage.ok) throw new DomainError("HPT_UNAVAILABLE", "HPT DMS không phản hồi trang đăng nhập.", 502);
  const loginHtml = await loginPage.text();
  const login = formOf(loginHtml);
  login.set("__VIEWSTATE", fieldOf(loginHtml, "__VIEWSTATE"));
  login.set("__VIEWSTATEGENERATOR", fieldOf(loginHtml, "__VIEWSTATEGENERATOR"));
  login.set("__EVENTVALIDATION", fieldOf(loginHtml, "__EVENTVALIDATION"));
  login.set("txt_sitecode", config.companyCode);
  login.set("txt_user", config.username);
  login.set("txt_pass", config.password);
  login.set("Button1", "Đăng nhập");
  const loginResult = await request(loginUrl.href, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: login,
  });
  const redirect = loginResult.headers.get("location");
  if (!redirect) throw new DomainError("HPT_AUTH", "HPT DMS từ chối thông tin đăng nhập.", 401);
  const dashboard = new URL(redirect, loginUrl);
  const report = new URL("/DSRSaleOut.aspx", dashboard);
  report.search = dashboard.search;
  const initial = await request(report.href);
  if (!initial.ok) throw new DomainError("HPT_UNAVAILABLE", "Không tải được báo cáo thực giao HPT.", 502);
  const initialHtml = await initial.text();
  const select = formOf(initialHtml);
  select.set("__EVENTTARGET", "ctl00$ContentPlaceHolder1$DataList1$ctl04$LinkButton1");
  select.set("__EVENTARGUMENT", "");
  const selected = await request(report.href, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: select,
  });
  if (!selected.ok) throw new DomainError("HPT_UNAVAILABLE", "Không áp dụng được bộ lọc HPT.", 502);
  const selectedHtml = await selected.text();
  const apply = formOf(selectedHtml);
  apply.set("ctl00$ContentPlaceHolder1$txt_tungay", start);
  apply.set("ctl00$ContentPlaceHolder1$txt_denngay", end);
  apply.set("ctl00$ContentPlaceHolder1$bt_confirm", "Áp dụng");
  const filtered = await request(report.href, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: apply,
  });
  if (!filtered.ok) throw new DomainError("HPT_UNAVAILABLE", "Không tải được dữ liệu thực giao HPT.", 502);
  const parsed = parseHptSaleOutHtml(await filtered.text());
  return { source: "HPT DMS", from, to, retrievedAt: new Date().toISOString(), ...parsed };
}
