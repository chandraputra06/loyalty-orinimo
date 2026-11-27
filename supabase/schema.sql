-- =====================================================================
-- Orinimo Loyalty Club — skema database Supabase
-- Jalankan SEKALI di Supabase: Dashboard → SQL Editor → New query →
-- tempel seluruh file ini → Run.
-- =====================================================================

-- ---------- TABEL ----------
create table if not exists public.staff (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  role       text not null default 'admin' check (role in ('owner','admin')),
  created_at timestamptz not null default now()
);

create table if not exists public.settings (
  id         int primary key default 1 check (id = 1),
  pct        int not null default 15    check (pct between 1 and 90),
  unit       int not null default 10000 check (unit between 1000 and 1000000),
  min_order  int not null default 0     check (min_order between 0 and 10000000),
  cap        int not null default 0     check (cap between 0 and 10000000),
  updated_at timestamptz not null default now()
);
insert into public.settings (id) values (1) on conflict do nothing;

create table if not exists public.products (
  id       text primary key,
  brand    text not null,
  name     text not null,
  price    int  not null check (price > 0),
  eligible boolean not null default true,
  active   boolean not null default true,
  sort     int not null default 0
);

create sequence if not exists public.customer_code_seq;

create table if not exists public.customers (
  id         uuid primary key default gen_random_uuid(),
  code       text unique not null,
  phone      text unique not null check (phone ~ '^628[0-9]{7,11}$'),
  nickname   text not null default '' check (char_length(nickname) <= 30),
  source     text not null default 'admin' check (source in ('admin','self')),
  created_at timestamptz not null default now()
);

create table if not exists public.cards (
  id           uuid primary key default gen_random_uuid(),
  customer_id  uuid not null references public.customers(id) on delete cascade,
  code         text unique not null,
  token        text unique not null,
  revoked      text[] not null default '{}',
  stamps       int not null default 0 check (stamps between 0 and 9),
  revision     int not null default 1,
  status       text not null default 'active' check (status in ('active','pending','revoked')),
  act_code     text unique,
  issued_at    timestamptz not null default now(),
  activated_at timestamptz
);
create unique index if not exists cards_one_live_per_customer on public.cards(customer_id) where status <> 'revoked';

create table if not exists public.rewards (
  id              uuid primary key default gen_random_uuid(),
  code            text unique not null,
  card_id         uuid not null references public.cards(id) on delete cascade,
  source_op_id    uuid,
  discount_bps    int not null,
  status          text not null default 'AVAILABLE' check (status in ('AVAILABLE','REDEEMED','CANCELLED')),
  issued_at       timestamptz not null default now(),
  redeemed_at     timestamptz,
  redeem_order_id uuid,
  cancelled_at    timestamptz
);

create table if not exists public.orders (
  id          uuid primary key default gen_random_uuid(),
  ref         text unique not null,
  card_id     uuid not null references public.cards(id) on delete cascade,
  customer_id uuid not null references public.customers(id) on delete cascade,
  type        text not null check (type in ('purchase','renewal')),
  items       jsonb not null default '[]',
  list_total  int not null default 0,
  manual      boolean not null default false,
  gross       int not null,
  discount    int not null default 0,
  paid        int not null,
  method      text not null default 'QRIS GoPay',
  note        text not null default '',
  status      text not null default 'paid' check (status in ('paid','reversed')),
  reward_id   uuid references public.rewards(id),
  created_by  uuid,
  created_at  timestamptz not null default now()
);

create table if not exists public.ops (
  id                 uuid primary key default gen_random_uuid(),
  type               text not null check (type in ('STAMP','REDEEM')),
  order_id           uuid not null references public.orders(id) on delete cascade,
  card_id            uuid not null references public.cards(id) on delete cascade,
  earned             int not null,
  from_stamps        int not null,
  to_stamps          int not null,
  reward_ids         uuid[] not null default '{}',
  redeemed_reward_id uuid,
  reversed           boolean not null default false,
  reverse_reason     text,
  reversed_at        timestamptz,
  actor              uuid,
  created_at         timestamptz not null default now()
);

