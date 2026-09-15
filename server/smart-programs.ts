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
  algorithmVersion: "smart-program-v1",
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
const maxSubsidy = new Decimal(200000);

function candidateProducts(products: Product[]) {
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
    return [{ product, price, margin: price.minus(product.cost) }];
  }).sort((a, b) => b.margin.cmp(a.margin) || a.price.cmp(b.price) || a.product.id.localeCompare(b.product.id));
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

function makeOption(products: Product[], gift?: SmartGift): SmartProgramOption | null {
  const candidates = candidateProducts(products);
  if (!candidates.length) return null;
  const needCases = gift?.minimumCases ?? 1;
  const diversity = gift?.id === "shelf-4-tier";
  const types = diversity ? candidates.slice(0, 3) : candidates.slice(0, 1);
  if (diversity && types.length < 3) return null;
  const lines: OrderLine[] = [];
  let remainingCases = needCases;
  for (let index = 0; index < types.length; index++) {
    const item = types[index];
    const cases = index === types.length - 1 ? remainingCases : 1;
    remainingCases -= cases;
    lines.push(lineOf(item.product, item.price, item.product.pack * cases));
  }
  if (gift) lines.push(virtualGift(gift));
  const sales = lines.filter((line) => line.kind === "sale");
  const price = sales.reduce((total, line) => total.plus(new Decimal(line.price).times(line.quantity)), new Decimal(0));
  const margin = lines.reduce((total, line) => total.plus(line.kind === "sale" ? new Decimal(line.price).minus(line.cost ?? 0).times(line.quantity) : new Decimal(line.cost ?? 0).neg()), new Decimal(0));
  const subsidy = Decimal.max(0, margin.neg());
  const cases = sales.reduce((total, line) => total + Math.ceil(line.quantity / line.pack), 0);
  const variants = new Set(sales.map((line) => normalize(products.find((p) => p.id === line.productId)?.variant || line.name)).filter(Boolean));
  if (subsidy.gt(maxSubsidy)) return null;
  return {
    id: gift?.id ?? "no-gift",
    label: gift ? `Tặng ${gift.name}` : "Không tặng phẩm",
    gift,
    lines,
    price: money(price),
    margin: money(margin),
    subsidy: money(subsidy),
    cases,
    skuCount: sales.length,
    variantCount: variants.size,
    pricebook: SMART_PRICEBOOK,
  };
}

export function smartProgramPreview(products: Product[], available: Decimal.Value) {
  const options = [undefined, ...STANDARD_GIFTS].map((gift) => makeOption(products, gift)).filter((option): option is SmartProgramOption => !!option);
  const reasons: string[] = [];
  const eligible = candidateProducts(products);
  if (!eligible.length) reasons.push("Không có sản phẩm khớp bảng giá chương trình, đủ giá vốn và giá chào.");
  if (!options.some((option) => option.id === "shelf-4-tier")) reasons.push("Kệ sắt 4 tầng chưa có phương án hợp lệ: cần tối thiểu 5 thùng, 3 SKU và mức bù không quá 200.000đ mỗi suất.");
  const allowed = options.filter((option) => new Decimal(option.subsidy).lte(available));
  if (!allowed.length && options.length) reasons.push("Quỹ khả dụng không đủ cho bất kỳ phương án hiện tại.");
  return {
    options: allowed.sort((a, b) => new Decimal(a.subsidy).cmp(b.subsidy) || a.cases - b.cases || b.variantCount - a.variantCount || b.skuCount - a.skuCount),
    reasons,
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
