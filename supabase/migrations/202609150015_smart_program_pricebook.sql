-- Immutable source records for the smart-program price card.  Runtime keeps
-- the chosen version and source hash in each program snapshot.
begin;

create table if not exists public.program_pricebooks (
  id text primary key,
  effective_date date not null,
  source_name text not null,
  source_sha256 text not null check(source_sha256 ~ '^[0-9a-f]{64}$'),
  algorithm_version text not null,
  created_at timestamptz not null default now(),
  retired_at timestamptz
);
create table if not exists public.program_pricebook_lines (
  pricebook_id text not null references public.program_pricebooks(id) on delete restrict,
  sku_key text not null,
  variant_key text not null default '',
  ceiling_price numeric(18,2) not null check(ceiling_price >= 0),
  primary key(pricebook_id,sku_key,variant_key)
);
create table if not exists public.program_gifts (
  id text primary key,
  name text not null,
  value numeric(18,2) not null check(value > 0),
  minimum_cases integer not null check(minimum_cases > 0),
  kpi_eligible boolean not null default false,
  active boolean not null default true,
  created_at timestamptz not null default now()
);
alter table public.program_pricebooks enable row level security;
alter table public.program_pricebook_lines enable row level security;
alter table public.program_gifts enable row level security;
revoke all on public.program_pricebooks,public.program_pricebook_lines,public.program_gifts from public,anon,authenticated;
grant all on public.program_pricebooks,public.program_pricebook_lines,public.program_gifts to service_role;

insert into public.program_pricebooks(id,effective_date,source_name,source_sha256,algorithm_version)
values ('truecare-program-2026-06-10','2026-06-10','gia_ban_chao_khach.jpg','13cb4cb1a063786ee9d8f2a80d8c32cd29d6131dba7b1bcbd58a17d2f0318980','smart-program-v1')
on conflict(id) do nothing;
insert into public.program_pricebook_lines(pricebook_id,sku_key,ceiling_price) values
('truecare-program-2026-06-10','ngx-1.8-bag',82000),('truecare-program-2026-06-10','ngx-3.3-bag',129000),
('truecare-program-2026-06-10','ngx-4.2-bag',151000),('truecare-program-2026-06-10','ngx-2.4-bottle',107000),
('truecare-program-2026-06-10','ngx-3.6-can',141000),('truecare-program-2026-06-10','ngx-4.8-can',179000),
('truecare-program-2026-06-10','nxv-1.15-bag',77000),('truecare-program-2026-06-10','nxv-1.4-bag',89000),
('truecare-program-2026-06-10','nxv-2.2-bag',136000),('truecare-program-2026-06-10','day-xa-20ml',16200),
('truecare-program-2026-06-10','tay-600ml',26000),('truecare-program-2026-06-10','tay-900ml',30000),
('truecare-program-2026-06-10','lau-san-1l',26500),('truecare-program-2026-06-10','lau-san-3.6kg',71000),
('truecare-program-2026-06-10','nrc-400g',12000),('truecare-program-2026-06-10','nrc-750g',24500),
('truecare-program-2026-06-10','lau-bep-580ml',23000),('truecare-program-2026-06-10','lau-kinh-580ml',23000),
('truecare-program-2026-06-10','bot-770g',35000),('truecare-program-2026-06-10','bot-370g',17000),
('truecare-program-2026-06-10','maxx-chai-ngx-3.3',125000),('truecare-program-2026-06-10','maxx-tui-ngx-2.2',81000),
('truecare-program-2026-06-10','maxx-tui-ngx-3.3',115000),('truecare-program-2026-06-10','maxx-lau-san-1l',25000),
('truecare-program-2026-06-10','maxx-lau-san-3.6kg',70000)
on conflict do nothing;
insert into public.program_gifts(id,name,value,minimum_cases,kpi_eligible) values
('plastic-small','Rổ/thau nhựa nhỏ',15000,1,false),('plastic-large','Thau nhựa lớn',30000,1,false),
('bowl-set-10','Bộ chén kiểu 10 cái',60000,1,false),('shelf-4-tier','Kệ sắt 4 tầng',900000,5,false)
on conflict(id) do update set name=excluded.name,value=excluded.value,minimum_cases=excluded.minimum_cases,kpi_eligible=excluded.kpi_eligible;
commit;