create table if not exists public.ledger (
  id            bigserial primary key,
  card_id       uuid not null references public.cards(id) on delete cascade,
  op_id         uuid,
  order_id      uuid,
  reward_id     uuid,
  type          text not null check (type in ('EARN','CONSUME','REVERSAL','RESTORE')),
  delta         int not null,
  balance_after int not null,
  created_at    timestamptz not null default now()
);

create table if not exists public.themes (
  id         text primary key,
  name       text not null,
  base       text not null default 'default' check (base in ('default','night','pink')),
  front_img  text not null default '',
  back_img   text not null default '',
  ink        text not null default '#e0353d' check (ink ~ '^#[0-9a-fA-F]{6}$'),
  shape      text not null default 'scallop' check (shape in ('scallop','circle','heart','star','logo')),
  date_from  date,
  date_to    date,
  created_at timestamptz not null default now(),
  check ((date_from is null) = (date_to is null)),
  check (date_from is null or date_from <= date_to)
);

create table if not exists public.design_state (
  id        int primary key default 1 check (id = 1),
  active_id text not null default 'default',
  history   text[] not null default '{}'
);
insert into public.design_state (id) values (1) on conflict do nothing;

create table if not exists public.audit_log (
  id         bigserial primary key,
  actor      uuid,
  action     text not null,
  meta       jsonb not null default '{}',
  created_at timestamptz not null default now()
);

create index if not exists orders_card_idx    on public.orders(card_id, created_at desc);
create index if not exists orders_created_idx on public.orders(created_at desc);
create index if not exists rewards_card_idx   on public.rewards(card_id);
create index if not exists ledger_card_idx    on public.ledger(card_id, created_at);
create index if not exists ops_card_idx       on public.ops(card_id, created_at desc);

-- ---------- HELPER ----------
create or replace function public.is_staff() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.staff where user_id = auth.uid())
$$;

create or replace function public.is_owner() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.staff where user_id = auth.uid() and role = 'owner')
$$;

create or replace function public.err(p_code text, p_msg text) returns void
language plpgsql as $$
begin
  raise exception using message = p_code || '|' || p_msg, errcode = 'P0001';
end $$;

create or replace function public.idr(n int) returns text
language sql immutable as $$
  select 'Rp' || replace(to_char(n, 'FM999,999,999,999'), ',', '.')
$$;

-- kode acak tanpa huruf/angka yang mirip (0/O, 1/I)
create or replace function public.rnd_code(n int) returns text
language plpgsql volatile set search_path = public as $$
declare
  a constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  b bytea; s text := ''; j int;
begin
  while length(s) < n loop
    b := decode(replace(gen_random_uuid()::text, '-', ''), 'hex');
    for j in 0..15 loop
      if j <> 6 and j <> 8 and length(s) < n then
        s := s || substr(a, (get_byte(b, j) % 32) + 1, 1);
      end if;
    end loop;
  end loop;
  return s;
end $$;

create or replace function public.norm_phone(p text) returns text
language plpgsql immutable as $$
declare d text := regexp_replace(coalesce(p, ''), '\D', '', 'g');
begin
  if d like '0%' then d := '62' || substr(d, 2);
  elsif d like '8%' then d := '62' || d;
  end if;
  if d ~ '^628[0-9]{7,11}$' then return d; end if;
  return null;
end $$;

create or replace function public.new_card_code() returns text
language plpgsql volatile set search_path = public as $$
declare c text;
begin
  loop
    c := 'ORI-' || rnd_code(4) || '-' || rnd_code(4);
    exit when not exists (select 1 from cards where code = c);
  end loop;
  return c;
end $$;

create or replace function public.new_token() returns text
language plpgsql volatile set search_path = public as $$
declare t text;
begin
  loop
    t := rnd_code(20);
    exit when not exists (select 1 from cards where token = t or t = any(revoked));
  end loop;
  return t;
end $$;

