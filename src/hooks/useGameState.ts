// =============================================
// AQL 10by10by10mini ゲーム状態管理フック (Supabase リアルタイム同期版)
// =============================================

'use client';

import { useReducer, useCallback, useEffect, useState, useRef } from 'react';
import { GameState, GameAction, TeamId, SlotNumber, GameConfig, LoggedAction, DbRoomState, RoomSnapshot } from '../lib/types';
import { gameReducer } from '../lib/gameReducer';
import { createInitialGameState, isReach } from '../lib/gameLogic';
import { DEFAULT_CONFIG } from '../lib/constants';
import { supabase } from '../lib/supabase';
import { replayActions, truncateActions } from '../lib/replay';

export function useGameState(roomId: string) {
  const [state, dispatch] = useReducer(gameReducer, DEFAULT_CONFIG, createInitialGameState);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  // クライアント(端末)識別用のID
  const [clientId, setClientId] = useState<string>('');
  // アクションログの保持
  const [actions, setActions] = useState<LoggedAction[]>([]);
  // actions の起点となるスナップショット状態（切り詰めで畳み込まれた古い操作を含む）
  const [baseState, setBaseState] = useState<GameState>(() => createInitialGameState(DEFAULT_CONFIG));
  // 楽観的排他制御用のリビジョン番号（DBの revision 列と対応）
  const [revision, setRevision] = useState<number>(0);

  // 非同期リトライ処理中に常に最新値を参照できるようにする ref
  // （React state はクロージャで古い値を掴む可能性があるため）
  const stateRef = useRef(state);
  const actionsRef = useRef(actions);
  const baseStateRef = useRef(baseState);
  const revisionRef = useRef(revision);
  useEffect(() => { stateRef.current = state; }, [state]);
  useEffect(() => { actionsRef.current = actions; }, [actions]);
  useEffect(() => { baseStateRef.current = baseState; }, [baseState]);
  useEffect(() => { revisionRef.current = revision; }, [revision]);

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
          .select('state, revision')
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
          const fetchedRevision = (data as any).revision ?? 0;
          if (dbState && 'currentState' in dbState && 'actions' in dbState) {
            dispatch({ type: 'SET_STATE', state: dbState.currentState as GameState });
            setActions(dbState.actions as LoggedAction[]);
            // baseState が無い古いデータは初期状態にフォールバック（切り詰め前提のため）
            setBaseState((dbState.baseState as GameState) ?? createInitialGameState(DEFAULT_CONFIG));
          } else if (dbState) {
            // 下位互換性：古い形式のデータ
            dispatch({ type: 'SET_STATE', state: dbState as GameState });
            setActions([]);
            setBaseState(createInitialGameState(DEFAULT_CONFIG));
          }
          setRevision(fetchedRevision);
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
            const incomingRevision = (payload.new as any).revision ?? 0;
            // 自分がまさに書き込もうとしている revision より古い通知は無視する
            // （直後に自分の更新が届いて上書きされ、他人の操作が消えて見える事故を防ぐ）
            if (incomingRevision < revisionRef.current) {
              return;
            }
            if (dbState && 'currentState' in dbState && 'actions' in dbState) {
              dispatch({ type: 'SET_STATE', state: dbState.currentState as GameState });
              setActions(dbState.actions as LoggedAction[]);
              setBaseState((dbState.baseState as GameState) ?? createInitialGameState(DEFAULT_CONFIG));
            } else {
              dispatch({ type: 'SET_STATE', state: dbState as GameState });
              setActions([]);
              setBaseState(createInitialGameState(DEFAULT_CONFIG));
            }
            setRevision(incomingRevision);
          }
        }
      )
      .subscribe();

    return () => {
      active = false;
      supabase.removeChannel(channel);
    };
  }, [roomId]);

  // DBから最新のルーム状態を取得するヘルパー（競合時の再取得に使用）
  const fetchLatestRoom = useCallback(async (): Promise<RoomSnapshot | null> => {
    const { data, error: fetchError } = await supabase
      .from('rooms')
      .select('state, revision')
      .eq('id', roomId)
      .single();

    if (fetchError || !data) return null;

    const dbState = data.state as any;
    const latestRevision = (data as any).revision ?? 0;
    if (dbState && 'currentState' in dbState && 'actions' in dbState) {
      return {
        state: dbState.currentState as GameState,
        actions: dbState.actions as LoggedAction[],
        baseState: (dbState.baseState as GameState) ?? createInitialGameState(DEFAULT_CONFIG),
        revision: latestRevision,
      };
    }
    return { state: dbState as GameState, actions: [], baseState: createInitialGameState(DEFAULT_CONFIG), revision: latestRevision };
  }, [roomId]);

  // 状態変更をDBに保存する共通関数（楽観的排他制御つき）
  // computeNext: 「その時点で最新と分かっている state/actions」を受け取り、書き込むべき次の state/actions を返す関数。
  //   競合が起きた場合はDBの最新値を渡して再計算させることで、他人の操作を上書きしてしまう事故を防ぐ。
  const MAX_CONFLICT_RETRIES = 5;

  const updateDbStateWithRetry = useCallback(async (
    computeNext: (latestState: GameState, latestActions: LoggedAction[], latestBaseState: GameState) => { nextState: GameState; nextActions: LoggedAction[]; nextBaseState: GameState } | null,
    expectedRevision: number
  ): Promise<void> => {
    if (!roomId) return;

    let currentRevision = expectedRevision;

    for (let attempt = 0; attempt <= MAX_CONFLICT_RETRIES; attempt++) {
      const result = computeNext(stateRef.current, actionsRef.current, baseStateRef.current);
      if (!result) return; // 適用対象なし（例: undo対象がない）

      const { nextState, nextActions, nextBaseState } = result;

      try {
        const stateToSave = {
          ...nextState,
          history: nextState.history.map(h => ({ ...h, history: [] })),
        };
        // baseState は内部計算（undo時のリプレイ起点）専用で表示には使わないため history は不要。空にしてサイズを削減する。
        const baseStateToSave = { ...nextBaseState, history: [] };
        const dbStateToSave: DbRoomState = {
          currentState: stateToSave,
          actions: nextActions,
          baseState: baseStateToSave,
        };

        const { data, error: updateError } = await supabase
          .from('rooms')
          .update({ state: dbStateToSave, revision: currentRevision + 1 })
          .eq('id', roomId)
          .eq('revision', currentRevision)
          .select('revision');

        if (updateError) {
          console.error('Error updating room state:', updateError);
          return;
        }

        if (!data || data.length === 0) {
          // revision が一致せず更新できなかった＝他クライアントと競合した
          if (attempt === MAX_CONFLICT_RETRIES) {
            console.error('[AQL Debug] Conflict retry limit reached');
            setError('他の操作と競合しました。画面を更新してください。');
            return;
          }
          const latest = await fetchLatestRoom();
          if (!latest) return;

          stateRef.current = latest.state;
          actionsRef.current = latest.actions;
          baseStateRef.current = latest.baseState;
          revisionRef.current = latest.revision;
          dispatch({ type: 'SET_STATE', state: latest.state });
          setActions(latest.actions);
          setBaseState(latest.baseState);
          setRevision(latest.revision);
          currentRevision = latest.revision;
          continue; // 最新状態に対して同じ変更をもう一度適用してリトライ
        }

        // 成功: ローカルのrevisionも更新
        revisionRef.current = currentRevision + 1;
        setRevision(currentRevision + 1);
        return;
      } catch (err) {
        console.error('Failed to sync state to Supabase:', err);
        return;
      }
    }
  }, [roomId, fetchLatestRoom]);

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

    const newLoggedAction: LoggedAction = {
      id: typeof crypto !== 'undefined' && crypto.randomUUID
        ? crypto.randomUUID()
        : Math.random().toString(36).substring(2, 15) + Date.now().toString(36),
      clientId: currentClientId,
      timestamp: Date.now(),
      action: action
    };

    // 「最新の state/actions/baseState」を受け取って次の状態を組み立てる関数。
    // 競合時にはDBの最新版に対してこの関数がもう一度呼ばれるため、他人の変更を消さずに済む。
    const computeNext = (latestState: GameState, latestActions: LoggedAction[], latestBaseState: GameState) => {
      const recomputedState = gameReducer(latestState, action);

      if (action.type === 'RESET_GAME') {
        // リセットは履歴を破棄。リセット後の状態（選手名・司会者・設定を保持）を
        // そのまま新しい baseState とし、actions は空にする。
        return { nextState: recomputedState, nextActions: [], nextBaseState: recomputedState };
      }

      const recomputedActions = [...latestActions, newLoggedAction];
      // 直近 N 件に切り詰め、あふれた分は baseState へ畳み込む
      const truncated = truncateActions(latestBaseState, recomputedActions);
      return { nextState: recomputedState, nextActions: truncated.actions, nextBaseState: truncated.baseState };
    };

    // ローカル状態は即座に楽観的更新（UIの反応速度を維持）
    const localResult = computeNext(state, actions, baseState);
    dispatch(action);
    setActions(localResult.nextActions);
    setBaseState(localResult.nextBaseState);

    // DBには競合検知・再試行つきで反映
    updateDbStateWithRetry(computeNext, revisionRef.current);
  }, [state, actions, baseState, getOrCreateClientId, updateDbStateWithRetry]);

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

    // UNDO対象となるゲーム進行系アクションのリスト
    const undoableTypes = ['CORRECT', 'WRONG', 'THROUGH', 'SET_POINTS', 'SET_WRONG_COUNT', 'SET_QUESTION'];

    // 「最新のactions配列」を受け取って、そこから取り消し対象を探す。
    // 競合時にはDBの最新のactionsに対してもう一度この探索をやり直すため、
    // 他クライアントの操作を巻き込んで消してしまう事故を防げる。
    const computeNext = (latestState: GameState, latestActions: LoggedAction[], latestBaseState: GameState) => {
      const isModeratorNow = latestState.moderatorName !== null && typeof window !== 'undefined' && latestState.moderatorName === sessionStorage.getItem('my_player_name');

      let targetActionIndex = -1;
      for (let i = latestActions.length - 1; i >= 0; i--) {
        const isUndoable = undoableTypes.includes(latestActions[i].action.type);
        const isMatchUser = isModeratorNow || latestActions[i].clientId === currentClientId;
        if (isUndoable && isMatchUser) {
          targetActionIndex = i;
          break;
        }
      }

      if (targetActionIndex === -1) {
        console.log('[AQL Debug] No actions to undo');
        return null;
      }

      // 対象を除いた actions を baseState 起点でリプレイして状態を再計算する。
      // baseState 自体は変化しない（切り詰められた古い操作はそのまま残る）。
      const nextActions = latestActions.filter((_, idx) => idx !== targetActionIndex);
      const nextState = replayActions(latestBaseState, nextActions);
      return { nextState, nextActions, nextBaseState: latestBaseState };
    };

    // ローカルにも即座に反映（楽観的更新）
    const localResult = computeNext(state, actions, baseState);
    if (!localResult) return;
    dispatch({ type: 'SET_STATE', state: localResult.nextState });
    setActions(localResult.nextActions);

    // DBには競合検知・再試行つきで反映
    await updateDbStateWithRetry(computeNext, revisionRef.current);
    console.log('[AQL Debug] Undo complete.');
  }, [getOrCreateClientId, actions, baseState, updateDbStateWithRetry, state]);

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
