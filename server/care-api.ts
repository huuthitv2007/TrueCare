import type { AttendanceRequest, RouteSchedule } from "../shared/types.js";
import { type OwnedState, pageOf } from "./admin-domain.js";
import { readListFilter } from "./list-filter.js";
import { markCareReviewNeeded } from "./care-domain.js";

export function listCareRows(states: OwnedState[], resource: "attendanceRequests" | "routeSchedules", query: Record<string, unknown>) {
  const filter = readListFilter(query);
  const status = String(query.status ?? "all");
  const route = String(query.route ?? "");
  const routeId = String(query.routeId ?? "");
  const rows = states.flatMap(owned => {
    const state = structuredClone(owned.state);
    markCareReviewNeeded(state);
    return (state[resource] ?? []).map(item => ({ ...item, ownerId: owned.ownerId, ownerName: owned.ownerName, workspaceVersion: state.version, sharedVersion: state.sharedVersion, inventoryVersion: state.inventoryVersion }));
  }).filter(item => {
    if (status !== "all" && item.status !== status) return false;
    if (resource === "routeSchedules") {
      const schedule = item as RouteSchedule;
      if (schedule.deletedAt) return false;
      if (route && schedule.route !== route) return false;
      if (routeId && schedule.routeId !== routeId) return false;
      return filter.matches(item.date, item.ownerId, item.ownerName, schedule.route, schedule.notes, schedule.resultNotes);
    }
    const request = item as AttendanceRequest;
    return filter.matches(item.date, item.ownerId, item.ownerName, request.reason, request.reviewReason, request.requestedStatus);
  }).sort((a, b) => b.date.localeCompare(a.date) || a.ownerId.localeCompare(b.ownerId) || a.id.localeCompare(b.id));
  return pageOf(rows, Number(query.page ?? 1), Number(query.pageSize ?? 25));
}