-- ---------- PELANGGAN (tanpa login, memakai token rahasia di link kartu) ----------
create or replace function public.get_card(p_token text) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare c cards; cu customers;
begin
  select * into c from cards where token = p_token and status <> 'revoked';
  if c.id is null then
    if exists (select 1 from cards where p_token = any(revoked)) then
      return jsonb_build_object('revoked', true);
    end if;
    return null;
  end if;
  select * into cu from customers where id = c.customer_id;
  return jsonb_build_object(
    'card', jsonb_build_object('id', c.id, 'code', c.code, 'token', c.token, 'stamps', c.stamps,
      'revision', c.revision, 'status', c.status,
      'actCode', case when c.status = 'pending' then c.act_code end, 'issuedAt', c.issued_at),
    'customer', jsonb_build_object('code', cu.code, 'nickname', cu.nickname,
      'phoneMasked', '0' || substr(cu.phone, 3, 3) || '••••' || right(cu.phone, 4)),
    'rewards', coalesce((select jsonb_agg(jsonb_build_object('id', r.id, 'code', r.code,
        'discountBps', r.discount_bps, 'status', r.status, 'issuedAt', r.issued_at,
        'redeemedAt', r.redeemed_at) order by r.issued_at desc)
      from rewards r where r.card_id = c.id and r.status <> 'CANCELLED'), '[]'::jsonb),
    'orders', coalesce((select jsonb_agg(t.x order by t.ca desc) from (
        select o.created_at ca, jsonb_build_object('id', o.id, 'ref', o.ref, 'type', o.type,
          'items', o.items, 'paid', o.paid, 'discount', o.discount, 'status', o.status,
          'createdAt', o.created_at, 'earned', coalesce(op.earned, 0)) x
        from orders o left join ops op on op.order_id = o.id
        where o.card_id = c.id order by o.created_at desc limit 50) t), '[]'::jsonb));
end $$;

