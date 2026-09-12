import type { CSSProperties } from "react";
type IconProps = {
  size?: number | string;
  className?: string;
  style?: CSSProperties;
  strokeWidth?: number;
  "aria-hidden"?: boolean | "true" | "false";
};
export function Icon({
  name,
  size = 20,
  className = "",
  style,
}: IconProps & { name: string }) {
  return (
    <i
      aria-hidden="true"
      className={`ki-filled ki-${name} keen-icon ${className}`}
      style={{ fontSize: size, ...style }}
    />
  );
}
function named(name: string) {
  return function KeenIcon(props: IconProps) {
    return <Icon {...props} name={name} />;
  };
}
export const Activity = named("pulse");
export const AlertTriangle = named("information-2");
export const ArrowDown = named("arrow-down");
export const ArrowUp = named("arrow-up");
export const ArrowLeft = named("arrow-left");
export const ArrowRight = named("arrow-right");
export const ArrowUpRight = named("arrow-up-right");
export const BarChart3 = named("chart-simple");
export const BookOpenCheck = named("document");
export const Boxes = named("parcel");
export const CalendarDays = named("calendar");
export const Check = named("check");
export const ChevronRight = named("right");
export const CircleDollarSign = named("dollar");
export const ClipboardList = named("notepad");
export const CloudCheck = named("cloud");
export const Database = named("data");
export const Download = named("file-down");
export const Eye = named("eye");
export const EyeOff = named("eye-slash");
export const FileClock = named("time");
export const FileSpreadsheet = named("file-sheet");
export const Filter = named("filter");
export const Gift = named("gift");
export const Home = named("element-11");
export const Inbox = named("directbox-default");
export const KeyRound = named("key");
export const LayoutDashboard = named("element-11");
export const LoaderCircle = named("loading");
export const LockKeyhole = named("lock");
export const LogOut = named("exit-right");
export const MapPin = named("geolocation");
export const Menu = named("menu");
export const Moon = named("moon");
export const Package = named("package");
export const PackageSearch = named("package");
export const Pencil = named("pencil");
export const Plus = named("plus");
export const Printer = named("printer");
export const RefreshCw = named("arrows-circle");
export const RotateCcw = named("arrows-circle");
export const Save = named("check-circle");
export const ScrollText = named("document");
export const Search = named("magnifier");
export const Settings = named("setting-2");
export const ShieldCheck = named("shield-tick");
export const Sun = named("sun");
export const Tag = named("discount");
export const Trash2 = named("trash");
export const Truck = named("delivery");
export const Undo2 = named("arrow-left");
export const Upload = named("file-up");
export const UserRoundCog = named("user-edit");
export const Users = named("people");
export const WalletCards = named("wallet");
export const X = named("cross");
