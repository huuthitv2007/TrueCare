import { createHmac, timingSafeEqual } from "node:crypto";
import Decimal from "decimal.js";
import type { OrderLine, Product } from "../shared/types.js";

/**
 * The source is the price card supplied by the business on 15/09/2026.  We
 * deliberately keep a versioned snapshot here as well as in Supabase: a new
 * card is added as a new version, never edited in place.
 */
export const SMART_PRICEBOOK = {
  id: "truecare-program-2026-06-10",
  effectiveDate: "2026-06-10",
  sourceName: "gia_ban_chao_khach.jpg",
  sourceHash: "13cb4cb1a063786ee9d8f2a80d8c32cd29d6131dba7b1bcbd58a17d2f0318980",
  algorithmVersion: "smart-program-v2",
} as const;

export const STANDARD_GIFTS = [
  { id: "plastic-small", name: "Rổ/thau nhựa nhỏ", value: "15000", minimumCases: 1 },
  { id: "plastic-large", name: "Thau nhựa lớn", value: "30000", minimumCases: 1 },
  { id: "bowl-set-10", name: "Bộ chén kiểu 10 cái", value: "60000", minimumCases: 1 },
  { id: "shelf-4-tier", name: "Kệ sắt 4 tầng", value: "900000", minimumCases: 5 },
] as const;

type GiftId = (typeof STANDARD_GIFTS)[number]["id"];
export type SmartGift = (typeof STANDARD_GIFTS)[number];

export type SmartProgramOption = {
  id: string;
  label: string;
  gift?: SmartGift;
  lines: OrderLine[];
  price: string;
  margin: string;
  subsidy: string;
  cases: number;
  skuCount: number;
  variantCount: number;
  /** Role of each signed preview line. Kept out of persisted OrderLine data. */
  lineRoles: Record<string, "focus" | "compensation" | "gift">;
  focusProductName: string;
  compensationProductNames: string[];
  pricebook: typeof SMART_PRICEBOOK;
};

const normalize = (value: unknown) => String(value ?? "")
  .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
  .replace(/đ/g, "d").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
const textOf = (p: Product) => normalize([p.code, p.name, p.variant, p.unit].join(" "));
const has = (text: string, ...parts: string[]) => parts.every((part) => text.includes(part));

/** Maps the supplied card by its visible SKU, accepting catalog wording variations. */
export function priceCapOf(product: Product): string | null {
  const text = textOf(product);
  if (has(text, "ngx", "1 8")) return "82000";
  if (has(text, "ngx", "3 3") && (text.includes("tui") || text.includes("bag"))) return "129000";
  if (has(text, "ngx", "4 2") && (text.includes("tui") || text.includes("bag"))) return "151000";
  if (has(text, "ngx", "2 4") && (text.includes("chai") || text.includes("bottle"))) return "107000";
  if (has(text, "ngx", "3 6") && (text.includes("chai") || text.includes("can"))) return "141000";
  if (has(text, "ngx", "4 8") && (text.includes("chai") || text.includes("can"))) return "179000";
  if (has(text, "nxv", "1 15")) return "77000";
  if (has(text, "nxv", "1 4")) return "89000";
  if (has(text, "nxv", "2 2")) return "136000";
  if (has(text, "day", "20")) return "16200";
  if (has(text, "tay", "600")) return "26000";
  if (has(text, "tay", "900") || has(text, "rua", "nha", "tam", "900")) return "30000";
  if (has(text, "lau", "san", "1") || text.includes("ls1")) return text.includes("maxx") ? "25000" : "26500";
  if (has(text, "lau", "san", "3 6") || text.includes("ls3 6")) return text.includes("maxx") ? "70000" : "71000";
  if (has(text, "nrc", "400")) return "12000";
  if (has(text, "nrc", "750")) return "24500";
  if (has(text, "nrc", "3 6")) return text.includes("nha dam") ? "94500" : text.includes("tra xanh") ? "78000" : "76000";
  if (has(text, "lau", "bep", "580")) return "23000";
  if (has(text, "lau", "kinh", "580")) return "23000";
  if (has(text, "bot", "770")) return "35000";
  if (has(text, "bot", "370")) return "17000";
  if (has(text, "maxx", "chai", "3 3")) return "125000";
  if (has(text, "maxx", "tui", "2 2")) return "81000";
  if (has(text, "maxx", "tui", "3 3")) return "115000";
  return null;
}

const money = (value: Decimal.Value) => new Decimal(value).toDecimalPlaces(0).toFixed(0);
const maxAlternativesPerGift = 3;

type Candidate = {
  product: Product;
  price: Decimal;
  margin: Decimal;
  caseMargin: Decimal;
  casePrice: Decimal;
  family: string;
};

