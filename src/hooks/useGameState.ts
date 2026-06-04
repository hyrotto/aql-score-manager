// =============================================
// AQL 10by10by10mini ゲーム状態管理フック (Supabase リアルタイム同期版)
// =============================================

'use client';

import { useReducer, useCallback, useEffect, useState, useRef } from 'react';
import { GameState, GameAction, TeamId, SlotNumber, GameConfig } from '../lib/types';
import { gameReducer } from '../lib/gameReducer';
import { createInitialGameState, isReach } from '../lib/gameLogic';
import { DEFAULT_CONFIG } from '../lib/constants';
import { supabase } from '../lib/supabase';

export function useGameState(roomId: string) {
  const [state, dispatch] = useReducer(gameReducer, DEFAULT_CONFIG, createInitialGameState);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  // DBから最新の状態を取得し、リアルタイム購読をセットアップする
  useEffect(() => {
    if (!roomId) return;

    let active = true;

    const fetchInitialState = async () => {
      try {
        setLoading(true);
        const { data, error: fetchError } = await supabase
          .from('rooms')
          .select('state')
          .eq('id', roomId)
          .single();

        if (fetchError || !data) {
          if (active) {
            setError('ルーム情報が見つかりません。URLが正しいかご確認ください。');
            setLoading(false);
          }
          return;
        }

        if (active) {
          dispatch({ type: 'SET_STATE', state: data.state as GameState });
          setError(null);
          setLoading(false);
        }
      } catch (err) {
        console.error('Failed to fetch initial state:', err);
        if (active) {
          setError('初期データの取得中にエラーが発生しました。');
          setLoading(false);
        }
      }
    };

    fetchInitialState();

    // リアルタイム同期チャネルの作成
    const channel = supabase
      .channel(`room:${roomId}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'rooms',
          filter: `id=eq.${roomId}`,
        },
        (payload) => {
          if (!active) return;

          if (payload.new && payload.new.state) {
            dispatch({ type: 'SET_STATE', state: payload.new.state as GameState });
          }
        }
      )
      .subscribe();

    return () => {
      active = false;
      supabase.removeChannel(channel);
    };
  }, [roomId]);

  // 状態変更をDBに保存する共通関数
  const updateDbState = useCallback(async (nextState: GameState) => {
    if (!roomId) return;
    
    try {
      // history はサイズ削減のため、保存時にDBに送らないようにする（循環参照エラーの回避とストレージ容量節約）
      const stateToSave = {
        ...nextState,
        history: nextState.history.map(h => ({ ...h, history: [] })), // 履歴のネストを浅くしてシリアライズエラーを防止
      };

      const { error: updateError } = await supabase
        .from('rooms')
        .update({ state: stateToSave })
        .eq('id', roomId);

      if (updateError) {
        console.error('Error updating room state:', updateError);
      }
    } catch (err) {
      console.error('Failed to sync state to Supabase:', err);
    }
  }, [roomId]);

  // ローカルdispatchとDB同期を同時に行う
  const dispatchAndSync = useCallback((action: GameAction) => {
    // 1. 次の状態を算出
    const nextState = gameReducer(state, action);
    // 2. ローカルに反映（即時反映でレスポンスを良くする）
    dispatch(action);
    // 3. DBに非同期で保存
    updateDbState(nextState);
  }, [state, updateDbState]);

  // 司会者になる・離席する
  const becomeModerator = useCallback((name: string | null) => {
    dispatchAndSync({ type: 'SET_MODERATOR', name });
  }, [dispatchAndSync]);

  /** 正解処理 */
  const handleCorrect = useCallback((team: TeamId, slotNumber: SlotNumber) => {
    dispatchAndSync({ type: 'CORRECT', team, slotNumber });
  }, [dispatchAndSync]);

  /** 誤答処理 */
  const handleWrong = useCallback((team: TeamId, slotNumber: SlotNumber) => {
    dispatchAndSync({ type: 'WRONG', team, slotNumber });
  }, [dispatchAndSync]);

  /** 1手戻す */
  const handleUndo = useCallback(() => {
    dispatchAndSync({ type: 'UNDO' });
  }, [dispatchAndSync]);

  /** スルー処理 */
  const handleThrough = useCallback(() => {
    dispatchAndSync({ type: 'THROUGH' });
  }, [dispatchAndSync]);

  /** プレイヤー設定 */
  const setPlayer = useCallback(
    (team: TeamId, slotNumber: SlotNumber, playerName: string, playerIndex: number) => {
      dispatchAndSync({ type: 'SET_PLAYER', team, slotNumber, playerName, playerIndex });
    },
    [dispatchAndSync]
  );

  /** プレイヤー削除 */
  const removePlayerFromSlot = useCallback(
    (team: TeamId, slotNumber: SlotNumber, playerIndex: number) => {
      dispatchAndSync({ type: 'REMOVE_PLAYER', team, slotNumber, playerIndex });
    },
    [dispatchAndSync]
  );

  /** ポイント直接設定（計算モード） */
  const setPoints = useCallback((team: TeamId, slotNumber: SlotNumber, points: number) => {
    dispatchAndSync({ type: 'SET_POINTS', team, slotNumber, points });
  }, [dispatchAndSync]);

  /** 問題番号設定 */
  const setQuestion = useCallback((question: number) => {
    dispatchAndSync({ type: 'SET_QUESTION', question });
  }, [dispatchAndSync]);

  /** 問題番号の公開/非公開切り替え */
  const toggleQuestionPublic = useCallback(() => {
    dispatchAndSync({ type: 'TOGGLE_QUESTION_PUBLIC' });
  }, [dispatchAndSync]);

  /** ゲームリセット */
  const resetGame = useCallback(() => {
    dispatchAndSync({ type: 'RESET_GAME' });
  }, [dispatchAndSync]);

  /** ゲーム開始 */
  const startGame = useCallback(() => {
    dispatchAndSync({ type: 'START_GAME' });
  }, [dispatchAndSync]);

  /** 設定更新 */
  const updateConfig = useCallback((newConfig: Partial<GameConfig>) => {
    dispatchAndSync({ type: 'UPDATE_CONFIG', config: newConfig });
  }, [dispatchAndSync]);

  /** リーチ判定のヘルパー */
  const checkReach = useCallback(
    (team: TeamId, slotNumber: SlotNumber) => {
      const teamState = team === 'A' ? state.teamA : state.teamB;
      return isReach(teamState, slotNumber, state.config.winningScore);
    },
    [state.teamA, state.teamB, state.config.winningScore]
  );

  /** 枠単位での選手入れ替え */
  const swapSlots = useCallback(
    (fromTeam: TeamId, fromSlot: SlotNumber, toTeam: TeamId, toSlot: SlotNumber) => {
      dispatchAndSync({ type: 'SWAP_SLOTS', fromTeam, fromSlot, toTeam, toSlot });
    },
    [dispatchAndSync]
  );

  /** 誤答数の直接設定（編集モード） */
  const setWrongCount = useCallback(
    (team: TeamId, slotNumber: SlotNumber, wrongCount: number) => {
      dispatchAndSync({ type: 'SET_WRONG_COUNT', team, slotNumber, wrongCount });
    },
    [dispatchAndSync]
  );

  /** Undo可能か */
  const canUndo = state.history.length > 0;

  return {
    state,
    handleCorrect,
    handleWrong,
    handleUndo,
    handleThrough,
    setPlayer,
    removePlayerFromSlot,
    swapSlots,
    setWrongCount,
    setPoints,
    setQuestion,
    toggleQuestionPublic,
    resetGame,
    startGame,
    updateConfig,
    checkReach,
    canUndo,
    loading,
    error,
    becomeModerator,
  };
}
