// =============================================
// AQL 10by10by10mini ゲーム状態管理フック (Supabase リアルタイム同期版)
// =============================================

'use client';

import { useReducer, useCallback, useEffect, useState, useRef } from 'react';
import { GameState, GameAction, TeamId, SlotNumber, GameConfig, LoggedAction, DbRoomState } from '../lib/types';
import { gameReducer } from '../lib/gameReducer';
import { createInitialGameState, isReach } from '../lib/gameLogic';
import { DEFAULT_CONFIG } from '../lib/constants';
import { supabase } from '../lib/supabase';
import { replayActions } from '../lib/replay';

export function useGameState(roomId: string) {
  const [state, dispatch] = useReducer(gameReducer, DEFAULT_CONFIG, createInitialGameState);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  // クライアント(端末)識別用のID
  const [clientId, setClientId] = useState<string>('');
  // アクションログの保持
  const [actions, setActions] = useState<LoggedAction[]>([]);

  // クライアントIDを確実に取得するヘルパー
  const getOrCreateClientId = useCallback(() => {
    if (typeof window === 'undefined') return '';
    let id = sessionStorage.getItem('aql_client_id');
    if (!id) {
      id = typeof crypto !== 'undefined' && crypto.randomUUID 
        ? crypto.randomUUID() 
        : Math.random().toString(36).substring(2, 15) + Date.now().toString(36);
      sessionStorage.setItem('aql_client_id', id);
    }
    return id;
  }, []);

  // クライアントIDの初期化
  useEffect(() => {
    const id = getOrCreateClientId();
    setClientId(id);
    console.log('[AQL Debug] Client ID initialized:', id);
  }, [getOrCreateClientId]);
  
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
          const dbState = data.state as any;
          if (dbState && 'currentState' in dbState && 'actions' in dbState) {
            dispatch({ type: 'SET_STATE', state: dbState.currentState as GameState });
            setActions(dbState.actions as LoggedAction[]);
          } else if (dbState) {
            // 下位互換性：古い形式のデータ
            dispatch({ type: 'SET_STATE', state: dbState as GameState });
            setActions([]);
          }
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
            const dbState = payload.new.state as any;
            if (dbState && 'currentState' in dbState && 'actions' in dbState) {
              dispatch({ type: 'SET_STATE', state: dbState.currentState as GameState });
              setActions(dbState.actions as LoggedAction[]);
            } else {
              dispatch({ type: 'SET_STATE', state: dbState as GameState });
              setActions([]);
            }
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
  const updateDbState = useCallback(async (nextState: GameState, nextActions: LoggedAction[]) => {
    if (!roomId) return;
    
    try {
      // history はサイズ削減のため、保存時にDBに送らないようにする（循環参照エラーの回避とストレージ容量節約）
      const stateToSave = {
        ...nextState,
        history: nextState.history.map(h => ({ ...h, history: [] })), // 履歴のネストを浅くしてシリアライズエラーを防止
      };

      const dbStateToSave: DbRoomState = {
        currentState: stateToSave,
        actions: nextActions,
      };

      const { error: updateError } = await supabase
        .from('rooms')
        .update({ state: dbStateToSave })
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
    if (action.type === 'UNDO') {
      return;
    }
    if (action.type === 'SET_STATE') {
      dispatch(action);
      return;
    }

    const currentClientId = getOrCreateClientId();
    console.log('[AQL Debug] Dispatching action:', action.type, 'by client:', currentClientId);

    // 1. 新しい LoggedAction を作成
    const newLoggedAction: LoggedAction = {
      id: typeof crypto !== 'undefined' && crypto.randomUUID 
        ? crypto.randomUUID() 
        : Math.random().toString(36).substring(2, 15) + Date.now().toString(36),
      clientId: currentClientId,
      timestamp: Date.now(),
      action: action
    };

    const nextActions = [...actions, newLoggedAction];
    
    // 2. 次の状態を算出
    const nextState = gameReducer(state, action);
    
    // 3. ローカル状態を更新
    dispatch(action);
    setActions(nextActions);
    
    // 4. DBに非同期で保存
    updateDbState(nextState, nextActions);
  }, [state, actions, getOrCreateClientId, updateDbState]);

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

  /** 1手戻す（自分がした最後の操作を取り消す。司会者の場合は他人の操作も戻せる） */
  const handleUndo = useCallback(async () => {
    const currentClientId = getOrCreateClientId();
    if (!currentClientId) {
      console.warn('[AQL Debug] No client ID found during undo');
      return;
    }

    const isModerator = state && state.moderatorName !== null && typeof window !== 'undefined' && state.moderatorName === sessionStorage.getItem('my_player_name');

    console.log('[AQL Debug] Undo triggered. client:', currentClientId, 'isModerator:', isModerator, 'current action count:', actions.length);

    // UNDO対象となるゲーム進行系アクションのリスト
    const undoableTypes = ['CORRECT', 'WRONG', 'THROUGH', 'SET_POINTS', 'SET_WRONG_COUNT', 'SET_QUESTION'];

    // 削除対象となる最新 of 進行系アクションを探す（後ろから探索）
    let targetActionIndex = -1;
    for (let i = actions.length - 1; i >= 0; i--) {
      const isUndoable = undoableTypes.includes(actions[i].action.type);
      const isMatchUser = isModerator || actions[i].clientId === currentClientId;
      if (isUndoable && isMatchUser) {
        targetActionIndex = i;
        break;
      }
    }

    if (targetActionIndex === -1) {
      console.log('[AQL Debug] No actions to undo');
      return;
    }

    const targetAction = actions[targetActionIndex];
    console.log('[AQL Debug] Removing action at index:', targetActionIndex, 'Action details:', targetAction);

    // そのアクションを除外した新しいアクション配列を作成
    const nextActions = actions.filter((_, idx) => idx !== targetActionIndex);

    // 最初からリプレイして、新しいゲーム状態を算出
    const nextState = replayActions(nextActions);

    // ローカル状態に反映
    dispatch({ type: 'SET_STATE', state: nextState });
    setActions(nextActions);

    // DBに保存
    await updateDbState(nextState, nextActions);
    console.log('[AQL Debug] Undo complete. New action count:', nextActions.length);
  }, [getOrCreateClientId, actions, updateDbState, state]);

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

  // 自分が司会者かどうかの判定
  const isModerator = state && state.moderatorName !== null && typeof window !== 'undefined' && state.moderatorName === sessionStorage.getItem('my_player_name');
  const undoableTypes = ['CORRECT', 'WRONG', 'THROUGH', 'SET_POINTS', 'SET_WRONG_COUNT', 'SET_QUESTION'];

  /** Undo可能か (自分がしたゲーム進行操作が存在するか。司会者の場合は他人の操作も含めて存在するか) */
  const canUndo = actions.some(a => 
    undoableTypes.includes(a.action.type) &&
    (isModerator || a.clientId === clientId)
  );

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