function candidateProducts(products: Product[]): Candidate[] {
  return products.flatMap((product) => {
    const cardCap = priceCapOf(product);
    if (product.archived || product.deletedAt) return [];
    // Imported historical placeholders preserve old orders only. They are not
    // saleable catalog items and must never become a smart-program candidate.
    if (product.code.startsWith("TC-HIST-") || normalize(product.variant).includes("chua ghi") || normalize(product.name).includes("ky 07 13")) return [];
    if (product.cost === null || product.price === null) return [];
    if (!cardCap) return [];
    const price = Decimal.min(new Decimal(cardCap), new Decimal(product.price));
    if (price.lte(0)) return [];
    const margin = price.minus(product.cost);
    return [{
      product,
      price,
      margin,
      caseMargin: margin.times(product.pack),
      casePrice: price.times(product.pack),
      family: normalize([product.name, product.unit, product.pack].join(" ")),
    }];
  }).sort((a, b) => a.caseMargin.cmp(b.caseMargin) || a.casePrice.cmp(b.casePrice) || a.product.id.localeCompare(b.product.id));
}

function matchesFocus(candidate: Candidate, focusProduct: string) {
  const focusTokens = normalize(focusProduct).split(" ").filter((token) => token.length > 0);
  if (!focusTokens.length) return false;
  const productTokens = new Set(textOf(candidate.product).split(" "));
  return focusTokens.every((token) => productTokens.has(token));
}

function lineOf(product: Product, price: Decimal, quantity: number): OrderLine {
  return {
    id: "smart-" + product.id,
    productId: product.id,
    name: product.name,
    quantity,
    price: money(price),
    cost: product.cost,
    ceiling: money(price),
    pack: product.pack,
    unit: product.unit,
    kind: "sale",
    sponsor: "employee",
    discount: "0",
    delivered: 0,
    returned: 0,
    fixedPrice: true,
  };
}

function virtualGift(gift: SmartGift): OrderLine {
  return {
    id: "smart-gift-" + gift.id,
    productId: "gift:" + gift.id,
    name: gift.name,
    quantity: 1,
    price: "0",
    cost: gift.value,
    ceiling: "0",
    pack: 1,
    unit: "phần",
    kind: "gift",
    sponsor: "employee",
    discount: "0",
    delivered: 0,
    returned: 0,
    fixedPrice: true,
    virtualGift: gift.id,
    kpiEligible: false,
  };
}

function optionOf(focus: Candidate, compensation: Array<{ candidate: Candidate; cases: number }>, gift?: SmartGift): SmartProgramOption | null {
  const saleLines = [
    { candidate: focus, cases: 1, role: "focus" as const },
    ...compensation.map(({ candidate, cases }) => ({ candidate, cases, role: "compensation" as const })),
  ];
  const distinctFamilies = new Set(saleLines.map((item) => item.candidate.family));
  if (distinctFamilies.size !== saleLines.length) return null;
  const saleMargin = saleLines.reduce((total, item) => total.plus(item.candidate.caseMargin.times(item.cases)), new Decimal(0));
  const margin = saleMargin.minus(gift?.value ?? 0);
  // Smart v2 does not consume the employee fund: compensation has to settle a
  // discounted focus product and an optional gift inside the same bundle.
  if (margin.lt(0)) return null;
  const lines = saleLines.map((item) => lineOf(item.candidate.product, item.candidate.price, item.candidate.product.pack * item.cases));
  if (gift) lines.push(virtualGift(gift));
  const price = saleLines.reduce((total, item) => total.plus(item.candidate.casePrice.times(item.cases)), new Decimal(0));
  const cases = saleLines.reduce((total, item) => total + item.cases, 0);
  if (gift?.id === "shelf-4-tier" && (cases < 5 || compensation.length < 2)) return null;
  const variants = new Set(saleLines.map((item) => normalize(item.candidate.product.variant)).filter(Boolean));
  const composition = saleLines.map((item) => `${item.candidate.product.id}:${item.cases}`).join("+");
  return {
    id: `${gift?.id ?? "no-gift"}:${composition}`,
    label: gift ? `NHTT + hàng bù · Tặng ${gift.name}` : "NHTT + hàng bù",
    gift,
    lines,
    price: money(price),
    margin: money(margin),
    subsidy: "0",
    cases,
    skuCount: saleLines.length,
    variantCount: variants.size,
    lineRoles: Object.fromEntries(lines.map((line, index) => [line.id, line.kind === "gift" ? "gift" : saleLines[index].role])),
    focusProductName: focus.product.name,
    compensationProductNames: compensation.map((item) => item.candidate.product.name),
    pricebook: SMART_PRICEBOOK,
  };
}

