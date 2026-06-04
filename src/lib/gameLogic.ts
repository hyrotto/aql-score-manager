// =============================================
// AQL 10by10by10mini コアゲームロジック
// =============================================
// UIに依存しない純粋関数群

import {
  GameState,
  GameResult,
  TeamId,
  TeamState,
  SlotState,
  SlotNumber,
  GameConfig,
} from './types';
import {
  DEFAULT_CONFIG,
  INITIAL_SLOT_POINTS,
  MAX_WRONG_COUNT,
  BURST_SCORE,
} from './constants';

// ---- 初期化 ----

/** 1つの枠番の初期状態を生成 */
export function createInitialSlot(slotNumber: SlotNumber): SlotState {
  return {
    slotNumber,
    points: INITIAL_SLOT_POINTS,
    wrongCount: 0,
    isActive: true,
    players: [],
  };
}

/** 1チームの初期状態を生成 */
export function createInitialTeam(teamId: TeamId, slotCount: number): TeamState {
  const slots = Array.from({ length: slotCount }, (_, i) =>
    createInitialSlot((i + 1) as SlotNumber)
  );
  return {
    teamId,
    slots,
    totalScore: calculateTotalScore(slots),
  };
}

/** ゲーム全体の初期状態を生成 */
export function createInitialGameState(config: GameConfig = DEFAULT_CONFIG): GameState {
  return {
    status: 'waiting',
    currentQuestion: 0,
    teamA: createInitialTeam('A', config.slotCount),
    teamB: createInitialTeam('B', config.slotCount),
    config,
    result: null,
    isQuestionPublic: false,
    history: [],
    moderatorName: null,
  };
}

// ---- 計算 ----

/** 5枠のポイントの積を計算 */
export function calculateTotalScore(slots: SlotState[]): number {
  return slots.reduce((acc, slot) => acc * slot.points, 1);
}

/** チームの総得点を再計算 */
export function recalculateTeamScore(team: TeamState): TeamState {
  return {
    ...team,
    totalScore: calculateTotalScore(team.slots),
  };
}

/** 指定枠が「リーチ」状態か判定（あと1正解で勝利スコアに到達） */
export function isReach(team: TeamState, slotNumber: SlotNumber, winningScore: number): boolean {
  const slot = team.slots.find(s => s.slotNumber === slotNumber);
  if (!slot || !slot.isActive) return false;

  // 仮に+1した場合の総得点を計算
  const hypotheticalSlots = team.slots.map(s =>
    s.slotNumber === slotNumber ? { ...s, points: s.points + 1 } : s
  );
  return calculateTotalScore(hypotheticalSlots) >= winningScore;
}

/** チームが全枠解答権喪失（バースト）か判定 */
export function isBurst(team: TeamState): boolean {
  return team.slots.every(slot => !slot.isActive);
}

// ---- 正解処理 ----

/** 正解時の処理：指定枠のポイントを+1 */
export function processCorrect(
  state: GameState,
  team: TeamId,
  slotNumber: SlotNumber
): GameState {
  const targetTeam = team === 'A' ? state.teamA : state.teamB;
  const slot = targetTeam.slots.find(s => s.slotNumber === slotNumber);

  // 解答権がない場合は何もしない
  if (!slot || !slot.isActive) return state;

  // 枠のポイントを+1
  const updatedSlots = targetTeam.slots.map(s =>
    s.slotNumber === slotNumber ? { ...s, points: s.points + 1 } : s
  );
  const updatedTeam = recalculateTeamScore({ ...targetTeam, slots: updatedSlots });

  let newState: GameState = {
    ...state,
    currentQuestion: state.currentQuestion + 1,
    teamA: team === 'A' ? updatedTeam : state.teamA,
    teamB: team === 'B' ? updatedTeam : state.teamB,
  };

  // 勝利判定
  if (updatedTeam.totalScore >= state.config.winningScore) {
    const otherTeam = team === 'A' ? newState.teamB : newState.teamA;
    newState = {
      ...newState,
      status: 'finished',
      result: {
        winner: team,
        reason: 'score_reached',
        scoreA: team === 'A' ? state.config.winningScore : otherTeam.totalScore,
        scoreB: team === 'B' ? state.config.winningScore : otherTeam.totalScore,
      },
    };
  }

  return newState;
}

// ---- 誤答処理 ----

