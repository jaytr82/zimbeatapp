
import React, { useState, useEffect, useRef } from 'react';
import ReactPlayer from 'react-player';
import Header from '../components/Header';
import { fetchQuizQuestions, submitQuizResult, startQuizSession, verifyTransaction } from '../services/dataService';
import { QuizQuestion } from '../types';
import { useAppContext } from '../context/AppContext';
import { useTonConnectUI } from '@tonconnect/ui-react';
import { Headphones, Loader2, PlayCircle, Clock, CheckCircle2, XCircle } from 'lucide-react';
import { useTelegram } from '../hooks/useTelegram';
import { useTransactionStatus } from '../hooks/useTransactionStatus';
import { analytics } from '../services/analyticsService';

type QuizState = 'IDLE' | 'STARTING' | 'BUFFERING' | 'PLAYING' | 'QUESTION' | 'RESULT';

const Quiz: React.FC = () => {
  const { walletAddress, refreshBalance } = useAppContext();
  const [tonConnectUI] = useTonConnectUI();
  const { haptic, showAlert } = useTelegram();
  const { status: txStatus, handleTransaction, errorMessage } = useTransactionStatus();
  
  // Data State
  const [questions, setQuestions] = useState<QuizQuestion[]>([]);
  const [currentQIndex, setCurrentQIndex] = useState(0);
  
  // Quiz Integrity State
  const [gameState, setGameState] = useState<QuizState>('IDLE');
  const [sessionId, setSessionId] = useState<string>(''); 
  const [playedSeconds, setPlayedSeconds] = useState(0);
  const [selectedOption, setSelectedOption] = useState<number | null>(null);
  const [revealedAnswer, setRevealedAnswer] = useState<number | null>(null); // From backend
  const [resultMessage, setResultMessage] = useState<string | null>(null);

  // Cast ReactPlayer to any to bypass strict type checks for callbacks
  const Player = ReactPlayer as any;

  // Refs
  // Using 'any' here bypasses strict type checks that conflict between value/type definitions of ReactPlayer
  const playerRef = useRef<any>(null);

  useEffect(() => {
    loadQuestions();
  }, [walletAddress]); 

  const loadQuestions = async () => {
    try {
      const qs = await fetchQuizQuestions();
      setQuestions(qs);
    } catch (e) {
      console.warn("Failed to load questions", e);
      analytics.track('error', { context: 'quiz_load', message: (e as Error).message });
    }
  };

  const currentQ = questions[currentQIndex];
  const timeLeft = currentQ ? Math.max(0, Math.ceil(currentQ.media.duration - playedSeconds)) : 0;

  // --- INTEGRITY LOGIC ---

  const handleStartRound = async () => {
    if (currentQ?.isCompleted) return; 
    
    setGameState('STARTING');
    haptic('medium');
    setPlayedSeconds(0);
    setSelectedOption(null);
    setRevealedAnswer(null);
    setResultMessage(null);

    try {
        const sessId = await startQuizSession(currentQ.id);
        setSessionId(sessId);
        setGameState('BUFFERING');
        analytics.track('quiz_start', { questionId: currentQ.id, sessionId: sessId });
    } catch (e) {
        setGameState('IDLE');
        showAlert("Failed to start quiz session. Please check connection.");
        analytics.track('quiz_error', { context: 'start_session', message: (e as Error).message });
    }
  };

  const handlePlayerProgress = (state: { playedSeconds: number }) => {
    if (gameState === 'PLAYING') {
        setPlayedSeconds(state.playedSeconds);
        if (state.playedSeconds >= currentQ.media.duration) {
            handleTimeUp();
        }
    }
  };

  const handlePlayerStart = () => {
    if (gameState === 'BUFFERING') {
        setGameState('PLAYING');
        analytics.track('quiz_media_play', { questionId: currentQ.id });
    }
  };

  const handleTimeUp = () => {
    if (gameState !== 'QUESTION') {
        haptic('success'); 
        setGameState('QUESTION');
        analytics.track('quiz_media_complete', { questionId: currentQ.id });
    }
  };

  const handleOptionSelect = async (index: number) => {
    if (selectedOption !== null || !sessionId) return;
    
    haptic('selection');
    setSelectedOption(index);
    setGameState('RESULT'); 
    setResultMessage("Verifying answer...");
    
    analytics.track('quiz_answer_submit', { questionId: currentQ.id, answerIndex: index });

    try {
        const result = await submitQuizResult(
            currentQ.id,
            index,
            sessionId,
            playedSeconds
        );

        if (typeof result.correctAnswerIndex === 'number') {
            setRevealedAnswer(result.correctAnswerIndex);
        } else {
            setRevealedAnswer(currentQ.correctAnswer);
        }

        if (!result.success) {
            haptic('error');
            setResultMessage(`Error: ${result.message}`);
            analytics.track('quiz_result', { success: false, error: result.message });
            return;
        }

        if (result.correct) {
            haptic('success');
            analytics.track('quiz_result', { success: true, correct: true, questionId: currentQ.id });
            
            if (result.rewardPayload) {
                if (!walletAddress) {
                    setResultMessage("Correct! Connect wallet to claim.");
                } else {
                    setResultMessage("Initiating claim...");
                    
                    try {
                        // Step 8: Transaction with backend verification
                        const txHash = await handleTransaction(walletAddress, async () => {
                            await tonConnectUI.sendTransaction(result.rewardPayload!);
                        });
                        
                        setResultMessage("Verifying Transaction...");
                        await verifyTransaction(txHash, 'quiz_reward', { 
                            questionId: currentQ.id,
                            rewardAmount: currentQ.rewardAmount 
                        });
                        
                        setResultMessage("Reward Confirmed!");
                        haptic('success');
                        refreshBalance();
                        analytics.track('reward_claimed', { questionId: currentQ.id, amount: currentQ.rewardAmount, txHash });
                        
                        setQuestions(prev => {
                            const newQs = [...prev];
                            newQs[currentQIndex].isCompleted = true;
                            return newQs;
                        });
                    } catch (e) {
                         setResultMessage("Claim failed.");
                         analytics.track('reward_claim_failed', { questionId: currentQ.id });
                    }
                }
            } else {
                setResultMessage("Correct!");
            }
        } else {
            haptic('error');
            setResultMessage(result.message || "Incorrect.");
            analytics.track('quiz_result', { success: true, correct: false, questionId: currentQ.id });
        }

    } catch (e: any) {
        console.error("Submission Error", e);
        setResultMessage(e.message || "Network error. Please try again.");
    }
  };

  const handleNextQuestion = () => {
    haptic('light');
    if (currentQIndex < questions.length - 1) {
      setCurrentQIndex(prev => prev + 1);
      setGameState('IDLE');
      setPlayedSeconds(0);
      setSessionId('');
      setRevealedAnswer(null);
    } else {
       setResultMessage("All questions completed for today!");
       analytics.track('quiz_all_completed', { total: questions.length });
    }
  };

  if (!currentQ) return <div className="pt-20 text-center"><Loader2 className="animate-spin mx-auto text-primary"/></div>;

  return (
    <div className="pt-20 pb-32 min-h-screen flex flex-col items-center">
      <Header title="Sound Quiz" />

      {/* Hidden Player */}
      <div className="hidden">
        <Player
          ref={playerRef}
          url={`https://www.youtube.com/watch?v=${currentQ.media.youtubeId}`}
          playing={gameState === 'BUFFERING' || gameState === 'PLAYING'}
          controls={false}
          width="0"
          height="0"
          onStart={handlePlayerStart}
          onProgress={handlePlayerProgress}
          progressInterval={500}
          config={{
            youtube: {
              playerVars: {
                start: currentQ.media.startSeconds,
                end: currentQ.media.startSeconds + currentQ.media.duration + 5,
                playsinline: 1
              }
            } as any
          }}
        />
      </div>

      <div className="w-full max-w-sm px-6 mt-2 flex-1 flex flex-col">
        {gameState === 'IDLE' || gameState === 'STARTING' ? (
          <div className="flex-1 flex flex-col items-center justify-center bg-white rounded-3xl shadow-lg p-8 text-center space-y-6">
            <div className={`w-24 h-24 rounded-full flex items-center justify-center animate-pulse ${currentQ.isCompleted ? 'bg-green-100 text-green-600' : 'bg-blue-100 text-primary'}`}>
              {currentQ.isCompleted ? <CheckCircle2 size={48} /> : <Headphones size={48} />}
            </div>
            <div>
              <h2 className="text-xl font-bold text-gray-800">Round {currentQIndex + 1}</h2>
              {currentQ.isCompleted ? (
                 <p className="text-green-600 font-bold mt-2">Completed</p>
              ) : (
                <p className="text-gray-500 mt-2">
                    Listen to the 15-second clip.<br/>Answer to earn <span className="font-bold text-primary">{currentQ.rewardAmount} ZBT</span>.
                </p>
              )}
            </div>
            
            {!currentQ.isCompleted ? (
                <button 
                onClick={handleStartRound}
                disabled={gameState === 'STARTING'}
                className="w-full py-4 bg-primary text-white rounded-xl font-bold text-lg shadow-blue-500/30 shadow-lg flex items-center justify-center gap-2 hover:scale-105 transition-transform disabled:opacity-50"
                >
                {gameState === 'STARTING' ? <Loader2 className="animate-spin" size={24} /> : <PlayCircle size={24} />}
                {gameState === 'STARTING' ? "Starting..." : "Start Listening"}
                </button>
            ) : (
                <button 
                    onClick={handleNextQuestion}
                    className="w-full py-3 bg-gray-100 text-gray-600 rounded-xl font-bold"
                >
                    Next Challenge
                </button>
            )}
          </div>
        ) : (gameState === 'BUFFERING' || gameState === 'PLAYING') ? (
           <div className="flex-1 flex flex-col items-center justify-center bg-gray-900 rounded-3xl shadow-xl p-8 text-center relative overflow-hidden">
             <div className="absolute inset-0 opacity-20 bg-[url('https://media.giphy.com/media/v1.Y2lkPTc5MGI3NjExcDdtN3J5bnJ5bnJ5bnJ5bnJ5bnJ5bnJ5bnJ5bnJ5bSZlcD12MV9pbnRlcm5hbF9naWZfYnlfaWQmY3Q9cw/l41lI4bYmcsPJX9Ck/giphy.gif')] bg-cover bg-center" />
             {gameState === 'BUFFERING' ? (
                <div className="text-white flex flex-col items-center">
                  <Loader2 className="animate-spin mb-4" size={48} />
                  <p className="font-medium tracking-widest uppercase">Loading Stream...</p>
                </div>
             ) : (
               <>
                 <div className="z-10 text-white mb-8">
                   <h3 className="text-3xl font-black mb-2">{timeLeft}s</h3>
                   <p className="text-blue-300 uppercase text-xs tracking-[0.2em]">Listening Phase</p>
                 </div>
                 <div className="flex items-end justify-center space-x-2 h-24 z-10">
                   <div className="w-4 bg-primary animate-[bounce_1.2s_infinite] h-12 rounded-t-md"></div>
                   <div className="w-4 bg-purple-500 animate-[bounce_1.5s_infinite] h-20 rounded-t-md"></div>
                   <div className="w-4 bg-blue-400 animate-[bounce_1.1s_infinite] h-16 rounded-t-md"></div>
                 </div>
               </>
             )}
           </div>
        ) : (
          <div className="bg-white rounded-2xl shadow-lg p-6 flex-1 flex flex-col">
            <div className="mb-6 flex justify-between items-start">
              <span className="bg-blue-100 text-blue-700 text-xs font-bold px-2 py-1 rounded uppercase">
                Reward: {currentQ.rewardAmount} ZBT
              </span>
              <Clock size={20} className="text-gray-300" />
            </div>

            <h3 className="text-xl font-bold text-gray-800 mb-6 leading-tight">
              {currentQ.question}
            </h3>

            <div className="space-y-3 flex-1">
              {currentQ.options.map((option, idx) => {
                let statusClass = "bg-gray-50 border-gray-200 text-gray-700 hover:bg-gray-100";
                
                if (gameState === 'RESULT') {
                  const isCorrect = idx === revealedAnswer;
                  const isSelected = idx === selectedOption;
                  
                  if (isCorrect) {
                     statusClass = "bg-green-100 border-green-500 text-green-800 font-bold";
                  } else if (isSelected) {
                     statusClass = "bg-red-100 border-red-500 text-red-800";
                  } else {
                     statusClass = "opacity-50";
                  }
                }
                
                return (
                  <button
                    key={idx}
                    onClick={() => handleOptionSelect(idx)}
                    disabled={gameState === 'RESULT'}
                    className={`w-full text-left p-4 rounded-xl border-2 transition-all duration-200 flex items-center justify-between ${statusClass}`}
                  >
                    <span>{option}</span>
                    {gameState === 'RESULT' && idx === revealedAnswer && <CheckCircle2 size={20} />}
                    {gameState === 'RESULT' && idx === selectedOption && idx !== revealedAnswer && <XCircle size={20} />}
                  </button>
                );
              })}
            </div>

            {gameState === 'RESULT' && (
              <div className="mt-6 pt-6 border-t border-gray-100 text-center">
                {txStatus !== 'idle' && txStatus !== 'success' ? (
                  <div className="flex flex-col items-center justify-center gap-2 text-primary font-bold">
                    <Loader2 className="animate-spin" size={24} />
                    <p>
                        {txStatus === 'pending_wallet' ? 'Sign in Wallet...' : 'Confirming on Blockchain...'}
                    </p>
                    {txStatus === 'pending_chain' && <span className="text-xs font-normal text-gray-500">This takes ~15 seconds</span>}
                  </div>
                ) : (
                  <>
                    <p className={`font-bold mb-4 ${errorMessage || resultMessage?.includes("Error") || !resultMessage?.includes("Confirmed") && !resultMessage?.includes("Claimed") && !resultMessage?.includes("Correct") ? 'text-red-500' : 'text-green-600'}`}>
                      {errorMessage || resultMessage}
                    </p>
                    
                    {errorMessage && (
                        <button 
                            onClick={() => handleOptionSelect(selectedOption!)}
                            className="w-full mb-3 py-3 border border-red-300 text-red-600 rounded-xl font-bold hover:bg-red-50"
                        >
                            Retry Claim
                        </button>
                    )}

                    <button 
                      onClick={handleNextQuestion}
                      className="w-full py-3 bg-gray-900 text-white rounded-xl font-bold hover:bg-black transition-colors"
                    >
                      {currentQIndex < questions.length - 1 ? "Next Challenge" : "Finish Quiz"}
                    </button>
                  </>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default Quiz;