create or replace function public.set_nickname(p_token text, p_nickname text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare c cards; v text := trim(regexp_replace(coalesce(p_nickname, ''), '\s+', ' ', 'g'));
begin
  if char_length(v) > 30 or v !~ '^[[:alpha:][:digit:] .,''-]*$' then
    perform err('INVALID_INPUT', 'Pakai huruf, angka, spasi, atau tanda . , '' - saja (maks. 30).');
  end if;
  select * into c from cards where token = p_token and status <> 'revoked';
  if c.id is null then perform err('INVALID_CARD', 'Kartu tidak ditemukan.'); end if;
  update customers set nickname = v where id = c.customer_id;
  update cards set revision = revision + 1 where id = c.id returning * into c;
  insert into audit_log (action, meta) values ('NICKNAME_CHANGED', jsonb_build_object('card', c.code));
  return jsonb_build_object('revision', c.revision);
end $$;

create or replace function public.self_join(p_phone text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare ph text := norm_phone(p_phone); cu customers; c cards; act text;
begin
  if ph is null then perform err('INVALID_PHONE', 'Nomor WhatsApp tidak valid. Contoh: 0812 3456 7890.'); end if;
  if exists (select 1 from customers where phone = ph) then
    perform err('DUPLICATE_MEMBER', 'Nomor ini sudah punya kartu member.');
  end if;
  if (select count(*) from customers where source = 'self' and created_at > now() - interval '10 minutes') >= 30 then
    perform err('RATE_LIMITED', 'Terlalu banyak pendaftaran. Coba lagi beberapa menit lagi.');
  end if;
  loop
    act := 'AKTIF-' || rnd_code(4);
    exit when not exists (select 1 from cards where act_code = act);
  end loop;
  insert into customers (code, phone, source)
    values ('ORI-CUS-' || lpad(nextval('customer_code_seq')::text, 6, '0'), ph, 'self') returning * into cu;
  insert into cards (customer_id, code, token, status, act_code)
    values (cu.id, new_card_code(), new_token(), 'pending', act) returning * into c;
  insert into audit_log (action, meta) values ('MEMBER_CREATED', jsonb_build_object('customer', cu.code, 'source', 'self'));
  return jsonb_build_object('actCode', act, 'token', c.token);
end $$;

-- ---------- ADMIN ----------
create or replace function public.admin_create_customer(p_phone text, p_nickname text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare ph text := norm_phone(p_phone); cu customers; c cards; v text := trim(coalesce(p_nickname, ''));
begin
  if not is_staff() then perform err('FORBIDDEN', 'Khusus admin.'); end if;
  if ph is null then perform err('INVALID_PHONE', 'Nomor WhatsApp tidak valid. Contoh: 0812 3456 7890.'); end if;
  if exists (select 1 from customers where phone = ph) then
    perform err('DUPLICATE_MEMBER', 'Nomor ini sudah punya kartu member.');
  end if;
  insert into customers (code, phone, nickname, source)
    values ('ORI-CUS-' || lpad(nextval('customer_code_seq')::text, 6, '0'), ph, left(v, 30), 'admin') returning * into cu;
  insert into cards (customer_id, code, token, activated_at)
    values (cu.id, new_card_code(), new_token(), now()) returning * into c;
  insert into audit_log (actor, action, meta) values (auth.uid(), 'MEMBER_CREATED', jsonb_build_object('customer', cu.code, 'source', 'admin'));
  return jsonb_build_object('customerId', cu.id, 'cardId', c.id);
end $$;

create or replace function public.activate_card(p_card_id uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare c cards; old text;
begin
  if not is_staff() then perform err('FORBIDDEN', 'Khusus admin.'); end if;
  select * into c from cards where id = p_card_id for update;
  if c.id is null or c.status <> 'pending' then perform err('INVALID_CARD', 'Kartu ini tidak sedang menunggu aktivasi.'); end if;
  old := c.token;
  update cards set status = 'active', activated_at = now(), act_code = null,
    revoked = revoked || old, token = new_token(), revision = revision + 1
    where id = c.id returning * into c;
  insert into audit_log (actor, action, meta) values (auth.uid(), 'CARD_ACTIVATED', jsonb_build_object('card', c.code));
  return jsonb_build_object('token', c.token, 'revision', c.revision, 'oldToken', old);
end $$;

create or replace function public.reissue_token(p_card_id uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare c cards; old text;
begin
  if not is_staff() then perform err('FORBIDDEN', 'Khusus admin.'); end if;
  select * into c from cards where id = p_card_id for update;
  if c.id is null or c.status = 'revoked' then perform err('INVALID_CARD', 'Kartu tidak ditemukan.'); end if;
  old := c.token;
  update cards set revoked = revoked || old, token = new_token(), revision = revision + 1
    where id = c.id returning * into c;
  insert into audit_log (actor, action, meta) values (auth.uid(), 'LINK_REISSUED', jsonb_build_object('card', c.code));
  return jsonb_build_object('token', c.token, 'revision', c.revision, 'oldToken', old);
end $$;

create or replace function public.award_order(
  p_card_id uuid, p_ref text, p_amount int, p_items jsonb, p_verified boolean,
  p_reward_id uuid, p_method text, p_note text
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  c cards; s settings; r rewards; p products;
  it jsonb; q int; snap jsonb := '[]'::jsonb; list_total int := 0;
  v_ref text; gross int; disc int := 0; v_paid int; earned int; v_from int; tot int; nr int;
  v_type text; o_id uuid; op_id uuid := gen_random_uuid();
  rids uuid[] := '{}'; codes text[] := '{}'; bal int; rw_id uuid; v_code text; k int;
begin
  if not is_staff() then perform err('FORBIDDEN', 'Khusus admin.'); end if;
  select * into c from cards where id = p_card_id for update;
  if c.id is null then perform err('INVALID_CARD', 'Kartu tidak ditemukan.'); end if;
  if c.status = 'pending' then perform err('CARD_PENDING', 'Kartu ini belum diaktifkan. Aktifkan dulu.'); end if;
  if c.status <> 'active' then perform err('INVALID_CARD', 'Kartu tidak valid atau sudah dinonaktifkan.'); end if;

  v_ref := upper(coalesce(nullif(trim(p_ref), ''),
    'ORD-' || to_char(now() at time zone 'Asia/Makassar', 'YYMMDD') || '-' || rnd_code(4)));
  if exists (select 1 from orders where ref = v_ref) then
    perform err('DUPLICATE_AWARD', 'Transaksi ini sudah pernah diproses.');
  end if;
  if not coalesce(p_verified, false) then perform err('PAYMENT_NOT_VERIFIED', 'Pastikan dana sudah masuk dulu.'); end if;

  select * into s from settings where id = 1;

  for it in select * from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) loop
    p := null;
    select * into p from products where id = it->>'productId';
    q := nullif(it->>'qty', '')::int;
    if p.id is null or q is null or q < 1 or q > 50 then
      perform err('INVALID_INPUT', 'Produk atau jumlah tidak valid.');
    end if;
    snap := snap || jsonb_build_array(jsonb_build_object('productId', p.id, 'name', p.brand || ' ' || p.name,
      'qty', q, 'unit', p.price, 'subtotal', p.price * q));
    list_total := list_total + p.price * q;
  end loop;

  gross := p_amount;
  if gross is null or gross < 1000 or gross > 10000000 then
    perform err('INVALID_AMOUNT', 'Total dibayar harus antara Rp1.000 dan Rp10.000.000.');
  end if;

  if p_reward_id is not null then
    select * into r from rewards where id = p_reward_id for update;
    if r.id is null or r.card_id <> c.id or r.status <> 'AVAILABLE' then
      perform err('REWARD_UNAVAILABLE', 'Voucher tidak tersedia.');
    end if;
    if s.min_order > 0 and gross < s.min_order then
      perform err('MIN_ORDER', 'Voucher bisa dipakai untuk belanja minimal ' || idr(s.min_order) || '.');
    end if;
    disc := floor(gross::numeric * r.discount_bps / 10000);
    if s.cap > 0 then disc := least(disc, s.cap); end if;
  end if;

  v_paid := gross - disc;
  earned := v_paid / s.unit;
  v_from := c.stamps;
  tot := v_from + earned;
  nr := tot / 10;

  v_type := case when jsonb_array_length(snap) > 0 and exists (
      select 1 from orders o, jsonb_array_elements(o.items) e
      where o.card_id = c.id and o.status = 'paid'
        and e->>'productId' in (select x->>'productId' from jsonb_array_elements(snap) x))
    then 'renewal' else 'purchase' end;

  insert into orders (ref, card_id, customer_id, type, items, list_total, manual, gross, discount, paid,
                      method, note, reward_id, created_by)
  values (v_ref, c.id, c.customer_id, v_type, snap, list_total,
          jsonb_array_length(snap) > 0 and list_total <> gross, gross, disc, v_paid,
          left(coalesce(nullif(p_method, ''), 'QRIS GoPay'), 40), left(coalesce(p_note, ''), 80),
          p_reward_id, auth.uid())
  returning id into o_id;

  if p_reward_id is not null then
    update rewards set status = 'REDEEMED', redeemed_at = now(), redeem_order_id = o_id where id = p_reward_id;
  end if;

  if earned > 0 then
    insert into ledger (card_id, op_id, order_id, type, delta, balance_after)
      values (c.id, op_id, o_id, 'EARN', earned, tot);
    bal := tot;
    for k in 1..nr loop
      loop
        v_code := 'RWD-' || rnd_code(6);
        exit when not exists (select 1 from rewards where code = v_code);
      end loop;
      insert into rewards (code, card_id, source_op_id, discount_bps)
        values (v_code, c.id, op_id, s.pct * 100) returning id into rw_id;
      rids := rids || rw_id; codes := codes || v_code; bal := bal - 10;
      insert into ledger (card_id, op_id, reward_id, type, delta, balance_after)
        values (c.id, op_id, rw_id, 'CONSUME', -10, bal);
    end loop;
  end if;

  update cards set stamps = tot % 10, revision = revision + 1 where id = c.id returning * into c;

  insert into ops (id, type, order_id, card_id, earned, from_stamps, to_stamps, reward_ids, redeemed_reward_id, actor)
  values (op_id, case when p_reward_id is null then 'STAMP' else 'REDEEM' end, o_id, c.id, earned,
          v_from, c.stamps, rids, p_reward_id, auth.uid());

  insert into audit_log (actor, action, meta) values (auth.uid(),
    case when p_reward_id is null then 'STAMP' else 'REDEEM' end,
    jsonb_build_object('order', v_ref, 'earned', earned, 'rewards', nr));

  return jsonb_build_object('opId', op_id, 'orderRef', v_ref, 'earned', earned, 'from', v_from, 'to', c.stamps,
    'issued', nr, 'rewardCodes', to_jsonb(codes), 'revision', c.revision, 'token', c.token,
    'discount', disc, 'paid', v_paid, 'discountBps', coalesce(s.pct * 100, 0));
end $$;

create or replace function public.undo_op(p_op_id uuid, p_reason text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare o ops; c cards; n int; bal int; before int; rw_id uuid; v_code text;
begin
  if not is_staff() then perform err('FORBIDDEN', 'Khusus admin.'); end if;
  select * into o from ops where id = p_op_id for update;
  if o.id is null or o.reversed then perform err('RESOURCE_NOT_FOUND', 'Operasi tidak ditemukan atau sudah dibatalkan.'); end if;
  if trim(coalesce(p_reason, '')) = '' then perform err('INVALID_INPUT', 'Alasan undo wajib diisi.'); end if;
  if now() - o.created_at > interval '5 minutes' and not is_owner() then
    perform err('OWNER_REVIEW_REQUIRED', 'Lewat batas 5 menit. Koreksi ini perlu owner.');
  end if;
  if o.type = 'REDEEM' and not is_owner() then
    perform err('OWNER_REVIEW_REQUIRED', 'Order yang memakai voucher perlu dikoreksi owner.');
  end if;
  if exists (select 1 from rewards where id = any(o.reward_ids) and status <> 'AVAILABLE') then
    perform err('OWNER_REVIEW_REQUIRED', 'Voucher dari transaksi ini sudah dipakai. Perlu dicek owner.');
  end if;

  select * into c from cards where id = o.card_id for update;
  n := cardinality(o.reward_ids);
  before := c.stamps;
  bal := c.stamps + 10 * n - o.earned;
  if bal < 0 then
    perform err('OWNER_REVIEW_REQUIRED', 'Stamp dari transaksi ini sudah terpakai untuk voucher lain. Perlu dicek owner.');
  end if;

  update rewards set status = 'CANCELLED', cancelled_at = now() where id = any(o.reward_ids);
  if n > 0 then
    insert into ledger (card_id, op_id, type, delta, balance_after) values (c.id, o.id, 'RESTORE', 10 * n, before + 10 * n);
  end if;
  insert into ledger (card_id, op_id, type, delta, balance_after) values (c.id, o.id, 'REVERSAL', -o.earned, bal);
  while bal >= 10 loop
    loop
      v_code := 'RWD-' || rnd_code(6);
      exit when not exists (select 1 from rewards where code = v_code);
    end loop;
    insert into rewards (code, card_id, source_op_id, discount_bps)
      values (v_code, c.id, o.id, (select pct * 100 from settings where id = 1)) returning id into rw_id;
    bal := bal - 10;
    insert into ledger (card_id, op_id, reward_id, type, delta, balance_after) values (c.id, o.id, rw_id, 'CONSUME', -10, bal);
  end loop;
  if o.redeemed_reward_id is not null then
    update rewards set status = 'AVAILABLE', redeemed_at = null, redeem_order_id = null where id = o.redeemed_reward_id;
  end if;

  update cards set stamps = bal, revision = revision + 1 where id = c.id returning * into c;
  update ops set reversed = true, reverse_reason = trim(p_reason), reversed_at = now() where id = o.id;
  update orders set status = 'reversed' where id = o.order_id;
  insert into audit_log (actor, action, meta) values (auth.uid(), 'UNDO', jsonb_build_object('op', o.id, 'reason', trim(p_reason)));
  return jsonb_build_object('from', before, 'to', bal, 'removed', o.earned, 'revision', c.revision, 'token', c.token);
end $$;

create or replace function public.save_settings(p_pct int, p_unit int, p_min int, p_cap int) returns jsonb
language plpgsql security definer set search_path = public as $$
declare old settings; s settings;
begin
  if not is_staff() then perform err('FORBIDDEN', 'Khusus admin.'); end if;
  select * into old from settings where id = 1;
  update settings set pct = p_pct, unit = p_unit, min_order = coalesce(p_min, 0), cap = coalesce(p_cap, 0), updated_at = now()
    where id = 1 returning * into s;
  insert into audit_log (actor, action, meta) values (auth.uid(), 'PROGRAM_SETTINGS',
    jsonb_build_object('from', to_jsonb(old), 'to', to_jsonb(s)));
  return to_jsonb(s);
end $$;

-- ---------- KEAMANAN (Row Level Security) ----------
alter table public.staff        enable row level security;
alter table public.settings     enable row level security;
alter table public.products     enable row level security;
alter table public.customers    enable row level security;
alter table public.cards        enable row level security;
alter table public.rewards      enable row level security;
alter table public.orders       enable row level security;
alter table public.ops          enable row level security;
alter table public.ledger       enable row level security;
alter table public.themes       enable row level security;
alter table public.design_state enable row level security;
alter table public.audit_log    enable row level security;

drop policy if exists staff_read on public.staff;
create policy staff_read on public.staff for select to authenticated using (user_id = auth.uid() or public.is_staff());

-- data publik: pengaturan program, pricelist, tema kartu
drop policy if exists pub_read on public.settings;
create policy pub_read on public.settings for select to anon, authenticated using (true);
drop policy if exists pub_read on public.products;
create policy pub_read on public.products for select to anon, authenticated using (true);
drop policy if exists pub_read on public.themes;
create policy pub_read on public.themes for select to anon, authenticated using (true);
drop policy if exists pub_read on public.design_state;
create policy pub_read on public.design_state for select to anon, authenticated using (true);

-- admin boleh mengubah tema, status desain, dan pricelist
drop policy if exists staff_write on public.themes;
create policy staff_write on public.themes for all to authenticated using (public.is_staff()) with check (public.is_staff());
drop policy if exists staff_write on public.design_state;
create policy staff_write on public.design_state for all to authenticated using (public.is_staff()) with check (public.is_staff());
drop policy if exists staff_write on public.products;
create policy staff_write on public.products for all to authenticated using (public.is_staff()) with check (public.is_staff());

-- data pelanggan hanya bisa dibaca admin; perubahan hanya lewat fungsi di atas
do $$ declare t text; begin
  foreach t in array array['customers','cards','rewards','orders','ops','ledger','audit_log'] loop
    execute format('drop policy if exists staff_read on public.%I', t);
    execute format('create policy staff_read on public.%I for select to authenticated using (public.is_staff())', t);
  end loop;
end $$;

-- ---------- HAK AKSES API ----------
grant usage on schema public to anon, authenticated;
grant select on public.settings, public.products, public.themes, public.design_state to anon, authenticated;
grant select on public.staff, public.customers, public.cards, public.rewards, public.orders,
                public.ops, public.ledger, public.audit_log to authenticated;
grant insert, update, delete on public.themes, public.design_state, public.products to authenticated;

revoke execute on all functions in schema public from public;
grant execute on function public.get_card(text), public.set_nickname(text, text), public.self_join(text)
  to anon, authenticated;
grant execute on function public.is_staff(), public.is_owner(),
  public.admin_create_customer(text, text), public.activate_card(uuid), public.reissue_token(uuid),
  public.award_order(uuid, text, int, jsonb, boolean, uuid, text, text),
  public.undo_op(uuid, text), public.save_settings(int, int, int, int)
  to authenticated;

-- ---------- PENYIMPANAN GAMBAR DESAIN KARTU ----------
insert into storage.buckets (id, name, public) values ('card-designs', 'card-designs', true)
  on conflict (id) do nothing;
drop policy if exists card_designs_staff_insert on storage.objects;
create policy card_designs_staff_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'card-designs' and public.is_staff());
drop policy if exists card_designs_staff_update on storage.objects;
create policy card_designs_staff_update on storage.objects for update to authenticated
  using (bucket_id = 'card-designs' and public.is_staff());
drop policy if exists card_designs_staff_delete on storage.objects;
create policy card_designs_staff_delete on storage.objects for delete to authenticated
  using (bucket_id = 'card-designs' and public.is_staff());

-- ---------- PRICELIST ORINIMO ----------
insert into public.products (id, brand, name, price, sort) values
 ('netflix-1p1u-7-hari','Netflix','1P1U 7 hari',12000,1),
 ('netflix-1p1u-1-bulan','Netflix','1P1U 1 bulan',37000,2),
 ('netflix-semiprivate-1-bulan','Netflix','Semiprivate 1 bulan',40000,3),
 ('netflix-1p2u-1-bulan','Netflix','1P2U 1 bulan',27000,4),
 ('disney-1-hari','Disney+','1 hari',4000,10),
 ('disney-3-hari','Disney+','3 hari',8000,11),
 ('disney-7-hari','Disney+','7 hari',12000,12),
 ('disney-1-bulan','Disney+','1 bulan',25000,13),
 ('iqiyi-sharing-1-bulan','iQIYI','Sharing 1 bulan',10000,20),
 ('iqiyi-anti-limit-1-bulan','iQIYI','Anti limit 1 bulan',15000,21),
 ('iqiyi-private-1-bulan','iQIYI','Private 1 bulan',37000,22),
 ('chatgpt-sharing-go-1-bulan','ChatGPT','Sharing Go 1 bulan',30000,30),
 ('chatgpt-sharing-plus-1-bulan','ChatGPT','Sharing Plus 1 bulan',45000,31),
 ('prime-sharing-1-bulan','Prime','Sharing 1 bulan',15000,40),
 ('prime-private-1-bulan','Prime','Private 1 bulan',20000,41),
 ('canva-1-hari','Canva','1 hari',1000,50),
 ('canva-3-hari','Canva','3 hari',2000,51),
 ('canva-7-hari','Canva','7 hari',3000,52),
 ('canva-1-bulan','Canva','1 bulan',6000,53),
 ('canva-1-tahun','Canva','1 tahun',30000,54),
 ('zoom-1-jam','Zoom','1 jam',2000,60),
 ('zoom-3-jam','Zoom','3 jam',4000,61),
 ('zoom-1-hari','Zoom','1 hari',7000,62),
 ('zoom-7-hari','Zoom','7 hari',15000,63),
 ('viu-1-bulan','Viu','1 bulan',10000,70),
 ('viu-2-bulan','Viu','2 bulan',12000,71),
 ('viu-antilimit-1-bulan','Viu','Antilimit 1 bulan',15000,72),
 ('viu-antilimit-2-bulan','Viu','Antilimit 2 bulan',18000,73),
 ('capcut-sharing-2u-7-hari','CapCut','Sharing 2U 7 hari',8000,80),
 ('capcut-sharing-2u-1-bulan','CapCut','Sharing 2U 1 bulan',20000,81),
 ('capcut-private-7-hari','CapCut','Private 7 hari',13000,82),
 ('capcut-private-1-bulan','CapCut','Private 1 bulan',35000,83),
 ('dramabox-sharing-1-bulan','Dramabox','Sharing 1 bulan',15000,90),
 ('loklok-sharing-1-bulan','Loklok','Sharing 1 bulan',20000,100),
 ('scribd-sharing-1-bulan','Scribd','Sharing 1 bulan',10000,110),
 ('scribd-private-1-bulan','Scribd','Private 1 bulan',22000,111),
 ('wetv-1-bulan','WeTV','1 bulan',13000,120),
 ('youtube-1-bulan','YouTube','1 bulan',10000,130),
 ('vidio-platinum-1-bulan','Vidio','Platinum 1 bulan',20000,140),
 ('spotify-akun-seller-1-bulan','Spotify','Akun seller 1 bulan',20000,150),
 ('hbo-1-bulan','HBO','1 bulan',27000,160),
 ('getcontact-1-bulan','GetContact','1 bulan',17000,170),
 ('meitu-private-1-minggu','Meitu','Private 1 minggu',10000,180),
 ('meitu-private-2-minggu','Meitu','Private 2 minggu',15000,181)
on conflict (id) do nothing;

-- =====================================================================
-- SETELAH MENJALANKAN FILE INI:
-- 1. Dashboard → Authentication → Users → Add user (email + password owner).
-- 2. Jadikan user itu owner (ganti emailnya):
--      insert into public.staff (user_id, role)
--      select id, 'owner' from auth.users where email = 'owner@contoh.com';
-- 3. Admin lain: buat user baru, lalu insert dengan role 'admin'.
-- =====================================================================