/** 誤答時の処理 */
export function processWrong(
  state: GameState,
  team: TeamId,
  slotNumber: SlotNumber
): GameState {
  const targetTeam = team === 'A' ? state.teamA : state.teamB;
  const otherTeamKey = team === 'A' ? 'teamB' : 'teamA';
  const otherTeam = state[otherTeamKey];
  const slot = targetTeam.slots.find(s => s.slotNumber === slotNumber);

  // 解答権がない場合は何もしない
  if (!slot || !slot.isActive) return state;

  const newWrongCount = slot.wrongCount + 1;

  let updatedSlots: SlotState[];
  if (newWrongCount >= MAX_WRONG_COUNT) {
    // 2回目の誤答：ポイント1に戻し、解答権剥奪
    updatedSlots = targetTeam.slots.map(s =>
      s.slotNumber === slotNumber
        ? { ...s, points: INITIAL_SLOT_POINTS, wrongCount: newWrongCount, isActive: false }
        : s
    );
  } else {
    // 1回目の誤答：ポイント1に戻す
    updatedSlots = targetTeam.slots.map(s =>
      s.slotNumber === slotNumber
        ? { ...s, points: INITIAL_SLOT_POINTS, wrongCount: newWrongCount }
        : s
    );
  }

  const updatedTeam = recalculateTeamScore({ ...targetTeam, slots: updatedSlots });

  // 相手チームの解答権復活処理
  const restoredOtherTeam = restoreAnswerRights(otherTeam);

  let newState: GameState = {
    ...state,
    currentQuestion: state.currentQuestion + 1,
    teamA: team === 'A' ? updatedTeam : restoredOtherTeam,
    teamB: team === 'B' ? updatedTeam : restoredOtherTeam,
  };

  // バースト判定
  if (isBurst(updatedTeam)) {
    const winnerTeam = team === 'A' ? 'B' : 'A';
    newState = {
      ...newState,
      status: 'finished',
      result: {
        winner: winnerTeam,
        reason: 'burst',
        scoreA: team === 'A' ? BURST_SCORE : state.config.winningScore,
        scoreB: team === 'B' ? BURST_SCORE : state.config.winningScore,
      },
    };
  }

  return newState;
}

// ---- 解答権復活 ----

/**
 * 相手チームが誤答した場合、自チームの解答権喪失枠を復活させる
 * 復活時は「1回目の誤答（1✕）」状態
 */
export function restoreAnswerRights(team: TeamState): TeamState {
  const hasInactiveSlots = team.slots.some(s => !s.isActive);
  if (!hasInactiveSlots) return team;

  const restoredSlots = team.slots.map(s =>
    !s.isActive
      ? { ...s, isActive: true, wrongCount: 1 } // 1✕状態で復活
      : s
  );

  return recalculateTeamScore({ ...team, slots: restoredSlots });
}

// ---- 問題数上限 ----

/** 問題数上限到達時の勝敗判定 */
export function checkQuestionLimit(state: GameState): GameState {
  const scoreA = state.teamA.totalScore;
  const scoreB = state.teamB.totalScore;

  let winner: TeamId | 'draw';
  if (scoreA > scoreB) {
    winner = 'A';
  } else if (scoreB > scoreA) {
    winner = 'B';
  } else {
    winner = 'draw';
  }

  return {
    ...state,
    status: 'finished',
    result: {
      winner,
      reason: 'time_up',
      scoreA,
      scoreB,
    },
  };
}

// ---- プレイヤー管理 ----

/** プレイヤーを枠に追加 */
export function addPlayer(
  state: GameState,
  team: TeamId,
  slotNumber: SlotNumber,
  playerName: string,
  playerIndex: number
): GameState {
  // 名前が空でない場合、すべての枠を検索して同じ名前があれば削除（離席）する
  let currentTeamA = state.teamA;
  let currentTeamB = state.teamB;

  if (playerName !== '') {
    const removePlayerFromName = (targetTeam: TeamState): TeamState => {
      let changed = false;
      const updatedSlots = targetTeam.slots.map(s => {
        if (s.players.includes(playerName)) {
          changed = true;
          // 一致する名前をすべて空文字にする
          return {
            ...s,
            players: s.players.map(p => p === playerName ? '' : p)
          };
        }
        return s;
      });
      return changed ? { ...targetTeam, slots: updatedSlots } : targetTeam;
    };

    currentTeamA = removePlayerFromName(currentTeamA);
    currentTeamB = removePlayerFromName(currentTeamB);
  }

  // 追加対象のチームを選択
  const targetTeam = team === 'A' ? currentTeamA : currentTeamB;
  
  // 新しい席に座らせる
  const updatedSlots = targetTeam.slots.map(s => {
    if (s.slotNumber !== slotNumber) return s;
    const newPlayers = [...s.players];
    newPlayers[playerIndex] = playerName;
    return { ...s, players: newPlayers };
  });

  const updatedTeam = { ...targetTeam, slots: updatedSlots };
  return {
    ...state,
    teamA: team === 'A' ? updatedTeam : currentTeamA,
    teamB: team === 'B' ? updatedTeam : currentTeamB,
  };
}

