'use client';

import React from 'react';
import { GameStatus } from '../lib/types';
import { LogOut, Trophy } from 'lucide-react';

type GameHeaderProps = {
  status: GameStatus;
  currentQuestion: number;
  maxQuestions: number;
  isQuestionPublic: boolean;
  isModerator: boolean;
  isEditMode: boolean;
  canUndo: boolean;
  onToggleQuestionPublic: () => void;
  onToggleEditMode: () => void;
  onUndo: () => void;
  onThrough: () => void;
  onStart: () => void;
  onReset: () => void;
  onSetQuestion: (q: number) => void;
  onShowResults?: () => void;
  roomId?: string;
};

export default function GameHeader({
  status,
  currentQuestion,
  maxQuestions,
  isQuestionPublic,
  isModerator,
  isEditMode,
  canUndo,
  onToggleQuestionPublic,
  onToggleEditMode,
  onUndo,
  onThrough,
  onStart,
  onReset,
  onSetQuestion,
  onShowResults,
  roomId,
}: GameHeaderProps) {
  const statusLabels: Record<GameStatus, string> = {
    waiting: '待機中',
    playing: '試合中',
    finished: '試合終了',
  };

  const statusColors: Record<GameStatus, string> = {
    waiting: 'status--waiting',
    playing: 'status--playing',
    finished: 'status--finished',
  };

  return (
    <header className="game-header">
      <div className="game-header__left">
        <a href="/" className="btn btn--leave-room" title="トップページに戻る" style={{ display: 'inline-flex', alignItems: 'center', gap: '0.375rem' }}>
          <LogOut className="h-4 w-4" />
          <span className="responsive-hide-text">退席</span>
        </a>
        {status !== 'playing' && (
          <h1 className="game-header__title responsive-hide-title">10by10by10<span className="game-header__title-mini">mini</span></h1>
        )}
        <span className={`game-header__status ${statusColors[status]}`}>
          {statusLabels[status]}
        </span>
      </div>

      <div className="game-header__center">
        {/* 問題番号（司会者には常に表示、他のユーザーには公開時のみ表示） */}
        {(isModerator || isQuestionPublic) && status === 'playing' && (
          <div className="game-header__question-wrapper">
          <div className={`game-header__question ${!isQuestionPublic ? 'game-header__question--private' : ''} ${currentQuestion >= maxQuestions ? 'game-header__question--over-limit' : ''}`}>
              {isModerator && isEditMode ? (
                <div className="game-header__question-edit">
                  <span className="game-header__question-label">Q.</span>
                  <input
                    type="number"
                    min="1"
                    max={maxQuestions}
                    value={currentQuestion}
                    onChange={(e) => onSetQuestion(parseInt(e.target.value) || 1)}
                    className="game-header__question-input"
                  />
                  <span className="game-header__question-sep">/ {maxQuestions}</span>
                </div>
              ) : (
                <span className="game-header__question-text">
                  Q.{currentQuestion} / {maxQuestions}
                </span>
              )}
            </div>

            {/* 司会者用の公開/非公開トグルスイッチ */}
            {isModerator && (
              <div className="game-header__visibility-controls">
                <span className="game-header__visibility-label">
                  {isQuestionPublic ? '公開中' : '非公開'}
                </span>
                <label className="game-header__switch">
                  <input
                    type="checkbox"
                    checked={isQuestionPublic}
                    onChange={onToggleQuestionPublic}
                    className="game-header__switch-input"
                  />
                  <span className="game-header__switch-slider"></span>
                </label>
              </div>
            )}
          </div>
        )}
      </div>

      <div className="game-header__right">
        {/* 司会者専用コントロール */}
        {isModerator && (
          <>
            {status === 'waiting' && (
              <button className="btn btn--start" onClick={onStart}>
                ▶ 試合開始
              </button>
            )}

            {status === 'playing' && (
              <>
                <button
                  className="btn btn--through"
                  onClick={onThrough}
                  title="スルー（限定問題数+1）"
                >
                  スルー
                </button>

                <button
                  className={`btn btn--toggle ${isEditMode ? 'btn--active' : ''}`}
                  onClick={onToggleEditMode}
                  title="スコア修正"
                >
                  {isEditMode ? 'スコア修正中' : 'スコア修正'}
                </button>

                <button
                  className="btn btn--undo"
                  onClick={onUndo}
                  disabled={!canUndo}
                  title="undo"
                >
                  undo
                </button>
              </>
            )}

            {status === 'finished' && onShowResults && (
              <button className="btn btn--toggle btn--active" onClick={onShowResults} style={{ display: 'inline-flex', alignItems: 'center', gap: '0.375rem' }}>
                <Trophy className="h-4 w-4" />
                <span>結果を表示</span>
              </button>
            )}

            {(status === 'finished' || status === 'playing') && (
              <button className="btn btn--reset" onClick={() => { if (window.confirm('本当にゲームをリセットしますか？')) onReset(); }}>
                reset
              </button>
            )}
          </>
        )}
      </div>
    </header>
  );
}
