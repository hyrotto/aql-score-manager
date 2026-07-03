-- 楽観的排他制御（optimistic concurrency control）のための revision 列を追加する
-- 複数クライアントが同時に rooms.state を書き換えることで、他人の操作が
-- 上書きされて消えてしまう事故（枠数の巻き戻り／失格プレイヤーの復活等）を防ぐために使用する。
--
-- 実行方法: Supabase ダッシュボード > SQL Editor で本ファイルの内容を貼り付けて実行してください。

alter table rooms
  add column if not exists revision integer not null default 0;
