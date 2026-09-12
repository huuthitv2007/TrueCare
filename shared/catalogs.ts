export const defaultCatalogs = {
  districts: [
    "TP. Trà Vinh",
    "Càng Long",
    "Cầu Kè",
    "Cầu Ngang",
    "Châu Thành",
    "Duyên Hải",
    "Tiểu Cần",
    "Trà Cú",
  ],
  visitDays: ["Thứ Hai", "Thứ Ba", "Thứ Tư", "Thứ Năm", "Thứ Sáu", "Thứ Bảy"],
  storeTypes: [
    "Nhà Sách",
    "Tạp Hóa Bên Mặt Đường",
    "Siêu Thị Mini",
    "Nhà Thuốc",
    "Cửa Hàng Trong Hẻm",
    "Shop Mẹ và Bé",
    "Cửa Hàng Bên Trong Chợ",
    "Cửa Hàng Sỉ",
  ],
  routes: [] as string[],
  brands: [] as string[],
  groups: [] as string[],
  units: ["chai", "can", "túi", "dây"],
  frequencies: ["Hằng tuần", "Hai tuần", "Hằng tháng"],
};
export type Catalogs = typeof defaultCatalogs;
export interface CatalogEntry { id:string; kind:keyof Catalogs; value:string; position:number; active:boolean }
export function activeCatalogs(catalogs:Catalogs, entries:CatalogEntry[] = []):Catalogs {
 return Object.fromEntries(Object.entries(catalogs).map(([kind,values])=>[kind,kind==='visitDays'?values:values.filter(value=>!entries.some(entry=>entry.kind===kind&&entry.value===value&&!entry.active))])) as Catalogs;
}
