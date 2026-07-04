import { GameState, LoggedAction } from './types';
import { gameReducer } from './gameReducer';
import { MAX_ACTIONS } from './constants';

/**
 * baseState（スナップショット）に対してアクション履歴を適用し、
 * 現在のゲーム状態（GameState）を再計算（リプレイ）する関数。
 *
 * actions は「試合開始からの全履歴」ではなく直近 N 件に切り詰められている場合があるため、
 * 初期状態ではなく baseState（切り詰めで畳み込まれた古い操作を含む状態）を起点とする。
 *
 * @param baseState 起点となるスナップショット状態
 * @param actions baseState 以降に適用するアクションログの配列
 * @returns 再計算された最終的な GameState
 */
export function replayActions(baseState: GameState, actions: LoggedAction[]): GameState {
  // baseState を起点にする（reducer は新しいオブジェクトを返すため baseState 自体は変更されない）
  let state = baseState;

  // actions を古い順にソート（タイムスタンプで昇順ソート）
  const sortedActions = [...actions].sort((a, b) => a.timestamp - b.timestamp);

  // アクションを順番に適用する
  for (const loggedAction of sortedActions) {
    state = gameReducer(state, loggedAction.action);
  }

  return state;
}

/**
 * アクションログを直近 max 件に切り詰める。
 * あふれた古いアクションは baseState に順次畳み込むことで、
 * currentState = replayActions(baseState, actions) の関係を保ったまま
 * DBへ書き込むペイロードを一定サイズに抑える。
 *
 * @param baseState 現在の起点スナップショット
 * @param actions 切り詰め対象のアクションログ
 * @param max 保持する最大件数（省略時は MAX_ACTIONS）
 * @returns 畳み込み後の baseState と、直近 max 件に切り詰めた actions
 */
export function truncateActions(
  baseState: GameState,
  actions: LoggedAction[],
  max: number = MAX_ACTIONS
): { baseState: GameState; actions: LoggedAction[] } {
  if (actions.length <= max) {
    return { baseState, actions };
  }

  // 時系列順に揃えてから、古いものを baseState へ畳み込む
  const sorted = [...actions].sort((a, b) => a.timestamp - b.timestamp);
  const dropCount = sorted.length - max;

  let newBase = baseState;
  for (let i = 0; i < dropCount; i++) {
    newBase = gameReducer(newBase, sorted[i].action);
  }

  return { baseState: newBase, actions: sorted.slice(dropCount) };
}
