'use client';

import React, { useState, useEffect, useRef } from 'react';
import { GameState, TeamId, SlotNumber, GameConfig } from '../lib/types';
import TeamPanel from './TeamPanel';
import GameHeader from './GameHeader';
import GameOverModal from './GameOverModal';
import { Settings } from 'lucide-react';

type ScoreboardProps = {
  state: GameState;
  isModerator: boolean;
  isEditMode: boolean;
  canUndo: boolean;
  onCorrect: (team: TeamId, slot: SlotNumber) => void;
  onWrong: (team: TeamId, slot: SlotNumber) => void;
  onSetPoints: (team: TeamId, slot: SlotNumber, points: number) => void;
  onSetWrongCount: (team: TeamId, slot: SlotNumber, wrongCount: number) => void;
  onSetPlayer: (team: TeamId, slot: SlotNumber, name: string, index: number) => void;
  onSwapSlots: (fromTeam: TeamId, fromSlot: SlotNumber, toTeam: TeamId, toSlot: SlotNumber) => void;
  onUndo: () => void;
  onThrough: () => void;
  onToggleQuestionPublic: () => void;
  onToggleEditMode: () => void;
  onStart: () => void;
  onReset: () => void;
  onSetQuestion: (q: number) => void;
  onUpdateConfig: (config: Partial<GameConfig>) => void;
  roomId?: string;
};

