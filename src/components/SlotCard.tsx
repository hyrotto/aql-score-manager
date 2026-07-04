'use client';
import React, { useState, useEffect } from 'react';
import { SlotState, TeamId, SlotNumber } from '../lib/types';

type SlotCardProps = {
  slot: SlotState;
  teamId: TeamId;
  isReach: boolean;
  isPlaying: boolean;
  isModerator: boolean;
  isEditMode: boolean;
  onCorrect: (team: TeamId, slot: SlotNumber) => void;
  onWrong: (team: TeamId, slot: SlotNumber) => void;
  onSetPoints: (team: TeamId, slot: SlotNumber, points: number) => void;
  onSetWrongCount: (team: TeamId, slot: SlotNumber, wrongCount: number) => void;
  onSetPlayer: (team: TeamId, slot: SlotNumber, name: string, index: number) => void;
  onSwapSlots: (fromTeam: TeamId, fromSlot: SlotNumber, toTeam: TeamId, toSlot: SlotNumber) => void;
  slotCount: number;
  isSelected?: boolean;
  onSelect?: (teamId: TeamId, slotNumber: SlotNumber) => void;
};

export default function SlotCard({
  slot,
  teamId,
  isReach,
  isPlaying,
  isModerator,
  isEditMode,
  onCorrect,
  onWrong,
  onSetPoints,
  onSetWrongCount,
  onSetPlayer,
  onSwapSlots,
  slotCount,
  isSelected = false,
  onSelect,
}: SlotCardProps) {
  const isTeamA = teamId === 'A';

  const [isTouchDevice, setIsTouchDevice] = useState(false);

  useEffect(() => {
    setIsTouchDevice(
      'ontouchstart' in window ||
      navigator.maxTouchPoints > 0
    );
  }, []);

  const canDrag = isModerator && !isTouchDevice;

  // ローカルストレージから自分のお名前を取得
  const [myPlayerName, setMyPlayerName] = useState('');
  useEffect(() => {
    if (typeof window !== 'undefined') {
      setMyPlayerName(localStorage.getItem('my_player_name') || '');
    }
  }, []);

  // 自分がこの枠のいずれかの席に座っているか
  const isMeInSlot = myPlayerName !== '' && slot.players.includes(myPlayerName);

  // リーチ時のみ光るようにする。1✕では光らせない
  const getStatusClass = () => {
    if (!slot.isActive) return 'slot-card--dead';
    if (isReach) return 'slot-card--reach';
    return '';
  };

  // ドラッグ＆ドロップ用ハンドラー
  const handleDragStart = (e: React.DragEvent) => {
    if (!canDrag) return;
    e.dataTransfer.setData('application/json', JSON.stringify({ teamId, slotNumber: slot.slotNumber }));
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e: React.DragEvent) => {
    if (!canDrag) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  };

  const handleDrop = (e: React.DragEvent) => {
    if (!canDrag) return;
    e.preventDefault();
    try {
      const dataStr = e.dataTransfer.getData('application/json');
      if (!dataStr) return;
      const source = JSON.parse(dataStr);
      if (source.teamId && source.slotNumber) {
        // 自分自身へのドロップは無視
        if (source.teamId === teamId && source.slotNumber === slot.slotNumber) return;
        onSwapSlots(source.teamId, source.slotNumber, teamId, slot.slotNumber);
      }
    } catch (err) {
      console.error('Drop error:', err);
    }
  };

  return (
    <div
      className={`slot-card ${getStatusClass()} ${isTeamA ? 'slot-card--team-a' : 'slot-card--team-b'} ${canDrag ? 'slot-card--draggable' : ''} ${isSelected ? 'slot-card--selected' : ''}`}
      draggable={canDrag}
      onDragStart={handleDragStart}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
      onClick={() => isModerator && onSelect && onSelect(teamId, slot.slotNumber)}
      title={canDrag ? 'ドラッグして他の枠と選手を入れ替え' : undefined}
    >
      {/* 枠番号 */}
      <div className="slot-card__header">
        <span className="slot-card__number">{slot.slotNumber}</span>
        {isReach && slot.isActive && (
          <span className="slot-card__badge badge--reach">REACH!</span>
        )}
      </div>

      {/* プレイヤー名 */}
      <div className="slot-card__players">
        {[0, 1].map((idx) => {
          const pName = slot.players[idx] || '';
          
          if (isModerator) {
            return (
              <div key={idx} className="slot-card__player-row flex items-center gap-1.5 w-full">
                <input
                  type="text"
                  value={pName}
                  onChange={(e) =>
                    onSetPlayer(teamId, slot.slotNumber, e.target.value, idx)
                  }
                  placeholder={`選手 ${idx + 1}`}
                  className="slot-card__player-input flex-1 min-w-0"
                />
                {pName && (
                  <button
                    type="button"
                    onClick={() => onSetPlayer(teamId, slot.slotNumber, '', idx)}
                    className="p-1 text-slate-500 hover:text-red-400 active:scale-95 transition-all text-sm font-extrabold cursor-pointer"
                    title="この選手を離席させる"
                  >
                    ✕
                  </button>
                )}
              </div>
            );
          }

          // 一般プレイヤー用: 着席・離席ボタン
          const isMe = pName !== '' && pName === myPlayerName;

          return (
            <div key={idx} className="slot-card__player-row slot-card__player-row--visitor">
              {pName ? (
                <span className={`slot-card__player-text ${isMe ? 'slot-card__player-text--me' : ''}`}>
                  {pName}
                </span>
              ) : (
                <span className="slot-card__player-placeholder"></span>
              )}
              {myPlayerName && pName === '' && (
                <button
                  type="button"
                  onClick={() => onSetPlayer(teamId, slot.slotNumber, myPlayerName, idx)}
                  className="btn-sit-in"
                  title={`${myPlayerName}として着席`}
                >
                  着席
                </button>
              )}
              {isMe && (
                <button
                  type="button"
                  onClick={() => onSetPlayer(teamId, slot.slotNumber, '', idx)}
                  className="btn-sit-in btn-sit-in--leave"
                  title="離席"
                >
                  離席
                </button>
              )}
            </div>
          );
        })}
      </div>

      {/* 得点表示（枠の下側） */}
      <div className="slot-card__points-area">
        {isEditMode && isModerator ? (
          <input
            type="number"
            min="1"
            value={slot.points}
            onChange={(e) =>
              onSetPoints(teamId, slot.slotNumber, parseInt(e.target.value) || 1)
            }
            className="slot-card__points-input"
          />
        ) : (
          <span className="slot-card__points">{slot.points}</span>
        )}
        <span className="slot-card__points-label">pt</span>
      </div>

      {/* 誤答状況ドット（さらに下側、誤答するとバツ） */}
      <div className={`slot-card__dots ${isEditMode && isModerator ? 'slot-card__dots--editable' : ''}`}>
        <span
          className={`slot-card__dot ${slot.wrongCount >= 1 ? 'slot-card__dot--wrong' : 'slot-card__dot--active'}`}
          onClick={() => {
            if (isEditMode && isModerator) {
              // 1✕をトグル：1なら0に、それ以外なら1に設定
              onSetWrongCount(teamId, slot.slotNumber, slot.wrongCount === 1 ? 0 : 1);
            }
          }}
          title={isEditMode && isModerator ? '誤答数を変更' : undefined}
        >
          {slot.wrongCount >= 1 ? '✕' : '●'}
        </span>
        <span
          className={`slot-card__dot ${slot.wrongCount >= 2 ? 'slot-card__dot--wrong' : 'slot-card__dot--active'}`}
          onClick={() => {
            if (isEditMode && isModerator) {
              // 2✕をトグル：2なら1に、それ以外なら2に設定
              onSetWrongCount(teamId, slot.slotNumber, slot.wrongCount === 2 ? 1 : 2);
            }
          }}
          title={isEditMode && isModerator ? '解答権をトグル' : undefined}
        >
          {slot.wrongCount >= 2 ? '✕' : '●'}
        </span>
      </div>

    </div>
  );
}

