create table if not exists public.assignments (
  service_date date primary key,
  brother_name text not null,
  updated_at timestamptz not null default now(),
  constraint meeting_day_only check (extract(dow from service_date) in (0, 4)),
  constraint allowed_brother check (brother_name in (
    'Alejandro Montaño', 'David Gisbert', 'Enrique Llorente',
    'Juan Pablo Campoverde', 'Dario Stella', 'Leonel Muñiz', 'Luis Varela',
    'José Luis Villanueva', 'Domingo Figueroa', 'Werner Kupke',
    'Alonso Martínez', 'Rigo Peidró'
  ))
);

alter table public.assignments enable row level security;

-- No se crea ninguna policy pública. Los datos solo pasan por la función protegida.

revoke all on table public.assignments from anon, authenticated;
grant select, insert, update, delete on table public.assignments to service_role;
