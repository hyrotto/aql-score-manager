// =============================================
// AQL 10by10by10mini ゲーム状態管理フック (Supabase リアルタイム同期版)
// =============================================
//
// アクションログは room_actions テーブル（INSERT 専用）で管理する。
// 通常の操作は 1 行 INSERT だけで済み、rooms.state の全量書き換えは発生しない。
// currentState は常に replayActions(baseState, actions) から導出することで、
// 楽観的更新も Realtime 受信も同じ計算経路に統一している。

'use client';

import { useCallback, useEffect, useState, useRef, useMemo } from 'react';
import { GameState, GameAction, TeamId, SlotNumber, GameConfig, LoggedAction, RoomActionRow, DbRoomState } from '../lib/types';
import { gameReducer } from '../lib/gameReducer';
import { createInitialGameState, isReach } from '../lib/gameLogic';
import { DEFAULT_CONFIG } from '../lib/constants';
import { supabase } from '../lib/supabase';
import { replayActions, compareActions } from '../lib/replay';

// UNDO 対象となるゲーム進行系アクションのリスト
const UNDOABLE_TYPES = ['CORRECT', 'WRONG', 'THROUGH', 'SET_POINTS', 'SET_WRONG_COUNT', 'SET_QUESTION'];

/**
 * UUID v4 文字列を生成する。
 * crypto.randomUUID() は secure context（HTTPS / localhost）でしか使えず、
 * LAN の IP アドレスへ HTTP でアクセスした端末では undefined になる。
 * その場合は secure context 不要の getRandomValues（無ければ Math.random）で
 * UUID v4 を組み立てる。room_actions.id は uuid 型なので必ず UUID 形式にする必要がある。
 */
function generateId(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  const buf = new Uint8Array(16);
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    crypto.getRandomValues(buf);
  } else {
    for (let i = 0; i < 16; i++) buf[i] = Math.floor(Math.random() * 256);
  }
  buf[6] = (buf[6] & 0x0f) | 0x40; // version 4
  buf[8] = (buf[8] & 0x3f) | 0x80; // variant 10
  const hex = Array.from(buf, (b) => b.toString(16).padStart(2, '0'));
  return `${hex.slice(0, 4).join('')}-${hex.slice(4, 6).join('')}-${hex.slice(6, 8).join('')}-${hex.slice(8, 10).join('')}-${hex.slice(10, 16).join('')}`;
}

/** room_actions テーブルの行を LoggedAction に変換する */
function rowToLoggedAction(row: RoomActionRow): LoggedAction {
  return {
    id: row.id,
    clientId: row.client_id,
    timestamp: row.created_at ? Date.parse(row.created_at) : Date.now(),
    action: row.action,
    seq: row.seq,
  };
}

/**
 * UNDO の取り消し対象を探す。
 * まだ tombstone されていない、undo 可能な種別の、自分（司会者なら他人も可）の
 * 最新アクションを返す。対象が無ければ null。
 */
function findUndoTarget(actions: LoggedAction[], clientId: string, isModerator: boolean): LoggedAction | null {
  const sorted = [...actions].sort(compareActions);

  // 既に取り消し済み（tombstone）のアクション id を集約
  const undoneIds = new Set<string>();
  for (const a of sorted) {
    if (a.action.type === 'UNDO' && a.action.targetId) undoneIds.add(a.action.targetId);
  }

  for (let i = sorted.length - 1; i >= 0; i--) {
    const a = sorted[i];
    if (a.action.type === 'UNDO') continue;
    if (undoneIds.has(a.id)) continue;
    if (!UNDOABLE_TYPES.includes(a.action.type)) continue;
    if (!(isModerator || a.clientId === clientId)) continue;
    return a;
  }
  return null;
}