/** プレイヤーを枠から削除 */
export function removePlayer(
  state: GameState,
  team: TeamId,
  slotNumber: SlotNumber,
  playerIndex: number
): GameState {
  const targetTeam = team === 'A' ? state.teamA : state.teamB;
  const updatedSlots = targetTeam.slots.map(s => {
    if (s.slotNumber !== slotNumber) return s;
    const newPlayers = s.players.filter((_, i) => i !== playerIndex);
    return { ...s, players: newPlayers };
  });

  const updatedTeam = { ...targetTeam, slots: updatedSlots };
  return {
    ...state,
    teamA: team === 'A' ? updatedTeam : state.teamA,
    teamB: team === 'B' ? updatedTeam : state.teamB,
  };
}

// ---- 手動操作（計算モード） ----

/** 指定枠のポイントを直接設定 */
export function setSlotPoints(
  state: GameState,
  team: TeamId,
  slotNumber: SlotNumber,
  points: number
): GameState {
  const targetTeam = team === 'A' ? state.teamA : state.teamB;
  const updatedSlots = targetTeam.slots.map(s =>
    s.slotNumber === slotNumber ? { ...s, points: Math.max(1, points) } : s
  );
  const updatedTeam = recalculateTeamScore({ ...targetTeam, slots: updatedSlots });

  return {
    ...state,
    teamA: team === 'A' ? updatedTeam : state.teamA,
    teamB: team === 'B' ? updatedTeam : state.teamB,
  };
}

/** 枠単位で選手配列を入れ替え */
export function swapSlots(
  state: GameState,
  fromTeam: TeamId,
  fromSlot: SlotNumber,
  toTeam: TeamId,
  toSlot: SlotNumber
): GameState {
  const getPlayers = (teamId: TeamId, slotNum: SlotNumber) => {
    const team = teamId === 'A' ? state.teamA : state.teamB;
    const slot = team.slots.find(s => s.slotNumber === slotNum);
    return slot ? [...slot.players] : [];
  };

  const p1 = getPlayers(fromTeam, fromSlot);
  const p2 = getPlayers(toTeam, toSlot);

  const updateTeam = (team: TeamState): TeamState => {
    const newSlots = team.slots.map(s => {
      let modified = false;
      let newPlayers = [...s.players];
      if (team.teamId === fromTeam && s.slotNumber === fromSlot) {
        newPlayers = p2;
        modified = true;
      }
      if (team.teamId === toTeam && s.slotNumber === toSlot) {
        newPlayers = p1;
        modified = true;
      }
      return modified ? { ...s, players: newPlayers } : s;
    });
    return { ...team, slots: newSlots };
  };

  return {
    ...state,
    teamA: updateTeam(state.teamA),
    teamB: updateTeam(state.teamB),
  };
}

/** 指定枠の誤答数を設定（計算モード/編集モード用） */
export function setSlotWrongCount(
  state: GameState,
  team: TeamId,
  slotNumber: SlotNumber,
  wrongCount: number
): GameState {
  const targetTeam = team === 'A' ? state.teamA : state.teamB;
  const updatedSlots = targetTeam.slots.map(s => {
    if (s.slotNumber !== slotNumber) return s;
    
    const count = Math.max(0, Math.min(2, wrongCount));
    const isActive = count < 2;
    
    // もし解答権なし（2✕）に変更する場合、得点は1ptに戻す
    const points = count === 2 ? 1 : s.points;
    
    return {
      ...s,
      wrongCount: count,
      isActive,
      points
    };
  });

  const updatedTeam = recalculateTeamScore({ ...targetTeam, slots: updatedSlots });

  let newState: GameState = {
    ...state,
    teamA: team === 'A' ? updatedTeam : state.teamA,
    teamB: team === 'B' ? updatedTeam : state.teamB,
  };

  // バースト判定
  if (isBurst(updatedTeam)) {
    const winnerTeam = team === 'A' ? 'B' : 'A';
    newState = {
      ...newState,
      status: 'finished',
      result: {
        winner: winnerTeam,
        reason: 'burst',
        scoreA: team === 'A' ? BURST_SCORE : state.config.winningScore,
        scoreB: team === 'B' ? BURST_SCORE : state.config.winningScore,
      },
    };
  }

  return newState;
}
