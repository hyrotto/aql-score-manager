'use client';

import React, { useState, useEffect, use } from 'react';
import Scoreboard from '@/components/Scoreboard';
import { useGameState } from '@/hooks/useGameState';
import { PLACEHOLDER_NAMES } from '@/lib/constants';

interface PageProps {
  params: Promise<{ roomId: string }>;
}

export default function RoomPage({ params }: PageProps) {
  const { roomId } = use(params);
  const [isEditMode, setIsEditMode] = useState(false);
  const [myPlayerName, setMyPlayerName] = useState('');
  const [placeholderName, setPlaceholderName] = useState('史上最強の漁師');
  const [isMounted, setIsMounted] = useState(false);

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

  // ローカルストレージから自分のお名前を取得、およびプレースホルダー設定
  useEffect(() => {
    setIsMounted(true);
    if (typeof window !== 'undefined') {
      const name = localStorage.getItem('my_player_name');
      if (name) {
        setMyPlayerName(name);
      } else {
        setMyPlayerName('');
      }

      // ランダムなプレースホルダーを設定
      const randomIndex = Math.floor(Math.random() * PLACEHOLDER_NAMES.length);
      setPlaceholderName(PLACEHOLDER_NAMES[randomIndex]);
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

  // 他の人が司会席にいるとき、司会席をタップして司会権を奪う
  const handleSeizeModerator = () => {
    if (!state || !state.moderatorName) return;
    const ok = window.confirm(
      `現在 ${state.moderatorName} さんが司会席にいます。\n司会権を奪って、あなた（${myPlayerName}）が司会者になりますか？\n※${state.moderatorName} さんが操作中の場合はご注意ください。`
    );
    if (!ok) return;
    becomeModerator(myPlayerName);
    alert('司会権を奪いました。試合の操作が可能です。');
  };

  const copyRoomLink = () => {
    if (typeof window !== 'undefined') {
      const url = `${window.location.origin}/room/${roomId}`;
      
      const fallbackCopy = (text: string) => {
        try {
          const textArea = document.createElement('textarea');
          textArea.value = text;
          textArea.style.position = 'fixed';
          textArea.style.top = '0';
          textArea.style.left = '0';
          textArea.style.opacity = '0';
          document.body.appendChild(textArea);
          textArea.focus();
          textArea.select();
          
          const successful = document.execCommand('copy');
          document.body.removeChild(textArea);
          
          if (successful) {
            alert('ルームURLをコピーしました！他のプレイヤーに共有してください。');
          } else {
            alert(`コピーに失敗しました。\nルームURL: ${text}`);
          }
        } catch (err) {
          console.error('Fallback copy failed:', err);
          alert(`コピーに失敗しました。\nルームURL: ${text}`);
        }
      };

      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(url)
          .then(() => {
            alert('ルームURLをコピーしました！他のプレイヤーに共有してください。');
          })
          .catch((err) => {
            console.error('Failed to copy via Clipboard API: ', err);
            fallbackCopy(url);
          });
      } else {
        fallbackCopy(url);
      }
    }
  };

  if (!isMounted || loading) {
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

  // お名前が設定されていない場合は、名前入力モーダルを表示して進めないようにする
  if (!myPlayerName) {
    const handleSaveName = (e: React.FormEvent<HTMLFormElement>) => {
      e.preventDefault();
      const formData = new FormData(e.currentTarget);
      const name = (formData.get('playerNameInput') as string || '').trim();
      if (!name) return;

      localStorage.setItem('my_player_name', name);
      setMyPlayerName(name);
    };

    return (
      <main className="min-h-screen bg-slate-950 text-white font-sans flex flex-col justify-center items-center p-4 relative overflow-hidden select-none">
        {/* 背景装飾 */}
        <div className="absolute top-[-10%] left-[-10%] w-[50%] h-[50%] bg-blue-500/10 rounded-full blur-[120px] pointer-events-none" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[50%] h-[50%] bg-amber-500/10 rounded-full blur-[120px] pointer-events-none" />

        <div className="max-w-md w-full bg-slate-900/60 backdrop-blur-xl border border-slate-800 rounded-3xl p-6 md:p-8 shadow-2xl shadow-black/50 z-10">
          <div className="text-center mb-6">
            <div className="inline-block px-4 py-1.5 bg-gradient-to-r from-amber-500/20 to-blue-500/20 border border-slate-700/50 rounded-full text-xs font-semibold tracking-wider text-amber-400 mb-3 uppercase">
              ROOM ID: {roomId}
            </div>
            <h2 className="text-2xl font-bold tracking-tight bg-gradient-to-r from-white to-slate-400 bg-clip-text text-transparent">
              プレイヤー名を入力
            </h2>
            <p className="text-xs text-slate-400 mt-2">
              このルームに参加するために、表示されるお名前を入力してください。
            </p>
          </div>

          <form onSubmit={handleSaveName} className="space-y-5">
            <div>
              <label htmlFor="modal-player-name" className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">
                お名前
              </label>
              <input
                id="modal-player-name"
                name="playerNameInput"
                type="text"
                placeholder={`例: ${placeholderName}`}
                required
                maxLength={20}
                autoComplete="off"
                className="w-full bg-slate-950 border border-slate-800 focus:border-amber-500/50 focus:ring-2 focus:ring-amber-500/20 rounded-2xl py-3.5 px-4 text-center text-base font-semibold text-white placeholder:text-slate-700 outline-none transition-all"
              />
            </div>

            <button
              type="submit"
              className="w-full py-4 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700 active:scale-[0.98] text-slate-950 font-bold rounded-2xl transition-all duration-200 shadow-lg shadow-amber-500/20"
            >
              入室する
            </button>
          </form>
        </div>
      </main>
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
          <div className="flex items-center gap-2">
            <span className="text-slate-400 font-semibold text-xs tracking-wider uppercase">ROOM:</span>
            <span
              onClick={copyRoomLink}
              title="タップしてURLをコピー"
              className="font-mono bg-slate-950 hover:bg-slate-900 active:scale-95 px-2.5 py-1 rounded-lg border border-slate-800 hover:border-slate-700 font-extrabold text-amber-400 hover:text-amber-300 tracking-widest text-sm cursor-pointer transition-all duration-200"
            >
              {roomId}
            </span>
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
            /* 他の人が司会者のとき（タップで司会権を奪える） */
            <button
              onClick={handleSeizeModerator}
              title="タップして司会権を奪う"
              className="text-slate-400 hover:text-amber-300 text-xs font-semibold bg-slate-950/50 hover:bg-slate-900/60 active:scale-95 px-3 py-1.5 rounded-lg border border-slate-800/60 hover:border-amber-500/30 transition-all"
            >
              司会：{state.moderatorName}
            </button>
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
