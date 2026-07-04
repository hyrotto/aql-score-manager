-- =============================================================
-- issue #17 Step 2: アクションログを専用テーブル room_actions に分離する
-- =============================================================
--
-- これまでは 1 手進めるたびに rooms.state（currentState + actions 全体）を
-- 丸ごと書き換えていたため、試合進行に伴い書き込みペイロードが肥大化し、
-- 楽観的排他制御（revision）のリトライも頻発していた。
--
-- 本マイグレーションでアクションログを INSERT 専用の room_actions テーブルに
-- 移し、通常の操作は 1 行 INSERT だけで済むようにする。
-- rooms.state はスナップショット（baseState）専用となり、通常操作では書き換えない。
--
-- 実行方法: Supabase ダッシュボード > SQL Editor に本ファイルの内容を貼り付けて実行してください。
--
-- 注意: このスクリプトは「新規テーブル / ポリシー / Realtime 設定の追加」のみで、
--       既存データ（rooms や room_actions の中身）を削除・変更しません。
--       DROP 文を使わず、既に存在する場合は何もしない冪等な構成にしてあります。
--       （何度実行してもエラーになりません。）

-- 1. アクションログ専用テーブル ------------------------------------------------
--   id       : LoggedAction の UUID（クライアント生成）。PK なので二重 INSERT は弾かれる。
--   room_id  : どのルームのアクションか。ルーム削除時に連鎖削除。
--   seq      : サーバ採番の単調増加値。全クライアントで同じ順序に収束させるために使う。
--   client_id: どの端末の操作か（UNDO の対象判定に使用）。
--   action   : GameAction 本体（JSON）。
create table if not exists room_actions (
  id         uuid        primary key,
  room_id    text        not null references rooms(id) on delete cascade,
  seq        bigint      generated always as identity,
  client_id  text        not null,
  action     jsonb       not null,
  created_at timestamptz not null default now()
);

-- ルーム単位で seq 昇順に引くためのインデックス
create index if not exists room_actions_room_seq_idx
  on room_actions (room_id, seq);

-- 2. Row Level Security（既存 rooms と同様、認証なしアプリなので anon フルアクセス） --
alter table room_actions enable row level security;

-- ポリシーは「存在しなければ作成」する（重複時は握りつぶす）ことで DROP を避ける
do $$
begin
  create policy "room_actions anon select" on room_actions
    for select using (true);
exception
  when duplicate_object then null;
end $$;

do $$
begin
  create policy "room_actions anon insert" on room_actions
    for insert with check (true);
exception
  when duplicate_object then null;
end $$;

-- RESET_GAME 時に該当ルームの履歴を破棄するため delete も許可する
do $$
begin
  create policy "room_actions anon delete" on room_actions
    for delete using (true);
exception
  when duplicate_object then null;
end $$;

-- 3. Realtime 配信対象に追加（INSERT を各クライアントへブロードキャストするため） ----
--   既に追加済みの場合は duplicate_object 例外になるため握りつぶす（冪等化）。
do $$
begin
  alter publication supabase_realtime add table room_actions;
exception
  when duplicate_object then null;
end $$;