export function useGameState(roomId: string) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // クライアント(端末)識別用のID
  const [clientId, setClientId] = useState<string>('');
  // アクションログ（room_actions 由来 + ローカルで楽観追加したもの）
  const [actions, setActions] = useState<LoggedAction[]>([]);
  // actions の起点となるスナップショット状態（作成時・RESET 時のみ更新）
  const [baseState, setBaseState] = useState<GameState>(() => createInitialGameState(DEFAULT_CONFIG));

  // currentState は baseState + actions から常に導出する（楽観更新も Realtime も同じ計算経路に集約）
  const state = useMemo(() => replayActions(baseState, actions), [baseState, actions]);

  // 非同期処理中に常に最新値を参照できるようにする ref
  const stateRef = useRef(state);
  const actionsRef = useRef(actions);
  const baseStateRef = useRef(baseState);
  useEffect(() => { stateRef.current = state; }, [state]);
  useEffect(() => { actionsRef.current = actions; }, [actions]);
  useEffect(() => { baseStateRef.current = baseState; }, [baseState]);

  // クライアントIDを確実に取得するヘルパー
  const getOrCreateClientId = useCallback(() => {
    if (typeof window === 'undefined') return '';
    let id = sessionStorage.getItem('aql_client_id');
    if (!id) {
      id = generateId();
      sessionStorage.setItem('aql_client_id', id);
    }
    return id;
  }, []);

  // クライアントIDの初期化
  useEffect(() => {
    const id = getOrCreateClientId();
    setClientId(id);
  }, [getOrCreateClientId]);

  // 初期ロード + Realtime 購読
  useEffect(() => {
    if (!roomId) return;
    let active = true;

    // room_actions を seq 昇順で取得する
    const loadActions = async (): Promise<LoggedAction[]> => {
      const { data, error: loadError } = await supabase
        .from('room_actions')
        .select('id, room_id, seq, client_id, action, created_at')
        .eq('room_id', roomId)
        .order('seq', { ascending: true });
      if (loadError || !data) return [];
      return (data as RoomActionRow[]).map(rowToLoggedAction);
    };

    const fetchInitial = async () => {
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

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const dbState = data.state as any;

        // baseState の決定:
        //   - baseState あり（Step1 以降の形式）: それを起点にする
        //   - baseState なし（Step1 以前）: 全履歴が残っているので初期状態から全リプレイすれば整合する
        const base: GameState = (dbState && dbState.baseState)
          ? (dbState.baseState as GameState)
          : createInitialGameState(DEFAULT_CONFIG);

        let loaded = await loadActions();

        // 旧room移行: room_actions が空で rooms.state に旧 actions が残っている場合、
        // room_actions テーブルへ移行 INSERT する（id が PK なので複数クライアント同時移行でも重複しない）。
        if (loaded.length === 0 && dbState && Array.isArray(dbState.actions) && dbState.actions.length > 0) {
          const legacy = dbState.actions as LoggedAction[];
          const rows = legacy.map((la) => ({
            id: la.id,
            room_id: roomId,
            client_id: la.clientId,
            action: la.action,
          }));
          await supabase.from('room_actions').upsert(rows, { onConflict: 'id', ignoreDuplicates: true });
          loaded = await loadActions();
        }

        if (active) {
          setBaseState(base);
          setActions(loaded);
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

    fetchInitial();

    const channel = supabase
      .channel(`room:${roomId}`)
      // 他クライアント（および自分）の新規アクションを受け取る
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'room_actions', filter: `room_id=eq.${roomId}` },
        (payload) => {
          if (!active || !payload.new) return;
          const la = rowToLoggedAction(payload.new as RoomActionRow);
          setActions((prev) => {
            const idx = prev.findIndex((a) => a.id === la.id);
            if (idx >= 0) {
              // 自分が楽観追加したアクションに、確定した seq を補完する
              const copy = [...prev];
              copy[idx] = { ...copy[idx], seq: la.seq };
              return copy;
            }
            return [...prev, la];
          });
        }
      )
      // RESET / スナップショット更新（rooms.state の書き換え）を受け取る
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'rooms', filter: `id=eq.${roomId}` },
        async (payload) => {
          if (!active || !payload.new) return;
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const dbState = (payload.new as any).state;
          if (dbState && dbState.baseState) {
            const reloaded = await loadActions();
            if (!active) return;
            setBaseState(dbState.baseState as GameState);
            setActions(reloaded);
          }
        }
      )
      .subscribe();

    return () => {
      active = false;
      supabase.removeChannel(channel);
    };
  }, [roomId]);

  // アクションを room_actions に INSERT する（seq を確定してローカルへ補完）
  const insertAction = useCallback(async (la: LoggedAction) => {
    if (!roomId) return;
    const { data, error: insertError } = await supabase
      .from('room_actions')
      .insert({ id: la.id, room_id: roomId, client_id: la.clientId, action: la.action })
      .select('seq')
      .single();

    if (insertError) {
      console.error('Failed to insert action:', insertError);
      // 楽観追加をロールバック
      setActions((prev) => prev.filter((a) => a.id !== la.id));
      setError('操作の保存に失敗しました。通信状態をご確認ください。');
      return;
    }
    if (data) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const seq = (data as any).seq as number;
      setActions((prev) => prev.map((a) => (a.id === la.id ? { ...a, seq } : a)));
    }
  }, [roomId]);

  // アクションをローカルに楽観追加しつつ DB へ INSERT する共通処理
  const appendAction = useCallback((action: GameAction) => {
    const currentClientId = getOrCreateClientId();
    const la: LoggedAction = {
      id: generateId(),
      clientId: currentClientId,
      timestamp: Date.now(),
      action,
    };
    setActions((prev) => [...prev, la]);
    insertAction(la);
  }, [getOrCreateClientId, insertAction]);

  // 司会者になる・離席する
  const becomeModerator = useCallback((name: string | null) => {
    appendAction({ type: 'SET_MODERATOR', name });
  }, [appendAction]);

  /** 正解処理 */
  const handleCorrect = useCallback((team: TeamId, slotNumber: SlotNumber) => {
    appendAction({ type: 'CORRECT', team, slotNumber });
  }, [appendAction]);

  /** 誤答処理 */
  const handleWrong = useCallback((team: TeamId, slotNumber: SlotNumber) => {
    appendAction({ type: 'WRONG', team, slotNumber });
  }, [appendAction]);

  /** 1手戻す（自分がした最後の操作を取り消す。司会者の場合は他人の操作も戻せる） */
  const handleUndo = useCallback(async () => {
    const currentClientId = getOrCreateClientId();
    if (!currentClientId) return;

    const isModeratorNow = stateRef.current.moderatorName !== null
      && typeof window !== 'undefined'
      && stateRef.current.moderatorName === sessionStorage.getItem('my_player_name');

    const target = findUndoTarget(actionsRef.current, currentClientId, isModeratorNow);
    if (!target) return;

    // 取り消しは「対象を打ち消す UNDO アクションの追記」として表現する（room_actions は INSERT 専用）
    appendAction({ type: 'UNDO', targetId: target.id });
  }, [getOrCreateClientId, appendAction]);

  /** スルー処理 */
  const handleThrough = useCallback(() => {
    appendAction({ type: 'THROUGH' });
  }, [appendAction]);

  /** プレイヤー設定 */
  const setPlayer = useCallback((team: TeamId, slotNumber: SlotNumber, playerName: string, playerIndex: number) => {
    appendAction({ type: 'SET_PLAYER', team, slotNumber, playerName, playerIndex });
  }, [appendAction]);

  /** プレイヤー削除 */
  const removePlayerFromSlot = useCallback((team: TeamId, slotNumber: SlotNumber, playerIndex: number) => {
    appendAction({ type: 'REMOVE_PLAYER', team, slotNumber, playerIndex });
  }, [appendAction]);

  /** ポイント直接設定（計算モード） */
  const setPoints = useCallback((team: TeamId, slotNumber: SlotNumber, points: number) => {
    appendAction({ type: 'SET_POINTS', team, slotNumber, points });
  }, [appendAction]);

  /** 問題番号設定 */
  const setQuestion = useCallback((question: number) => {
    appendAction({ type: 'SET_QUESTION', question });
  }, [appendAction]);

  /** 問題番号の公開/非公開切り替え */
  const toggleQuestionPublic = useCallback(() => {
    appendAction({ type: 'TOGGLE_QUESTION_PUBLIC' });
  }, [appendAction]);

  /**
   * ゲームリセット。
   * 履歴を破棄する破壊的操作のため、room_actions を全削除し rooms.state
   * （スナップショット）を更新する。通常操作と異なり rooms.state を書き換える。
   */
  const resetGame = useCallback(async () => {
    const resetState = gameReducer(stateRef.current, { type: 'RESET_GAME' });
    const snapshot = { ...resetState, history: [] };

    // ローカル即時反映
    setActions([]);
    setBaseState(snapshot);

    // DB: 履歴を全削除 → スナップショットを更新（他クライアントは rooms UPDATE で追従）
    const dbStateToSave: DbRoomState = { currentState: snapshot, baseState: snapshot };
    const { error: delError } = await supabase.from('room_actions').delete().eq('room_id', roomId);
    if (delError) console.error('Failed to clear room_actions on reset:', delError);
    const { error: updError } = await supabase.from('rooms').update({ state: dbStateToSave }).eq('id', roomId);
    if (updError) console.error('Failed to update snapshot on reset:', updError);
  }, [roomId]);

  /** ゲーム開始 */
  const startGame = useCallback(() => {
    appendAction({ type: 'START_GAME' });
  }, [appendAction]);

  /** 設定更新 */
  const updateConfig = useCallback((newConfig: Partial<GameConfig>) => {
    appendAction({ type: 'UPDATE_CONFIG', config: newConfig });
  }, [appendAction]);

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
      appendAction({ type: 'SWAP_SLOTS', fromTeam, fromSlot, toTeam, toSlot });
    },
    [appendAction]
  );

  /** 誤答数の直接設定（編集モード） */
  const setWrongCount = useCallback(
    (team: TeamId, slotNumber: SlotNumber, wrongCount: number) => {
      appendAction({ type: 'SET_WRONG_COUNT', team, slotNumber, wrongCount });
    },
    [appendAction]
  );

  // 自分が司会者かどうかの判定
  const isModerator = state && state.moderatorName !== null && typeof window !== 'undefined' && state.moderatorName === sessionStorage.getItem('my_player_name');

  /** Undo可能か (取り消せるアクションが存在するか) */
  const canUndo = findUndoTarget(actions, clientId, !!isModerator) !== null;

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
