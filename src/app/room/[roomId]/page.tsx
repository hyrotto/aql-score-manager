'use client';

import React, { useState, useEffect, use } from 'react';
import Scoreboard from '@/components/Scoreboard';
import { useGameState } from '@/hooks/useGameState';

interface PageProps {
  params: Promise<{ roomId: string }>;
}

export default function RoomPage({ params }: PageProps) {
  const { roomId } = use(params);
  const [isEditMode, setIsEditMode] = useState(false);
  const [myPlayerName, setMyPlayerName] = useState('');

  const {
    state,
    handleCorrect,
    handleWrong,
    handleUndo,
    handleThrough,
    setPlayer,
    swapSlots,
    setWrongCount,
    setPoints,
    setQuestion,
    toggleQuestionPublic,
    resetGame,
    startGame,
    updateConfig,
    canUndo,
    loading,
    error,
    becomeModerator,
  } = useGameState(roomId);

  // ローカルストレージから自分のお名前を取得
  useEffect(() => {
    if (typeof window !== 'undefined') {
      setMyPlayerName(localStorage.getItem('my_player_name') || 'ゲスト');
    }
  }, []);

  // DBの状態をもとに、自分が司会者であるか判定する
  const isModerator = state && state.moderatorName !== null && state.moderatorName === myPlayerName;

  const handleToggleEditMode = () => {
    setIsEditMode((prev) => !prev);
  };

  const handleBecomeModerator = () => {
    if (!state) return;
    if (state.moderatorName) {
      alert(`現在、${state.moderatorName} さんが司会席にいます。`);
      return;
    }
    becomeModerator(myPlayerName);
    alert('司会者になりました。試合の操作が可能です。');
  };

  const handleLeaveModerator = () => {
    becomeModerator(null);
    alert('司会席から離れました。');
  };

  const copyRoomLink = () => {
    if (typeof window !== 'undefined') {
      const url = `${window.location.origin}/room/${roomId}`;
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(url)
          .then(() => {
            alert('ルームURLをコピーしました！他のプレイヤーに共有してください。');
          })
          .catch((err) => {
            console.error('Failed to copy: ', err);
            alert(`ルームID: ${roomId}`);
          });
      } else {
        alert(`コピー機能がサポートされていません。\nルームURL: ${url}`);
      }
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-950 text-white font-sans">
        <div className="flex flex-col items-center gap-4">
          <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-amber-500"></div>
          <p className="text-slate-400">ルームを読み込んでいます...</p>
        </div>
      </div>
    );
  }

  if (error || !state) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-950 text-white font-sans p-4">
        <div className="max-w-md w-full bg-slate-900 border border-red-500/30 rounded-2xl p-6 text-center shadow-xl">
          <h2 className="text-xl font-bold text-red-500 mb-2">エラーが発生しました</h2>
          <p className="text-slate-300 mb-6">{error || 'ルーム状態の読み込みに失敗しました。'}</p>
          <a
            href="/"
            className="inline-block w-full py-3 px-4 bg-amber-500 hover:bg-amber-600 active:scale-95 transition-all text-slate-950 font-bold rounded-xl shadow-lg shadow-amber-500/20"
          >
            トップページに戻る
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 text-white font-sans pb-16 relative">
      <Scoreboard
        state={state}
        isModerator={isModerator}
        isEditMode={isEditMode}
        canUndo={canUndo}
        onCorrect={handleCorrect}
        onWrong={handleWrong}
        onSetPoints={setPoints}
        onSetWrongCount={setWrongCount}
        onSetPlayer={setPlayer}
        onSwapSlots={swapSlots}
        onUndo={handleUndo}
        onThrough={handleThrough}
        onToggleQuestionPublic={toggleQuestionPublic}
        onToggleEditMode={handleToggleEditMode}
        onStart={startGame}
        onReset={resetGame}
        onSetQuestion={setQuestion}
        onUpdateConfig={updateConfig}
        roomId={roomId}
      />
      
      {/* 画面下部のルームID表示＆コントロールフッター */}
      <footer className="fixed bottom-0 left-0 right-0 bg-slate-900/90 backdrop-blur-md border-t border-slate-800/80 py-3.5 px-4 flex items-center justify-between z-40 text-sm shadow-xl shadow-black/80">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <span className="text-slate-400 font-semibold text-xs tracking-wider uppercase">ROOM:</span>
            <span className="font-mono bg-slate-950 px-2.5 py-1 rounded-lg border border-slate-800 font-extrabold text-amber-400 tracking-widest text-sm">
              {roomId}
            </span>
          </div>
          <button
            onClick={copyRoomLink}
            className="py-1 px-3 bg-slate-800 hover:bg-slate-700 active:scale-95 text-xs font-bold rounded-lg border border-slate-700 text-slate-300 transition-all"
          >
            URLコピー
          </button>
        </div>

        <div className="flex items-center gap-2">
          {isModerator ? (
            /* 自分が司会者のとき */
            <div className="flex items-center gap-3">
              <span className="text-emerald-400 font-bold text-xs flex items-center gap-1">
                司会者：あなた
              </span>
              <button
                onClick={handleLeaveModerator}
                className="py-1.5 px-3 bg-red-600/20 hover:bg-red-600/40 active:scale-95 text-red-400 font-bold text-xs rounded-lg border border-red-500/20 transition-all"
              >
                離席する
              </button>
            </div>
          ) : state.moderatorName ? (
            /* 他の人が司会者のとき */
            <span className="text-slate-400 text-xs font-semibold bg-slate-950/50 px-3 py-1.5 rounded-lg border border-slate-800/60">
              司会：{state.moderatorName} 
            </span>
          ) : (
            /* 誰も司会者でないとき */
            <div className="flex items-center gap-3">
              <span className="text-slate-500 text-xs font-semibold">
                司会者不在
              </span>
              <button
                onClick={handleBecomeModerator}
                className="py-1.5 px-3 bg-amber-500 hover:bg-amber-600 active:scale-95 text-slate-950 font-bold text-xs rounded-lg transition-all shadow-md shadow-amber-500/10"
              >
                司会者になる
              </button>
            </div>
          )}
        </div>
      </footer>
    </div>
  );
}