export default function Scoreboard({
  state,
  isModerator,
  isEditMode,
  canUndo,
  onCorrect,
  onWrong,
  onSetPoints,
  onSetWrongCount,
  onSetPlayer,
  onSwapSlots,
  onUndo,
  onThrough,
  onToggleQuestionPublic,
  onToggleEditMode,
  onStart,
  onReset,
  onSetQuestion,
  onUpdateConfig,
  roomId,
}: ScoreboardProps) {
  const isPlaying = state.status === 'playing';
  const [showModal, setShowModal] = useState(false);
  const [selectedSlot, setSelectedSlot] = useState<{ teamId: TeamId; slotNumber: SlotNumber } | null>(null);

  // 待機中に戻ったら選択スロットをリセット
  useEffect(() => {
    if (state.status === 'waiting') {
      setSelectedSlot(null);
    }
  }, [state.status]);

  // 試合終了になったら自動的に結果モーダルを開く
  useEffect(() => {
    if (state.status === 'finished') {
      setShowModal(true);
    } else {
      setShowModal(false);
    }
  }, [state.status]);

  // 勝利スコア・限定問題数の入力欄はローカルの文字列stateで編集中の値を保持する。
  // グローバルstateに直接bindすると、入力途中（空文字列やparseIntがNaNになる状態）で
  // 即座にデフォルト値へフォールバックしてしまい、キーボード入力が一瞬で巻き戻って見える問題があった。
  const [winningScoreInput, setWinningScoreInput] = useState(String(state.config.winningScore));
  const [maxQuestionsInput, setMaxQuestionsInput] = useState(String(state.config.maxQuestions));
  const isWinningScoreFocused = useRef(false);
  const isMaxQuestionsFocused = useRef(false);

  // 他クライアントからの同期など、フォーカスしていない時だけ外部stateの変更を反映する
  useEffect(() => {
    if (!isWinningScoreFocused.current) {
      setWinningScoreInput(String(state.config.winningScore));
    }
  }, [state.config.winningScore]);

  useEffect(() => {
    if (!isMaxQuestionsFocused.current) {
      setMaxQuestionsInput(String(state.config.maxQuestions));
    }
  }, [state.config.maxQuestions]);

  // セッションストレージから自分のお名前を取得
  const [myPlayerName, setMyPlayerName] = useState('');
  useEffect(() => {
    if (typeof window !== 'undefined') {
      setMyPlayerName(sessionStorage.getItem('my_player_name') || '');
    }
  }, []);

  // 自分がどこかの席に座っているか判定し、座っている場合はチームと枠番を取得
  let myTeam: TeamId | null = null;
  let mySlot: SlotNumber | null = null;
  
  if (myPlayerName !== '') {
    state.teamA.slots.forEach(s => {
      if (s.players.includes(myPlayerName)) {
        myTeam = 'A';
        mySlot = s.slotNumber;
      }
    });
    state.teamB.slots.forEach(s => {
      if (s.players.includes(myPlayerName)) {
        myTeam = 'B';
        mySlot = s.slotNumber;
      }
    });
  }

  const amISeated = myTeam !== null && mySlot !== null;

  const hideEmptySlots = false;

  const showModeratorControls = isModerator && selectedSlot !== null;
  const showPlayerControls = !isModerator && amISeated && myTeam !== null && mySlot !== null;

  const panelTeam = isModerator ? selectedSlot?.teamId : myTeam;
  const panelSlot = isModerator ? selectedSlot?.slotNumber : mySlot;

  const targetSlotInfo = (() => {
    if (!panelTeam || !panelSlot) return null;
    const team = panelTeam === 'A' ? state.teamA : state.teamB;
    return team.slots.find(s => s.slotNumber === panelSlot) || null;
  })();

  const targetPlayersStr = targetSlotInfo ? targetSlotInfo.players.filter(p => p !== '').join(' & ') : '';

  return (
    <div className="scoreboard">
      <GameHeader
        status={state.status}
        currentQuestion={state.currentQuestion}
        maxQuestions={state.config.maxQuestions}
        isQuestionPublic={state.isQuestionPublic}
        isModerator={isModerator}
        isEditMode={isEditMode}
        canUndo={canUndo}
        onToggleQuestionPublic={onToggleQuestionPublic}
        onToggleEditMode={onToggleEditMode}
        onUndo={onUndo}
        onThrough={onThrough}
        onStart={onStart}
        onReset={onReset}
        onSetQuestion={onSetQuestion}
        onShowResults={() => setShowModal(true)}
        roomId={roomId}
      />

      {/* 設定パネル（待機中のみ表示） */}
      {state.status === 'waiting' && isModerator && (
        <div className="config-panel">
          <h3 className="config-panel__title" style={{ display: 'inline-flex', alignItems: 'center', gap: '0.375rem' }}>
            <Settings className="h-5 w-5" />
            <span>試合設定</span>
          </h3>
          <div className="config-panel__grid">
            <label className="config-panel__item">
              <span className="config-panel__label">勝利スコア</span>
              <input
                type="number"
                min="1"
                value={winningScoreInput}
                onFocus={() => { isWinningScoreFocused.current = true; }}
                onChange={(e) => {
                  const raw = e.target.value;
                  setWinningScoreInput(raw);
                  const parsed = parseInt(raw, 10);
                  if (!isNaN(parsed) && parsed > 0) {
                    onUpdateConfig({ winningScore: parsed });
                  }
                }}
                onBlur={() => {
                  isWinningScoreFocused.current = false;
                  setWinningScoreInput(String(state.config.winningScore));
                }}
                className="config-panel__input"
              />
            </label>
            <label className="config-panel__item">
              <span className="config-panel__label">限定問題</span>
              <input
                type="number"
                min="1"
                value={maxQuestionsInput}
                onFocus={() => { isMaxQuestionsFocused.current = true; }}
                onChange={(e) => {
                  const raw = e.target.value;
                  setMaxQuestionsInput(raw);
                  const parsed = parseInt(raw, 10);
                  if (!isNaN(parsed) && parsed > 0) {
                    onUpdateConfig({ maxQuestions: parsed });
                  }
                }}
                onBlur={() => {
                  isMaxQuestionsFocused.current = false;
                  setMaxQuestionsInput(String(state.config.maxQuestions));
                }}
                className="config-panel__input"
              />
            </label>
            <label className="config-panel__item">
              <span className="config-panel__label">枠数</span>
              <select
                value={state.config.slotCount}
                onChange={(e) =>
                  onUpdateConfig({ slotCount: parseInt(e.target.value) })
                }
                className="config-panel__input"
              >
                <option value={3}>3枠</option>
                <option value={4}>4枠</option>
                <option value={5}>5枠</option>
              </select>
            </label>
          </div>
        </div>
      )}

      {/* メインスコアボード */}
      <div className="scoreboard__main">
        <TeamPanel
          team={state.teamA}
          winningScore={state.config.winningScore}
          isPlaying={isPlaying}
          isModerator={isModerator}
          isEditMode={isEditMode}
          onCorrect={onCorrect}
          onWrong={onWrong}
          onSetPoints={onSetPoints}
          onSetWrongCount={onSetWrongCount}
          onSetPlayer={onSetPlayer}
          onSwapSlots={onSwapSlots}
          slotCount={state.config.slotCount}
          hideEmptySlots={hideEmptySlots}
          selectedSlot={selectedSlot}
          onSelectSlot={(tId, sNum) => {
            setSelectedSlot((prev) =>
              prev && prev.teamId === tId && prev.slotNumber === sNum ? null : { teamId: tId, slotNumber: sNum }
            );
          }}
        />

        <div className="scoreboard__divider">
          <span className="scoreboard__vs">VS</span>
        </div>

        <TeamPanel
          team={state.teamB}
          winningScore={state.config.winningScore}
          isPlaying={isPlaying}
          isModerator={isModerator}
          isEditMode={isEditMode}
          onCorrect={onCorrect}
          onWrong={onWrong}
          onSetPoints={onSetPoints}
          onSetWrongCount={onSetWrongCount}
          onSetPlayer={onSetPlayer}
          onSwapSlots={onSwapSlots}
          slotCount={state.config.slotCount}
          hideEmptySlots={hideEmptySlots}
          selectedSlot={selectedSlot}
          onSelectSlot={(tId, sNum) => {
            setSelectedSlot((prev) =>
              prev && prev.teamId === tId && prev.slotNumber === sNum ? null : { teamId: tId, slotNumber: sNum }
            );
          }}
        />
      </div>

      {/* 試合終了モーダル */}
      {state.status === 'finished' && state.result && showModal && (
        <GameOverModal
          result={state.result}
          onReset={onReset}
          onClose={() => setShowModal(false)}
        />
      )}

      {/* 正誤判定コントロールパネル */}
      {isPlaying && (showModeratorControls || showPlayerControls) && panelTeam && panelSlot && (
        <div className="player-control-panel">
          <div className="player-control-panel__info">
            {isModerator ? (
              <span className="text-amber-400 font-extrabold flex items-center gap-1.5 justify-center">
                <span className="h-2 w-2 rounded-full bg-amber-500 animate-pulse" />
                判定中: {panelTeam === 'A' ? 'Aチーム' : 'Bチーム'} {panelSlot}番 ({targetPlayersStr || '空席'})
              </span>
            ) : (
              <span className="text-slate-300 font-semibold justify-center flex">
                あなた: {panelTeam === 'A' ? 'Aチーム' : 'Bチーム'} {panelSlot}番
              </span>
            )}
          </div>
          <div className="player-control-panel__buttons">
            <button
              className="btn-huge btn-huge--correct"
              onClick={() => onCorrect(panelTeam, panelSlot)}
              disabled={targetSlotInfo ? !targetSlotInfo.isActive : true}
            >
              ◯ 正解
            </button>
            <button
              className="btn-huge btn-huge--wrong"
              onClick={() => onWrong(panelTeam, panelSlot)}
              disabled={targetSlotInfo ? !targetSlotInfo.isActive : true}
            >
              ✕ 誤答
            </button>
          </div>
          <div className="player-control-panel__footer">
            <button className="btn btn--undo" onClick={onUndo} disabled={!canUndo}>
              undo（1手戻す）
            </button>
            {isModerator && (
              <button
                className="btn btn--toggle ml-3 bg-slate-800 border border-slate-700 text-slate-300 hover:bg-slate-700 hover:text-white"
                onClick={() => setSelectedSlot(null)}
              >
                選択解除
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
