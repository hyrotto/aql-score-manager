// =============================================
// AQL 10by10by10mini 定数定義
// =============================================

import { GameConfig } from './types';

/** デフォルトのゲーム設定 */
export const DEFAULT_CONFIG: GameConfig = {
  /** 勝利に必要なポイント（積） */
  winningScore: 200,
  /** 最大問題数 */
  maxQuestions: 40,
  /** 枠の数（1〜5） */
  slotCount: 5,
};

/** 各枠の初期ポイント */
export const INITIAL_SLOT_POINTS = 1;

/** 1枠あたりの最大プレイヤー数 */
export const MAX_PLAYERS_PER_SLOT = 2;

/** バースト敗北時のスコア */
export const BURST_SCORE = 1;

/** 最大誤答数（これに達すると解答権喪失） */
export const MAX_WRONG_COUNT = 2;