function optionsForGift(focuses: Candidate[], candidates: Candidate[], gift?: SmartGift) {
  const options: SmartProgramOption[] = [];
  for (const focus of focuses) {
    const support = candidates.filter((candidate) => candidate.family !== focus.family && candidate.caseMargin.gt(0));
    if (gift?.id === "shelf-4-tier") {
      for (let left = 1; left <= 3; left++) for (const first of support) for (const second of support) {
        if (first.family === second.family) continue;
        const option = optionOf(focus, [{ candidate: first, cases: left }, { candidate: second, cases: 4 - left }], gift);
        if (option) options.push(option);
      }
      continue;
    }
    const oneSupport = support.map((candidate) => optionOf(focus, [{ candidate, cases: 1 }], gift)).filter((option): option is SmartProgramOption => !!option);
    if (oneSupport.length) { options.push(...oneSupport); continue; }
    for (const first of support) for (const second of support) {
      if (first.family === second.family) continue;
      const option = optionOf(focus, [{ candidate: first, cases: 1 }, { candidate: second, cases: 1 }], gift);
      if (option) options.push(option);
    }
  }
  const unique = new Map(options.map((option) => [option.id, option]));
  return [...unique.values()].sort(compareOptions).slice(0, maxAlternativesPerGift);
}

function compareOptions(a: SmartProgramOption, b: SmartProgramOption) {
  return new Decimal(a.subsidy).cmp(b.subsidy)
    || a.cases - b.cases
    || new Decimal(a.margin).cmp(b.margin)
    || new Decimal(a.price).cmp(b.price)
    || b.variantCount - a.variantCount
    || b.skuCount - a.skuCount
    || a.id.localeCompare(b.id);
}

export function smartProgramPreview(products: Product[], _available: Decimal.Value, focusProduct = "") {
  const candidates = candidateProducts(products);
  const focuses = candidates.filter((candidate) => matchesFocus(candidate, focusProduct));
  const reasons: string[] = [];
  if (!candidates.length) reasons.push("Không có sản phẩm khớp bảng giá chương trình, đủ giá vốn và giá chào.");
  if (!String(focusProduct).trim()) reasons.push("Chưa cấu hình Nhãn hàng trọng tâm trong Cài đặt.");
  else if (!focuses.length) reasons.push(`Nhãn hàng trọng tâm “${focusProduct}” không khớp sản phẩm hợp lệ trong catalog hoặc bảng giá chương trình.`);
  const options = focuses.length
    ? [undefined, ...STANDARD_GIFTS].flatMap((gift) => optionsForGift(focuses, candidates, gift)).sort(compareOptions)
    : [];
  if (focuses.length && !options.length) reasons.push("Không có hàng bù khác SKU đủ để toàn suất không lỗ. Kiểm tra giá vốn, giá chào và bảng giá chương trình.");
  if (focuses.length && !options.some((option) => option.gift?.id === "shelf-4-tier")) reasons.push("Kệ sắt 4 tầng chưa có phương án hợp lệ: cần 1 thùng NHTT, 4 thùng hàng bù thuộc ít nhất 2 SKU và tổng suất không lỗ.");
  return {
    options,
    reasons,
    focusProduct,
    excluded: products.filter((p) => !p.archived && !p.deletedAt && !priceCapOf(p)).map((p) => ({ id: p.id, name: p.name, reason: "Thiếu ánh xạ trong bảng giá chương trình" })),
  };
}

type SignedPayload = { exp: number; version: number; sharedVersion?: number; inventoryVersion?: number; count: number; expiresAt: string; option: SmartProgramOption };
// Production derives the signing key from the already-required server-only
// Supabase secret. A dedicated key can be supplied later without a migration.
const secret = () => process.env.PROGRAM_PREVIEW_SECRET || process.env.SUPABASE_SECRET_KEY || "truecare-local-smart-program-signing-only";
const sign = (payload: string) => createHmac("sha256", secret()).update(payload).digest("base64url");

export function signSmartProposal(payload: SignedPayload) {
  const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${encoded}.${sign(encoded)}`;
}

export function verifySmartProposal(token: unknown): SignedPayload | null {
  if (typeof token !== "string") return null;
  const [encoded, given] = token.split(".");
  if (!encoded || !given) return null;
  const expected = sign(encoded);
  if (given.length !== expected.length || !timingSafeEqual(Buffer.from(given), Buffer.from(expected))) return null;
  try {
    const payload = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")) as SignedPayload;
    if (!payload || payload.exp < Date.now() || !payload.option || !Number.isSafeInteger(payload.count)) return null;
    return payload;
  } catch { return null; }
}
