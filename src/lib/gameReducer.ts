// =============================================
// AQL 10by10by10mini ゲーム状態 Reducer
// =============================================
// useReducer で使用するアクション→状態変更の対応表

import { GameState, GameAction, TeamState } from './types';
import {
  createInitialGameState,
  processCorrect,
  processWrong,
  addPlayer,
  removePlayer,
  setSlotPoints,
  swapSlots,
  setSlotWrongCount,
} from './gameLogic';

/** 以前の状態から選手名のみを引き継ぐヘルパー関数 */
function copyPlayers(sourceTeam: TeamState, targetTeam: TeamState): TeamState {
  const updatedSlots = targetTeam.slots.map(targetSlot => {
    const sourceSlot = sourceTeam.slots.find(s => s.slotNumber === targetSlot.slotNumber);
    return {
      ...targetSlot,
      players: sourceSlot ? [...sourceSlot.players] : [],
    };
  });
  return { ...targetTeam, slots: updatedSlots };
}

/**
 * ゲーム状態のReducer
 * 各アクションに対して新しい状態を返す純粋関数
 */
export function gameReducer(state: GameState, action: GameAction): GameState {
  // Undo以外のアクションでは、現在の状態を履歴に追加
  // ※ history自体は保存しない（循環参照防止 & メモリ節約）
  const stateForHistory: GameState = { ...state, history: [] };

  switch (action.type) {
    case 'CORRECT': {
      if (state.status !== 'playing') return state;
      const newState = processCorrect(state, action.team, action.slotNumber);
      return {
        ...newState,
        history: [stateForHistory, ...state.history.slice(0, 49)], // 最大50手まで保持
      };
    }

    case 'WRONG': {
      if (state.status !== 'playing') return state;
      const newState = processWrong(state, action.team, action.slotNumber);
      return {
        ...newState,
        history: [stateForHistory, ...state.history.slice(0, 49)],
      };
    }

    case 'UNDO': {
      if (state.history.length === 0) return state;
      const previousState = state.history[0];
      const remainingHistory = state.history.slice(1);
      return {
        ...previousState,
        history: remainingHistory,
      };
    }

    case 'SET_PLAYER': {
      return addPlayer(state, action.team, action.slotNumber, action.playerName, action.playerIndex);
    }

    case 'REMOVE_PLAYER': {
      return removePlayer(state, action.team, action.slotNumber, action.playerIndex);
    }

    case 'SWAP_SLOTS': {
      return swapSlots(
        state,
        action.fromTeam,
        action.fromSlot,
        action.toTeam,
        action.toSlot
      );
    }

    case 'SET_POINTS': {
      if (state.status !== 'playing') return state;
      const newState = setSlotPoints(state, action.team, action.slotNumber, action.points);
      return {
        ...newState,
        history: [stateForHistory, ...state.history.slice(0, 49)],
      };
    }

    case 'SET_WRONG_COUNT': {
      // 待機中でなければ誤答数の手動変更を履歴に残す
      const newState = setSlotWrongCount(state, action.team, action.slotNumber, action.wrongCount);
      return {
        ...newState,
        history: state.status === 'playing' ? [stateForHistory, ...state.history.slice(0, 49)] : state.history,
      };
    }

    case 'SET_QUESTION': {
      return {
        ...state,
        currentQuestion: Math.max(0, Math.min(action.question, state.config.maxQuestions)),
      };
    }

    case 'TOGGLE_QUESTION_PUBLIC': {
      return {
        ...state,
        isQuestionPublic: !state.isQuestionPublic,
      };
    }

    case 'RESET_GAME': {
      const freshState = createInitialGameState(state.config);
      return {
        ...freshState,
        teamA: copyPlayers(state.teamA, freshState.teamA),
        teamB: copyPlayers(state.teamB, freshState.teamB),
        isQuestionPublic: state.isQuestionPublic,
        moderatorName: state.moderatorName,
      };
    }

    case 'START_GAME': {
      return {
        ...state,
        status: 'playing',
        currentQuestion: 1,
      };
    }

    case 'UPDATE_CONFIG': {
      const newConfig = { ...state.config, ...action.config };
      const isSlotCountChanged = action.config.slotCount !== undefined && action.config.slotCount !== state.config.slotCount;

      if (isSlotCountChanged) {
        // 枠数が変わった場合はゲームはリセットするが、選手名は引き継ぐ
        const freshState = createInitialGameState(newConfig);
        return {
          ...freshState,
          teamA: copyPlayers(state.teamA, freshState.teamA),
          teamB: copyPlayers(state.teamB, freshState.teamB),
          history: [],
          moderatorName: state.moderatorName,
        };
      } else {
        // 枠数が変わっていないなら設定値のみ更新（スコアや進行状況はそのまま維持）
        return {
          ...state,
          config: newConfig,
        };
      }
    }

    case 'THROUGH': {
      if (state.status !== 'playing') return state;
      return {
        ...state,
        currentQuestion: state.currentQuestion + 1,
        history: [stateForHistory, ...state.history.slice(0, 49)],
      };
    }

    case 'SET_STATE': {
      return action.state;
    }

    case 'SET_MODERATOR': {
      if (action.name) {
        // 解答席から司会者名を取り除く
        const removePlayerFromName = (targetTeam: TeamState): TeamState => {
          let changed = false;
          const updatedSlots = targetTeam.slots.map(s => {
            if (s.players.includes(action.name!)) {
              changed = true;
              return {
                ...s,
                players: s.players.map(p => p === action.name ? '' : p)
              };
            }
            return s;
          });
          return changed ? { ...targetTeam, slots: updatedSlots } : targetTeam;
        };

        const teamA = removePlayerFromName(state.teamA);
        const teamB = removePlayerFromName(state.teamB);

        return {
          ...state,
          teamA,
          teamB,
          moderatorName: action.name,
        };
      }

      return {
        ...state,
        moderatorName: action.name,
      };
    }

    default:
      return state;
  }
}
