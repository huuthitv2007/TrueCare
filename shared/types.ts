import type { Catalogs, CatalogEntry } from "./catalogs.js";
export type Money = string;
export type UserRole = "admin" | "employee";
export interface User {
  id: string;
  email: string;
  username: string;
  displayName: string;
  role: UserRole;
  active: boolean;
}
export interface EmployeeAccount {
  id: string;
  email: string;
  username: string;
  displayName: string;
  role: UserRole;
  active: boolean;
  createdAt: string;
  updatedAt: string;
  lastLoginAt?: string | null;
  deletedAt?: string | null;
  deletedBy?: string | null;
  activeBeforeDelete?: boolean | null;
}
export interface TeamMember extends EmployeeAccount {
  summary: AppState["summary"];
  stateVersion: number;
  stateUpdatedAt: string | null;
}
export interface Product {
  id: string;
  name: string;
  code: string;
  group: string;
  brand: string;
  variant: string;
  unit: string;
  pack: number;
  cost: Money | null;
  price: Money | null;
  effectiveDate: string;
  archived?: boolean;
  sourceOwner?: string;
  needsReview?: boolean;
  deletedAt?: string;
  deletedBy?: string;
  deletionReason?: string;
  archivedBeforeDelete?: boolean;
}
export interface Customer {
  id: string;
  name: string;
  contact: string;
  phone: string;
  email: string;
  address: string;
  street: string;
  ward: string;
  district: string;
  province: string;
  route: string;
  visitDays: number[];
  frequency: string;
  storeType: string;
  notes: string;
  openedDate: string;
  archived?: boolean;
  createdBy?: string;
  createdAt?: string;
  updatedAt?: string;
  legacyLocked?: boolean;
  deletedAt?: string;
  deletedBy?: string;
  deletionReason?: string;
  mergedInto?: string;
}
export interface OrderLine {
  id: string;
  productId: string;
  name: string;
  quantity: number;
  price: Money;
  cost: Money | null;
  ceiling: Money | null;
  pack: number;
  unit: string;
  kind: "sale" | "gift" | "display";
  sponsor: "employee" | "company";
  discount: Money;
  delivered: number;
  returned: number;
  fixedPrice?: boolean;
}
export interface OrderRevision {
  id: string;
  at: string;
  actorId?: string;
  reason: string;
  before: Pick<
    Order,
    "customerId" | "date" | "notes" | "status" | "lines" | "total" | "margin"
  >;
  after?: Pick<
    Order,
    "customerId" | "date" | "notes" | "status" | "lines" | "total" | "margin"
  >;
}
export interface OrderDeletion {
  stock: { productId: string; quantity: number }[];
  reversals: string[];
  reserved: Money;
}
export interface Order {
  id: string;
  code: string;
  customerId: string;
  date: string;
  notes: string;
  status: "draft" | "confirmed" | "partial" | "delivered" | "cancelled";
  lines: OrderLine[];
  total: Money;
  margin: Money | null;
  reserved: Money;
  version: number;
  historical?: boolean;
  programId?: string;
  bundleCount?: number;
  cancelReason?: string;
  revisions?: OrderRevision[];
  deletedAt?: string;
  deletedBy?: string;
  deletionReason?: string;
  statusBeforeDelete?: Order["status"];
  deletion?: OrderDeletion;
  purgedAt?: string;
}
/**
 * `revenue` is the customer-facing amount for an actual delivery.
 * `employeeSales` is the employee's delivered sales basis: the original cost
 * of the physical items actually delivered. They are intentionally separate.
 */
export interface Delivery {
  id: string;
  code: string;
  orderId: string;
  date: string;
  lines: {
    lineId: string;
    quantity: number;
    revenue: Money;
    employeeSales?: Money | null;
    margin: Money | null;
  }[];
  total: Money;
  employeeSales?: Money | null;
  exchangeTopUp?: Money;
  margin: Money | null;
  notes: string;
}
export interface ReturnRecord {
  id: string;
  deliveryId: string;
  orderId: string;
  date: string;
  lines: {
    lineId: string;
    quantity: number;
    restock: boolean;
    revenue: Money;
    employeeSales?: Money | null;
    margin: Money | null;
  }[];
  reason: string;
}
export interface LedgerEntry {
  id: string;
  date: string;
  type: "opening" | "delivery" | "return" | "adjustment";
  amount: Money;
  referenceId: string;
  notes: string;
  reversalOf?: string;
}
export interface Inventory {
  productId: string;
  quantity: number;
  tracked: boolean;
  updatedAt: string;
  source: string;
}
export interface InventoryMovement {
  id: string;
  productId: string;
  date: string;
  quantity: number;
  reason: string;
  referenceId: string;
}
export interface Program {
  id: string;
  name: string;
  mode: "bundle" | "single";
  lines: OrderLine[];
  count: number;
  remaining: number;
  price: Money;
  margin: Money;
  subsidy: Money;
  reserved: Money;
  guaranteeStock: boolean;
  status: "active" | "cancelled" | "expired";
  expiresAt: string;
  seed: number;
  archivedAt?: string;
  archivedBy?: string;
  archiveReason?: string;
}
export interface Settings {
  displayName: string;
  companyCode: string;
  dailyTarget: Money;
  monthlyTarget: Money;
  newCustomerTarget: number;
  aso: number;
  theme: "light" | "dark";
  workDays: number[];
  holidays: string[];
  focusProduct: string;
  periodStart: string;
  openingSales: Money;
  reportGroups: string[];
  [key: string]: unknown;
}
export interface AppState {
  version: number;
  sharedVersion?: number;
  inventoryVersion?: number;
  catalogs?: Catalogs;
  catalogEntries?: CatalogEntry[];
  products: Product[];
  customers: Customer[];
  orders: Order[];
  deliveries: Delivery[];
  returns: ReturnRecord[];
  payments: {
    id: string;
    orderId: string;
    date: string;
    amount: Money;
    notes: string;
  }[];
  ledger: LedgerEntry[];
  programs: Program[];
  inventory: Inventory[];
  inventoryMovements: InventoryMovement[];
  visits: { id: string; customerId: string; date: string; notes: string }[];
  settings: Settings;
  audit: {
    id: string;
    at: string;
    type: string;
    referenceId: string;
    details: string;
  }[];
  imports: { hash: string; at: string }[];
  summary: {
    ordered: Money;
    delivered: Money;
    customerDelivered: Money;
    collected: Money;
    fund: Money;
    reserved: Money;
    available: Money;
    pendingMargin: Money;
    unresolved: number;
  };
}
export interface Command {
  type: string;
  payload: any;
  idempotencyKey: string;
  version?: number;
  sharedVersion?: number;
  inventoryVersion?: number;
}
