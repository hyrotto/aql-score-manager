'use client';

import React from 'react';
import { TeamState, TeamId, SlotNumber } from '../lib/types';
import SlotCard from './SlotCard';
import { isReach } from '../lib/gameLogic';

type TeamPanelProps = {
  team: TeamState;
  winningScore: number;
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
  hideEmptySlots?: boolean;
  selectedSlot?: { teamId: TeamId; slotNumber: SlotNumber } | null;
  onSelectSlot?: (teamId: TeamId, slotNumber: SlotNumber) => void;
};

export default function TeamPanel({
  team,
  winningScore,
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
  hideEmptySlots = false,
  selectedSlot,
  onSelectSlot,
}: TeamPanelProps) {
  const isTeamA = team.teamId === 'A';

  // Aチームの場合は枠順を逆（5, 4, 3, 2, 1）にして内側に1が来るようにする
  let orderedSlots = isTeamA ? [...team.slots].reverse() : team.slots;

  // 空席非表示フラグが有効な場合、誰も座っていない枠を除外するが、空席の枠を最大1つだけ残す
  if (hideEmptySlots) {
    const occupiedSlots = orderedSlots.filter(slot => slot.players.some(p => p !== ''));
    const emptySlots = orderedSlots.filter(slot => !slot.players.some(p => p !== ''));
    
    if (emptySlots.length > 0) {
      const minEmptySlot = emptySlots.reduce((prev, curr) => 
        prev.slotNumber < curr.slotNumber ? prev : curr
      );
      orderedSlots = orderedSlots.filter(slot => 
        slot.players.some(p => p !== '') || slot.slotNumber === minEmptySlot.slotNumber
      );
    } else {
      orderedSlots = occupiedSlots;
    }
  }

  // 全枠のポイント計算式を表示用に生成
  const formulaParts = team.slots.map((s) => s.points);
  const formulaStr = formulaParts.join(' × ');

  // チームがバースト状態か
  const allInactive = team.slots.every((s) => !s.isActive);

  return (
    <div className={`team-panel ${isTeamA ? 'team-panel--a' : 'team-panel--b'}`}>
      {/* チーム名とバーストバッジ */}
      <div className="team-panel__header">
        <h2 className="team-panel__name">
          {isTeamA ? 'A' : 'B'} チーム
        </h2>
        {allInactive && (
          <span className="team-panel__burst-badge">BURST</span>
        )}
      </div>

      {/* 総得点 */}
      <div className="team-panel__score-area">
        <div className="team-panel__total-score">
          {team.totalScore}
        </div>
        <div className="team-panel__formula">{formulaStr}</div>
      </div>

      {/* 枠番カード一覧（横並び） */}
      <div className="team-panel__slots">
        {orderedSlots.map((slot) => (
          <SlotCard
            key={slot.slotNumber}
            slot={slot}
            teamId={team.teamId}
            isReach={isReach(team, slot.slotNumber, winningScore)}
            isPlaying={isPlaying}
            isModerator={isModerator}
            isEditMode={isEditMode}
            onCorrect={onCorrect}
            onWrong={onWrong}
            onSetPoints={onSetPoints}
            onSetWrongCount={onSetWrongCount}
            onSetPlayer={onSetPlayer}
            onSwapSlots={onSwapSlots}
            slotCount={slotCount}
            isSelected={selectedSlot?.teamId === team.teamId && selectedSlot?.slotNumber === slot.slotNumber}
            onSelect={onSelectSlot}
          />
        ))}
      </div>
    </div>
  );
}
