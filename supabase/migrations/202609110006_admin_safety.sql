begin;

-- Audit records keep UUIDs as historical facts even after an empty account is removed.
-- Foreign-key SET NULL would be an UPDATE and is intentionally incompatible with
-- the append-only trigger.
alter table public.admin_audit_logs drop constraint if exists admin_audit_logs_actor_id_fkey;
alter table public.admin_audit_logs drop constraint if exists admin_audit_logs_target_user_id_fkey;

-- Materialize the operating defaults that previously existed only in TypeScript.
update public.shared_directory
set data=data||jsonb_build_object('catalogs',jsonb_build_object(
  'districts',jsonb_build_array('TP. Trà Vinh','Càng Long','Cầu Kè','Cầu Ngang','Châu Thành','Duyên Hải','Tiểu Cần','Trà Cú'),
  'visitDays',jsonb_build_array('Thứ Hai','Thứ Ba','Thứ Tư','Thứ Năm','Thứ Sáu','Thứ Bảy'),
  'storeTypes',jsonb_build_array('Nhà Sách','Tạp Hóa Bên Mặt Đường','Siêu Thị Mini','Nhà Thuốc','Cửa Hàng Trong Hẻm','Shop Mẹ và Bé','Cửa Hàng Bên Trong Chợ','Cửa Hàng Sỉ'),
  'routes','[]'::jsonb,'brands','[]'::jsonb,'groups','[]'::jsonb,
  'units',jsonb_build_array('chai','can','túi','dây'),
  'frequencies',jsonb_build_array('Hằng tuần','Hai tuần','Hằng tháng')
)),version=version+1,updated_at=now()
where id=true and not(data ? 'catalogs');

select public.sync_normalized_directory(data,null,'Bổ sung danh mục vận hành mặc định')
from public.shared_directory where id=true;

commit;
