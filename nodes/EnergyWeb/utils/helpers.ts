/*
 * Copyright (c) Velocity BPA, LLC
 * Licensed under the Business Source License 1.1
 * Commercial use requires a separate commercial license.
 * See LICENSE file for details.
 */

import { WEI_UNITS, ERROR_MESSAGES, DID_METHOD, DID_METHOD_VOLTA } from '../constants/constants';
import type { IUnitConversion, IEncodedDID, NetworkType } from './types';

/**
 * Validate Ethereum address format
 */
export function isValidAddress(address: string): boolean {
  return /^0x[a-fA-F0-9]{40}$/.test(address);
}

/**
 * Validate private key format
 */
export function isValidPrivateKey(privateKey: string): boolean {
  const key = privateKey.startsWith('0x') ? privateKey.slice(2) : privateKey;
  return /^[a-fA-F0-9]{64}$/.test(key);
}

/**
 * Validate transaction hash format
 */
export function isValidTxHash(txHash: string): boolean {
  return /^0x[a-fA-F0-9]{64}$/.test(txHash);
}

/**
 * Validate DID format
 */
export function isValidDID(did: string): boolean {
  const didRegex = /^did:ethr:(ewc|volta):0x[a-fA-F0-9]{40}$/;
  return didRegex.test(did);
}

/**
 * Convert Wei to various units
 */
export function weiToUnits(weiValue: string): IUnitConversion {
  const wei = BigInt(weiValue);
  const gweiDivisor = BigInt(WEI_UNITS.gwei);
  const ewtDivisor = BigInt(WEI_UNITS.ewt);

  return {
    wei: wei.toString(),
    gwei: (wei / gweiDivisor).toString(),
    ewt: formatEwt(wei, ewtDivisor),
  };
}

/**
 * Format EWT with decimal precision
 */
function formatEwt(wei: bigint, divisor: bigint): string {
  const whole = wei / divisor;
  const remainder = wei % divisor;
  if (remainder === BigInt(0)) {
    return whole.toString();
  }
  const decimals = remainder.toString().padStart(18, '0').replace(/0+$/, '');
  return `${whole}.${decimals}`;
}

/**
 * Convert EWT to Wei
 */
export function ewtToWei(ewt: string): string {
  const parts = ewt.split('.');
  const whole = parts[0] || '0';
  let decimals = parts[1] || '';

  // Pad or truncate decimals to 18 places
  decimals = decimals.padEnd(18, '0').slice(0, 18);

  const weiValue = BigInt(whole) * BigInt(WEI_UNITS.ewt) + BigInt(decimals);
  return weiValue.toString();
}

/**
 * Convert any unit to Wei
 */
export function unitsToWei(amount: string, unit: 'wei' | 'gwei' | 'ewt'): string {
  switch (unit) {
    case 'wei':
      return amount;
    case 'gwei':
      return gweiToWei(amount);
    case 'ewt':
      return ewtToWei(amount);
    default:
      throw new Error(`Unknown unit: ${unit}`);
  }
}

/**
 * Convert Gwei to Wei
 */
export function gweiToWei(gwei: string): string {
  const parts = gwei.split('.');
  const whole = parts[0] || '0';
  let decimals = parts[1] || '';

  // Pad or truncate decimals to 9 places
  decimals = decimals.padEnd(9, '0').slice(0, 9);

  const weiValue = BigInt(whole) * BigInt(WEI_UNITS.gwei) + BigInt(decimals);
  return weiValue.toString();
}

/**
 * Encode a DID string from an Ethereum address
 */
export function encodeDID(address: string, network: NetworkType = 'mainnet'): IEncodedDID {
  if (!isValidAddress(address)) {
    throw new Error(ERROR_MESSAGES.INVALID_ADDRESS);
  }

  const method = network === 'volta' ? DID_METHOD_VOLTA : DID_METHOD;
  const did = `${method}:${address.toLowerCase()}`;

  return {
    did,
    method: method.split(':').slice(0, 2).join(':'),
    identifier: address.toLowerCase(),
  };
}

/**
 * Decode a DID string to extract the address
 */
export function decodeDID(did: string): { network: string; address: string } {
  if (!isValidDID(did)) {
    throw new Error(ERROR_MESSAGES.INVALID_DID_FORMAT);
  }

  const parts = did.split(':');
  return {
    network: parts[2],
    address: parts[3],
  };
}

/**
 * Format address for display (checksummed)
 */
export function formatAddress(address: string): string {
  if (!isValidAddress(address)) {
    return address;
  }
  // Simple checksum implementation
  return address.toLowerCase();
}

/**
 * Truncate address for display
 */
export function truncateAddress(address: string, startChars = 6, endChars = 4): string {
  if (address.length <= startChars + endChars) {
    return address;
  }
  return `${address.slice(0, startChars)}...${address.slice(-endChars)}`;
}

/**
 * Convert hex string to number
 */
export function hexToNumber(hex: string): number {
  return parseInt(hex, 16);
}

/**
 * Convert number to hex string
 */
export function numberToHex(num: number): string {
  return '0x' + num.toString(16);
}

/**
 * Convert hex string to BigInt
 */
export function hexToBigInt(hex: string): bigint {
  return BigInt(hex);
}

/**
 * Convert BigInt to hex string
 */
export function bigIntToHex(num: bigint): string {
  return '0x' + num.toString(16);
}

/**
 * Pad hex string to specified length
 */
export function padHex(hex: string, length: number): string {
  const cleanHex = hex.startsWith('0x') ? hex.slice(2) : hex;
  return '0x' + cleanHex.padStart(length * 2, '0');
}

/**
 * Encode function signature for contract calls
 */
export function encodeFunctionSignature(functionName: string, paramTypes: string[]): string {
  const signature = `${functionName}(${paramTypes.join(',')})`;
  // Simple keccak256 would be needed here - using placeholder
  // In production, use a proper keccak256 implementation
  return signature;
}

/**
 * Sleep utility for polling
 */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Retry utility for API calls
 */
export async function retry<T>(
  fn: () => Promise<T>,
  maxRetries: number = 3,
  delayMs: number = 1000,
): Promise<T> {
  let lastError: Error | undefined;

  for (let i = 0; i < maxRetries; i++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      if (i < maxRetries - 1) {
        await sleep(delayMs * (i + 1));
      }
    }
  }

  throw lastError;
}

/**
 * Format timestamp to ISO string
 */
export function formatTimestamp(timestamp: number): string {
  return new Date(timestamp * 1000).toISOString();
}

/**
 * Parse ISO string to timestamp
 */
export function parseTimestamp(isoString: string): number {
  return Math.floor(new Date(isoString).getTime() / 1000);
}

/**
 * Validate and sanitize input parameters
 */
export function sanitizeParams(params: Record<string, unknown>): Record<string, unknown> {
  const sanitized: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== '') {
      sanitized[key] = value;
    }
  }

  return sanitized;
}

/**
 * Calculate percentage
 */
export function calculatePercentage(part: bigint, total: bigint): number {
  if (total === BigInt(0)) {
    return 0;
  }
  return Number((part * BigInt(10000)) / total) / 100;
}
