import { GameState, LoggedAction } from './types';
import { gameReducer } from './gameReducer';
import { createInitialGameState } from './gameLogic';
import { DEFAULT_CONFIG } from './constants';

/**
 * アクション履歴から現在のゲーム状態（GameState）を再計算（リプレイ）する関数
 * @param actions アクションログの配列
 * @returns 再計算された最終的な GameState
 */
export function replayActions(actions: LoggedAction[]): GameState {
  // 初期状態を生成
  let state = createInitialGameState(DEFAULT_CONFIG);

  // actions を古い順にソート（タイムスタンプで昇順ソート）
  const sortedActions = [...actions].sort((a, b) => a.timestamp - b.timestamp);

  // アクションを順番に適用する
  for (const loggedAction of sortedActions) {
    state = gameReducer(state, loggedAction.action);
  }

  // リプレイ後の状態の history を、DB上のアクションログをベースにしたものに補正（または不要なら空に）
  // ここでは互換性のため、元の state.history の構造は gameReducer が生成したものをそのまま使用します。
  return state;
}
