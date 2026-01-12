import { RewardTransaction } from '../types';
import { CONFIG } from './config';

/**
 * Constructs a transaction for the user to "Claim" their reward on-chain.
 * 
 * @param amount Amount to claim
 * @param signature Optional backend signature to prove eligibility (if backend is relayer)
 */
export const claimQuizReward = async (
  amount: number,
  signature?: string
): Promise<RewardTransaction> => {
  
  // Note: amount is used here to display to user, but actual logic depends on Treasury smart contract
  // For this implementation, we send a comment to the Treasury.
  // The Treasury indexer validates the sender and the backend record before minting/releasing funds.
  
  const payloadMessage = signature ? `claim:${signature}` : `claim:quiz_reward`;

  return {
    validUntil: Math.floor(Date.now() / 1000) + 600, // 10 minutes
    messages: [
      {
        address: CONFIG.TREASURY_WALLET,
        // We ask user to pay gas fees (approx 0.05 TON) to trigger the claim
        amount: "50000000", 
        payload: payloadMessage 
      }
    ]
  };
};