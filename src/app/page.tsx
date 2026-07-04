'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { createInitialGameState } from '@/lib/gameLogic';
import { PLACEHOLDER_NAMES } from '@/lib/constants';
import { DbRoomState } from '@/lib/types';

// ランダムなルームIDの生成（数字5桁）
const generateRoomId = () => {
  const chars = '0123456789';
  let result = '';
  for (let i = 0; i < 5; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
};

export default function Home() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<'join' | 'create'>('join');
  
  // 入力フォームの状態
  const [roomId, setRoomId] = useState('');
  const [playerName, setPlayerName] = useState('');
  const [placeholderName, setPlaceholderName] = useState('史上最強の漁師');
  const [isMounted, setIsMounted] = useState(false);
  
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // マウント時にランダムなプレースホルダー名を選択（ハイドレーションエラー防止）
  useEffect(() => {
    setIsMounted(true);
    const randomIndex = Math.floor(Math.random() * PLACEHOLDER_NAMES.length);
    setPlaceholderName(PLACEHOLDER_NAMES[randomIndex]);

    // 前回入力した名前があれば自動入力する（localStorage なのでタブ・ブラウザを閉じても残る）
    const savedName = localStorage.getItem('my_player_name');
    if (savedName) {
      setPlayerName(savedName);
    }
  }, []);

  // ルームへの参加処理
  const handleJoinRoom = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!roomId || !playerName) {
      setError('ルームIDとお名前を入力してください。');
      return;
    }

    setLoading(true);
    setError('');

    const upperRoomId = roomId.trim().toUpperCase();

    try {
      // ルームの存在確認
      const { data, error: fetchError } = await supabase
        .from('rooms')
        .select('id')
        .eq('id', upperRoomId)
        .single();

      if (fetchError || !data) {
        setError('指定されたルームIDが見つかりません。');
        setLoading(false);
        return;
      }

      // お名前を保存（次回アクセス時のプリセット・司会者の自動復帰に使う）
      localStorage.setItem('my_player_name', playerName.trim());

      // ルームページへ遷移
      router.push(`/room/${upperRoomId}`);
    } catch (err) {
      console.error(err);
      setError('ルームの検索中にエラーが発生しました。');
      setLoading(false);
    }
  };

  // ルームの作成処理
  const handleCreateRoom = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!playerName) {
      setError('お名前を入力してください。');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const newRoomId = generateRoomId();
      
      // パスワードなしなので、password_hashは空の文字列を入れる
      // デフォルト設定：勝利スコア10点、最大問題数40問、初期スロット数5枠
      const initialState = createInitialGameState({
        winningScore: 200,
        maxQuestions: 40,
        slotCount: 5,
      });
      initialState.moderatorName = playerName.trim();

      // rooms.state はスナップショット（baseState）専用。作成時点では操作履歴が無く、
      // 以降のアクションは room_actions テーブルへ INSERT していく。
      // currentState をそのまま baseState とすることで currentState = replay(baseState, []) が成り立つ。
      const dbState: DbRoomState = {
        currentState: initialState,
        baseState: initialState,
      };

      const { error: insertError } = await supabase.from('rooms').insert({
        id: newRoomId,
        password_hash: '', // 空文字でインサート
        state: dbState,
      });

      if (insertError) {
        console.error(insertError);
        setError('ルームの作成に失敗しました。もう一度お試しください。');
        setLoading(false);
        return;
      }

      // お名前を保存（次回アクセス時のプリセット・司会者の自動復帰に使う）
      localStorage.setItem('my_player_name', playerName.trim());

      // ルームページへ遷移
      router.push(`/room/${newRoomId}`);
    } catch (err) {
      console.error(err);
      setError('ルームの作成中にエラーが発生しました。');
      setLoading(false);
    }
  };

  return (
    <main className="min-h-screen bg-slate-950 text-white font-sans flex flex-col justify-center items-center p-4 relative overflow-hidden select-none">
      {/* 背景のグラデーション装飾 */}
      <div className="absolute top-[-10%] left-[-10%] w-[50%] h-[50%] bg-blue-500/10 rounded-full blur-[120px] pointer-events-none" />
      <div className="absolute bottom-[-10%] right-[-10%] w-[50%] h-[50%] bg-amber-500/10 rounded-full blur-[120px] pointer-events-none" />

      <div className="max-w-md w-full z-10">
        {/* ロゴエリア */}
        <div className="text-center mb-8">
          <div className="inline-block px-4 py-1.5 bg-gradient-to-r from-amber-500/20 to-blue-500/20 border border-slate-700/50 rounded-full text-xs font-semibold tracking-wider text-amber-400 mb-3 uppercase">
            AQL 10by10by10mini Score Manager
          </div>
          <h1 className="text-4xl font-extrabold tracking-tight bg-gradient-to-r from-white via-slate-100 to-slate-400 bg-clip-text text-transparent">
            AQL Score Manager
          </h1>
          <p className="text-sm text-slate-400 mt-2">
            リアルタイムで同期するクイズ得点管理システム
          </p>
        </div>

        {/* メインカード */}
        <div className="bg-slate-900/60 backdrop-blur-xl border border-slate-800 rounded-3xl p-6 md:p-8 shadow-2xl shadow-black/50">
          {/* タブ切り替え */}
          <div className="grid grid-cols-2 gap-1 p-1 bg-slate-950/80 border border-slate-800/80 rounded-2xl mb-6">
            <button
              onClick={() => {
                setActiveTab('join');
                setError('');
              }}
              className={`py-3 text-sm font-bold rounded-xl transition-all duration-200 ${
                activeTab === 'join'
                  ? 'bg-slate-800 text-amber-400 shadow-md'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              ルームに参加する
            </button>
            <button
              onClick={() => {
                setActiveTab('create');
                setError('');
              }}
              className={`py-3 text-sm font-bold rounded-xl transition-all duration-200 ${
                activeTab === 'create'
                  ? 'bg-slate-800 text-amber-400 shadow-md'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              新規ルームを作成
            </button>
          </div>

          {error && (
            <div className="mb-6 p-4 bg-red-500/10 border border-red-500/20 rounded-2xl text-xs text-red-400 font-medium">
              ⚠️ {error}
            </div>
          )}

          {activeTab === 'join' ? (
            /* ルーム参加フォーム */
            <form onSubmit={handleJoinRoom} className="space-y-5">
              <div>
                <label htmlFor="join-player-name" className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">
                  お名前（プレイヤー名）
                </label>
                <input
                  id="join-player-name"
                  type="text"
                  placeholder={isMounted ? `例: ${placeholderName}` : "例: 史上最強の漁師"}
                  value={playerName}
                  onChange={(e) => setPlayerName(e.target.value)}
                  disabled={loading}
                  className="w-full bg-slate-950 border border-slate-800 focus:border-amber-500/50 focus:ring-2 focus:ring-amber-500/20 rounded-2xl py-3.5 px-4 text-center text-base font-semibold text-white placeholder:text-slate-700 outline-none transition-all disabled:opacity-50"
                  required
                  maxLength={20}
                  autoComplete="off"
                />
              </div>

              <div>
                <label htmlFor="join-room-id" className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">
                  ルームID
                </label>
                <input
                  id="join-room-id"
                  type="text"
                  placeholder="例: 12345"
                  value={roomId}
                  onChange={(e) => setRoomId(e.target.value)}
                  disabled={loading}
                  className="w-full bg-slate-950 border border-slate-800 focus:border-amber-500/50 focus:ring-2 focus:ring-amber-500/20 rounded-2xl py-4 px-4 text-center text-xl font-bold tracking-widest text-amber-400 placeholder:text-slate-700 outline-none transition-all disabled:opacity-50 text-white"
                  required
                  maxLength={10}
                  autoComplete="off"
                />
              </div>

              

              <button
                type="submit"
                disabled={loading}
                className="w-full py-4 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700 active:scale-[0.98] text-slate-950 font-bold rounded-2xl transition-all duration-200 shadow-lg shadow-amber-500/20 disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {loading ? (
                  <>
                    <div className="h-5 w-5 border-2 border-slate-950 border-t-transparent rounded-full animate-spin" />
                    接続中...
                  </>
                ) : (
                  '観戦・プレイ画面へ進む'
                )}
              </button>
            </form>
          ) : (
            /* 新規ルーム作成フォーム */
            <form onSubmit={handleCreateRoom} className="space-y-5">
              <div>
                <label htmlFor="create-player-name" className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">
                  お名前（プレイヤー名）
                </label>
                <input
                  id="create-player-name"
                  type="text"
                  placeholder={isMounted ? `例: ${placeholderName}` : "例: 史上最強の漁師"}
                  value={playerName}
                  onChange={(e) => setPlayerName(e.target.value)}
                  disabled={loading}
                  className="w-full bg-slate-950 border border-slate-800 focus:border-amber-500/50 focus:ring-2 focus:ring-amber-500/20 rounded-2xl py-4 px-4 text-center text-base font-semibold text-white placeholder:text-slate-700 outline-none transition-all disabled:opacity-50"
                  required
                  maxLength={20}
                  autoComplete="off"
                />
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full py-4 bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 active:scale-[0.98] text-white font-bold rounded-2xl transition-all duration-200 shadow-lg shadow-blue-500/20 disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {loading ? (
                  <>
                    <div className="h-5 w-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    作成中...
                  </>
                ) : (
                  'ルームを作成して入室'
                )}
              </button>
            </form>
          )}
        </div>

        {/* コピーライト/フッター情報 */}
        <div className="text-center mt-8 text-xs text-slate-500">
          AQL 10by10by10mini Rules &copy; {new Date().getFullYear()}
        </div>
      </div>
    </main>
  );
}
