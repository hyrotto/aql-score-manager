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
  | { type: 'UNDO' }
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
};

/** DBの rooms テーブルの state カラムに保存されるオブジェクト構造 */
export type DbRoomState = {
  currentState: GameState;
  actions: LoggedAction[];
};

/** DBから取得した最新のルーム情報（楽観的排他制御用の revision を含む） */
export type RoomSnapshot = {
  state: GameState;
  actions: LoggedAction[];
  revision: number;
};
