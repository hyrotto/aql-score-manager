import { GameState, LoggedAction } from './types';
import { gameReducer } from './gameReducer';

/**
 * アクションログの安定ソート用比較関数。
 * サーバ採番の seq が確定しているものを優先し（seq 昇順）、
 * seq 未確定（ローカルで楽観追加した直後）のものは最後に回す（timestamp 昇順）。
 */
export function compareActions(a: LoggedAction, b: LoggedAction): number {
  if (a.seq != null && b.seq != null) return a.seq - b.seq;
  if (a.seq != null) return -1; // seq 確定は未確定より前
  if (b.seq != null) return 1;
  return a.timestamp - b.timestamp;
}

/**
 * baseState（スナップショット）に対してアクション履歴を適用し、
 * 現在のゲーム状態（GameState）を再計算（リプレイ）する関数。
 *
 * UNDO は追記型（tombstone）として扱う。ログ中の UNDO アクションは状態遷移を持たず、
 * その targetId が指す過去のアクションを「無かったこと」にする。
 * これにより room_actions を INSERT 専用に保ったまま取り消しを表現できる。
 *
 * @param baseState 起点となるスナップショット状態
 * @param actions baseState 以降に適用するアクションログの配列
 * @returns 再計算された最終的な GameState
 */
export function replayActions(baseState: GameState, actions: LoggedAction[]): GameState {
  const sorted = [...actions].sort(compareActions);

  // tombstone: UNDO の targetId を集約し、取り消し対象のアクション id を求める
  const undoneIds = new Set<string>();
  for (const la of sorted) {
    if (la.action.type === 'UNDO' && la.action.targetId) {
      undoneIds.add(la.action.targetId);
    }
  }

  // baseState を起点にする（reducer は新しいオブジェクトを返すため baseState 自体は変更されない）
  let state = baseState;
  for (const la of sorted) {
    if (la.action.type === 'UNDO') continue;   // UNDO 自身は状態遷移を持たない
    if (undoneIds.has(la.id)) continue;        // 取り消されたアクションはスキップ
    state = gameReducer(state, la.action);
  }

  return state;
}
