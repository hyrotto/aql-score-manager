// =============================================
// AQL 10by10by10mini 型定義
// =============================================

/** チーム識別子 */
export type TeamId = 'A' | 'B';

/** 枠番号（1〜5） */
export type SlotNumber = 1 | 2 | 3 | 4 | 5;

/** 試合状態 */
export type GameStatus = 'waiting' | 'playing' | 'finished';

/** 勝敗結果 */
export type GameResult = {
  winner: TeamId | 'draw';
  reason: 'score_reached' | 'burst' | 'time_up';
  scoreA: number;
  scoreB: number;
};

/** 1つの枠番の状態 */
export type SlotState = {
  /** 枠番号 */
  slotNumber: SlotNumber;
  /** 現在のポイント */
  points: number;
  /** 誤答数（0, 1, 2） */
  wrongCount: number;
  /** 解答権があるか */
  isActive: boolean;
  /** この枠に割り当てられたプレイヤー名 */
  players: string[];
};

/** 1チームの状態 */
export type TeamState = {
  /** チームID */
  teamId: TeamId;
  /** 5つの枠番の状態 */
  slots: SlotState[];
  /** 総得点（5枠の積） - 計算値 */
  totalScore: number;
};

/** ゲーム設定（可変パラメータ） */
export type GameConfig = {
  /** 勝利に必要なポイント */
  winningScore: number;
  /** 最大問題数 */
  maxQuestions: number;
  /** 枠の数 */
  slotCount: number;
};

/** ゲーム全体の状態 */
export type GameState = {
  /** 試合状態 */
  status: GameStatus;
  /** 現在の問題番号 */
  currentQuestion: number;
  /** Aチームの状態 */
  teamA: TeamState;
  /** Bチームの状態 */
  teamB: TeamState;
  /** ゲーム設定 */
  config: GameConfig;
  /** 試合結果（finishedの場合のみ） */
  result: GameResult | null;
  /** 問題番号を公開するか（司会者が制御） */
  isQuestionPublic: boolean;
  /** 操作履歴（Undo用） */
  history: GameState[];
  /** 現在司会席にいるプレイヤー名 */
  moderatorName: string | null;
};

/** ゲームアクションの種類 */
export type GameAction =
  | { type: 'CORRECT'; team: TeamId; slotNumber: SlotNumber }
  | { type: 'WRONG'; team: TeamId; slotNumber: SlotNumber }
  // UNDO は追記型（tombstone）: targetId で「取り消す対象アクション」を指す。
  // リプレイ時に targetId のアクションと UNDO 自身を除外して状態を再計算する。
  | { type: 'UNDO'; targetId?: string }
  | { type: 'SET_PLAYER'; team: TeamId; slotNumber: SlotNumber; playerName: string; playerIndex: number }
  | { type: 'REMOVE_PLAYER'; team: TeamId; slotNumber: SlotNumber; playerIndex: number }
  | { type: 'SWAP_SLOTS'; fromTeam: TeamId; fromSlot: SlotNumber; toTeam: TeamId; toSlot: SlotNumber }
  | { type: 'SET_POINTS'; team: TeamId; slotNumber: SlotNumber; points: number }
  | { type: 'SET_WRONG_COUNT'; team: TeamId; slotNumber: SlotNumber; wrongCount: number }
  | { type: 'SET_QUESTION'; question: number }
  | { type: 'TOGGLE_QUESTION_PUBLIC' }
  | { type: 'RESET_GAME' }
  | { type: 'START_GAME' }
  | { type: 'UPDATE_CONFIG'; config: Partial<GameConfig> }
  | { type: 'SET_STATE'; state: GameState }
  | { type: 'SET_MODERATOR'; name: string | null }
  | { type: 'THROUGH' };

/** ログに記録されるアクション（誰が・いつ・何のアクションを実行したか） */
export type LoggedAction = {
  id: string;          // アクションを一意に特定する UUID
  clientId: string;    // 操作したクライアントのID
  timestamp: number;   // アクションが実行された時刻
  action: GameAction;  // 実際のアクション内容
  /**
   * room_actions.seq（サーバ採番の単調増加値）。全クライアントで同じ順序に
   * 収束させるための並び順キー。ローカルで楽観的に追加した直後は未確定（undefined）で、
   * Realtime で自分の INSERT が返ってきた時点で確定する。
   */
  seq?: number;
};

/** room_actions テーブルの 1 行（DBから取得した生の形） */
export type RoomActionRow = {
  id: string;
  room_id: string;
  seq: number;
  client_id: string;
  action: GameAction;
  created_at: string;
};

/** DBの rooms テーブルの state カラムに保存されるオブジェクト構造 */
export type DbRoomState = {
  currentState: GameState;
  /**
   * actions の起点となるスナップショット状態。
   * currentState = replayActions(baseState, actions) の関係が常に成り立つ。
   * （古いデータには存在しないため、読み込み側で初期状態にフォールバックする）
   */
  baseState?: GameState;
  /**
   * 【旧形式・後方互換用】Step 1 まではアクションログを rooms.state 内に保持していた。
   * Step 2 以降はアクションログを room_actions テーブルに分離したため、
   * 新規書き込みでは使用しない（読み込み時の移行判定にのみ参照する）。
   */
  actions?: LoggedAction[];
};

/** DBから取得した最新のルーム情報（楽観的排他制御用の revision を含む） */
export type RoomSnapshot = {
  state: GameState;
  actions: LoggedAction[];
  /** actions の起点となるスナップショット状態（切り詰めで畳み込まれた古い操作を含む） */
  baseState: GameState;
  revision: number;
};
