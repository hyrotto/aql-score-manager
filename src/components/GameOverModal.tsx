'use client';

import React from 'react';
import { GameResult } from '../lib/types';
import { Trophy } from 'lucide-react';

type GameOverModalProps = {
  result: GameResult;
  onReset: () => void;
  onClose: () => void;
};

export default function GameOverModal({ result, onReset, onClose }: GameOverModalProps) {
  const reasonLabels = {
    score_reached: '目標スコア到達！',
    burst: 'バースト（全枠解答権喪失）！',
    time_up: '問題数上限到達',
  };

  const getWinnerText = () => {
    if (result.winner === 'draw') return '引き分け';
    return `${result.winner} チーム 勝利！`;
  };

  return (
    <div className="modal-overlay">
      <div className="modal">
        <button className="modal__close-btn" onClick={onClose} title="閉じて盤面を確認">
          ✕
        </button>

        <div className="modal__header">
          <h2 className="modal__title" style={{ display: 'inline-flex', alignItems: 'center', gap: '0.375rem', justifyContent: 'center', width: '100%' }}>
            <Trophy className="h-6 w-6 text-amber-400" />
            <span>試合終了</span>
          </h2>
        </div>

        <div className="modal__body">
          <p className="modal__reason">{reasonLabels[result.reason]}</p>

          <div className="modal__result">
            <span className="modal__winner">{getWinnerText()}</span>
          </div>

          <div className="modal__scores">
            <div className={`modal__team-score modal__team-score--a ${result.winner === 'A' ? 'modal__team-score--winner' : ''}`}>
              <span className="modal__team-label">A チーム</span>
              <span className="modal__team-points">{result.scoreA} pts</span>
            </div>
            <div className="modal__vs">VS</div>
            <div className={`modal__team-score modal__team-score--b ${result.winner === 'B' ? 'modal__team-score--winner' : ''}`}>
              <span className="modal__team-label">B チーム</span>
              <span className="modal__team-points">{result.scoreB} pts</span>
            </div>
          </div>
        </div>

        <div className="modal__footer">
          <button className="btn btn--primary" onClick={() => { if (window.confirm('本当に新しい試合を始めますか？')) onReset(); }}>
            新しい試合を始める
          </button>
        </div>
      </div>
    </div>
  );
}
