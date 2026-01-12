
import { AssetBalance } from '../types';
import { CONFIG } from './config';

/**
 * Fetches the user's balance for the specific App Jetton.
 */
export const fetchJettonBalance = async (walletAddress: string): Promise<AssetBalance> => {
  try {
    const url = `${CONFIG.TON_API_ENDPOINT}/accounts/${walletAddress}/jettons`;
    const response = await fetch(url);
    
    if (!response.ok) {
        throw new Error(`TONAPI Error: ${response.statusText}`);
    }

    const data = await response.json();
    
    // Find our specific token using Config
    const appToken = data.balances.find((b: any) => 
        b.jetton.address === CONFIG.JETTON_MASTER_ADDRESS || b.jetton.symbol === 'ZBT' 
    );

    if (appToken) {
        const decimals = appToken.jetton.decimals;
        const raw = appToken.balance;
        const formatted = (Number(raw) / Math.pow(10, decimals)).toLocaleString('en-US', {
            maximumFractionDigits: 2
        });

        return {
            symbol: appToken.jetton.symbol,
            balance: formatted,
            decimals: decimals,
            rawBalance: raw
        };
    }

    return {
        symbol: 'ZBT',
        balance: '0.00',
        decimals: 9,
        rawBalance: '0'
    };

  } catch (error) {
    console.warn("Failed to fetch balance:", error);
    return {
        symbol: 'ZBT',
        balance: '---',
        decimals: 9,
        rawBalance: '0'
    };
  }
};

/**
 * Fetches the native TON coin balance.
 */
export const fetchTonBalance = async (walletAddress: string): Promise<string> => {
    try {
        const url = `${CONFIG.TON_API_ENDPOINT}/accounts/${walletAddress}`;
        const response = await fetch(url);
        const data = await response.json();
        return (data.balance / 1e9).toFixed(2);
    } catch (e) {
        return '0.00';
    }
};

/**
 * Gets the hash of the most recent transaction for an account.
 */
export const getLastTransactionHash = async (walletAddress: string): Promise<string | null> => {
    try {
        const url = `${CONFIG.TON_API_ENDPOINT}/accounts/${walletAddress}/transactions?limit=1`;
        const response = await fetch(url);
        const data = await response.json();
        return data.transactions?.[0]?.hash || null;
    } catch (e) {
        console.warn("Failed to fetch last tx hash", e);
        return null;
    }
};

/**
 * Polls the blockchain until a new transaction appears.
 * Returns the NEW Transaction Hash if found, or null if timed out.
 */
export const waitForTransaction = async (walletAddress: string, previousHash: string | null): Promise<string | null> => {
    const startTime = Date.now();
    const TIMEOUT = 45000; 
    const INTERVAL = 3000;

    await new Promise(r => setTimeout(r, 2000));

    while (Date.now() - startTime < TIMEOUT) {
        const currentHash = await getLastTransactionHash(walletAddress);
        // Check if hash changed AND it's not null
        if (currentHash && currentHash !== previousHash) {
            return currentHash;
        }
        await new Promise(r => setTimeout(r, INTERVAL));
    }
    return null;
};
