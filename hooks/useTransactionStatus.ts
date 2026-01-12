import { useState, useCallback } from 'react';
import { getLastTransactionHash, waitForTransaction } from '../services/tonService';

export type TxStatus = 'idle' | 'pending_wallet' | 'pending_chain' | 'success' | 'error';

export function useTransactionStatus() {
  const [status, setStatus] = useState<TxStatus>('idle');
  const [txHash, setTxHash] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleTransaction = useCallback(async (
    walletAddress: string,
    actionFn: () => Promise<any>
  ): Promise<string> => {
    setStatus('pending_wallet');
    setErrorMessage(null);
    setTxHash(null);

    try {
      // 1. Snapshot state before action
      const prevHash = await getLastTransactionHash(walletAddress);
      
      // 2. Perform Wallet Action (Sign & Send)
      await actionFn();
      
      // 3. Update state to indicate monitoring
      setStatus('pending_chain');
      
      // 4. Poll for on-chain confirmation
      const newHash = await waitForTransaction(walletAddress, prevHash);
      
      if (newHash) {
        setStatus('success');
        setTxHash(newHash);
        return newHash;
      } else {
        throw new Error("Transaction verification timed out. Please check your wallet.");
      }
    } catch (e: any) {
      console.error("Transaction Error:", e);
      
      const msg = (typeof e === 'string' ? e : e?.message || '').toLowerCase();
      // Handle user cancellation gracefully
      if (msg.includes('user rejected') || msg.includes('cancelled') || msg.includes('operation aborted')) {
        setStatus('idle');
      } else {
        setStatus('error');
        setErrorMessage("Transaction failed or timed out.");
      }
      throw e; // Re-throw so the UI component knows to stop processing
    }
  }, []);

  const resetStatus = () => {
    setStatus('idle');
    setErrorMessage(null);
    setTxHash(null);
  };

  return { status, txHash, handleTransaction, resetStatus, errorMessage };
}