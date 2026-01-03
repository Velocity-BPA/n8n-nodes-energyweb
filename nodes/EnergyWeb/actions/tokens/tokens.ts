/*
 * Copyright (c) Velocity BPA, LLC
 * Licensed under the Business Source License 1.1
 * Commercial use requires a separate commercial license.
 * See LICENSE file for details.
 */

import type { IExecuteFunctions, INodeExecutionData, IDataObject } from 'n8n-workflow';
import { NodeOperationError } from 'n8n-workflow';
import { executeRpcRequest, executeEwScanRequest } from '../../transport/rpcClient';
import { isValidAddress, hexToNumber, numberToHex, calculatePercentage } from '../../utils/helpers';
import { ERROR_MESSAGES, GAS_LIMITS } from '../../constants/constants';
import type { IEnergyWebCredentials, ITokenInfo, ITokenHolder } from '../../utils/types';

// ERC20 function selectors
const ERC20_SELECTORS = {
  name: '0x06fdde03',
  symbol: '0x95d89b41',
  decimals: '0x313ce567',
  totalSupply: '0x18160ddd',
  balanceOf: '0x70a08231',
  transfer: '0xa9059cbb',
  allowance: '0xdd62ed3e',
  approve: '0x095ea7b3',
  transferFrom: '0x23b872dd',
  owner: '0x8da5cb5b',
};

/**
 * Helper to decode string from contract response
 */
function decodeString(hex: string): string {
  if (!hex || hex === '0x' || hex.length < 130) {
    return '';
  }
  // Standard ABI encoding: offset (32 bytes) + length (32 bytes) + data
  const data = hex.slice(2);
  const lengthHex = data.slice(64, 128);
  const length = parseInt(lengthHex, 16) * 2;
  const stringHex = data.slice(128, 128 + length);
  return Buffer.from(stringHex, 'hex').toString('utf8');
}

/**
 * Get token information
 */
export async function getTokenInfo(
  this: IExecuteFunctions,
  credentials: IEnergyWebCredentials,
  index: number,
): Promise<INodeExecutionData[]> {
  const tokenAddress = this.getNodeParameter('tokenAddress', index) as string;

  if (!isValidAddress(tokenAddress)) {
    throw new NodeOperationError(this.getNode(), ERROR_MESSAGES.INVALID_ADDRESS, {
      itemIndex: index,
    });
  }

  // Batch call for token info
  const nameResult = (await executeRpcRequest.call(this, credentials, 'eth_call', [
    { to: tokenAddress, data: ERC20_SELECTORS.name },
    'latest',
  ])) as string;

  const symbolResult = (await executeRpcRequest.call(this, credentials, 'eth_call', [
    { to: tokenAddress, data: ERC20_SELECTORS.symbol },
    'latest',
  ])) as string;

  const decimalsResult = (await executeRpcRequest.call(this, credentials, 'eth_call', [
    { to: tokenAddress, data: ERC20_SELECTORS.decimals },
    'latest',
  ])) as string;

  const totalSupplyResult = (await executeRpcRequest.call(this, credentials, 'eth_call', [
    { to: tokenAddress, data: ERC20_SELECTORS.totalSupply },
    'latest',
  ])) as string;

  // Try to get owner (may not exist on all tokens)
  let owner: string | undefined;
  try {
    const ownerResult = (await executeRpcRequest.call(this, credentials, 'eth_call', [
      { to: tokenAddress, data: ERC20_SELECTORS.owner },
      'latest',
    ])) as string;
    if (ownerResult && ownerResult !== '0x' && ownerResult.length >= 66) {
      owner = '0x' + ownerResult.slice(-40);
    }
  } catch {
    // Owner function not available
  }

  const name = decodeString(nameResult);
  const symbol = decodeString(symbolResult);
  const decimals = decimalsResult && decimalsResult !== '0x' ? hexToNumber(decimalsResult) : 18;
  const totalSupply = totalSupplyResult && totalSupplyResult !== '0x'
    ? BigInt(totalSupplyResult).toString()
    : '0';

  // Format total supply with decimals
  const totalSupplyFormatted = formatTokenAmount(totalSupply, decimals);

  const tokenInfo: ITokenInfo = {
    address: tokenAddress,
    name,
    symbol,
    decimals,
    totalSupply,
    owner,
  };

  return [
    {
      json: {
        ...tokenInfo,
        totalSupplyFormatted,
      } as unknown as IDataObject,
    },
  ];
}

/**
 * Format token amount with decimals
 */
function formatTokenAmount(amount: string, decimals: number): string {
  const amountBigInt = BigInt(amount);
  const divisor = BigInt(10 ** decimals);
  const whole = amountBigInt / divisor;
  const remainder = amountBigInt % divisor;

  if (remainder === BigInt(0)) {
    return whole.toString();
  }

  const decimalStr = remainder.toString().padStart(decimals, '0').replace(/0+$/, '');
  return `${whole}.${decimalStr}`;
}

/**
 * Get token holders
 */
export async function getTokenHolders(
  this: IExecuteFunctions,
  credentials: IEnergyWebCredentials,
  index: number,
): Promise<INodeExecutionData[]> {
  const tokenAddress = this.getNodeParameter('tokenAddress', index) as string;
  const limit = this.getNodeParameter('limit', index, 10) as number;

  if (!isValidAddress(tokenAddress)) {
    throw new NodeOperationError(this.getNode(), ERROR_MESSAGES.INVALID_ADDRESS, {
      itemIndex: index,
    });
  }

  try {
    // Try EW Scan API for holders
    const response = await executeEwScanRequest.call(
      this,
      credentials,
      `/v1/tokens/${tokenAddress}/holders`,
      { limit },
    ) as {
      items: Array<{
        address: { hash: string };
        value: string;
      }>;
      token: {
        total_supply: string;
        decimals: string;
      };
    };

    const totalSupply = BigInt(response.token.total_supply || '0');
    const decimals = parseInt(response.token.decimals || '18');

    const holders: ITokenHolder[] = (response.items || []).map((item) => {
      const balance = BigInt(item.value);
      return {
        address: item.address.hash,
        balance: balance.toString(),
        balanceFormatted: formatTokenAmount(balance.toString(), decimals),
        percentage: calculatePercentage(balance, totalSupply),
      };
    });

    return [
      {
        json: {
          tokenAddress,
          holders,
          totalHolders: holders.length,
          totalSupply: totalSupply.toString(),
        } as unknown as IDataObject,
      },
    ];
  } catch {
    // Fallback - cannot get holders without indexer
    return [
      {
        json: {
          tokenAddress,
          holders: [],
          message: 'Token holder list requires EW Scan API access',
          note: 'Use Transfer events to track holders manually',
        } as IDataObject,
      },
    ];
  }
}

/**
 * Transfer tokens
 */
export async function transferToken(
  this: IExecuteFunctions,
  credentials: IEnergyWebCredentials,
  index: number,
): Promise<INodeExecutionData[]> {
  const tokenAddress = this.getNodeParameter('tokenAddress', index) as string;
  const toAddress = this.getNodeParameter('toAddress', index) as string;
  const amount = this.getNodeParameter('amount', index) as string;
  const fromAddress = this.getNodeParameter('fromAddress', index) as string;

  if (!isValidAddress(tokenAddress)) {
    throw new NodeOperationError(this.getNode(), 'Invalid token address', { itemIndex: index });
  }

  if (!isValidAddress(toAddress)) {
    throw new NodeOperationError(this.getNode(), 'Invalid recipient address', { itemIndex: index });
  }

  if (!isValidAddress(fromAddress)) {
    throw new NodeOperationError(this.getNode(), 'Invalid from address', { itemIndex: index });
  }

  if (!credentials.privateKey) {
    throw new NodeOperationError(
      this.getNode(),
      'Private key is required for token transfers',
      { itemIndex: index },
    );
  }

  // Get token decimals
  const decimalsResult = (await executeRpcRequest.call(this, credentials, 'eth_call', [
    { to: tokenAddress, data: ERC20_SELECTORS.decimals },
    'latest',
  ])) as string;

  const decimals = decimalsResult && decimalsResult !== '0x' ? hexToNumber(decimalsResult) : 18;

  // Convert amount to token units
  const [whole, decimal = ''] = amount.split('.');
  const paddedDecimal = decimal.padEnd(decimals, '0').slice(0, decimals);
  const amountInUnits = BigInt(whole + paddedDecimal);

  // Check balance
  const balanceData = ERC20_SELECTORS.balanceOf + fromAddress.slice(2).padStart(64, '0');
  const balanceResult = (await executeRpcRequest.call(this, credentials, 'eth_call', [
    { to: tokenAddress, data: balanceData },
    'latest',
  ])) as string;

  const balance = balanceResult && balanceResult !== '0x' ? BigInt(balanceResult) : BigInt(0);

  if (balance < amountInUnits) {
    throw new NodeOperationError(this.getNode(), ERROR_MESSAGES.INSUFFICIENT_BALANCE, {
      itemIndex: index,
    });
  }

  // Encode transfer call
  const transferData =
    ERC20_SELECTORS.transfer +
    toAddress.slice(2).padStart(64, '0') +
    amountInUnits.toString(16).padStart(64, '0');

  // Get nonce and gas price
  const nonce = (await executeRpcRequest.call(this, credentials, 'eth_getTransactionCount', [
    fromAddress,
    'pending',
  ])) as string;

  const gasPrice = (await executeRpcRequest.call(
    this,
    credentials,
    'eth_gasPrice',
    [],
  )) as string;

  // Prepare transaction
  const tx = {
    from: fromAddress,
    to: tokenAddress,
    data: transferData,
    gas: numberToHex(GAS_LIMITS.erc20Transfer),
    gasPrice,
    nonce,
  };

  // Estimate gas
  try {
    const estimatedGas = (await executeRpcRequest.call(this, credentials, 'eth_estimateGas', [
      tx,
    ])) as string;

    return [
      {
        json: {
          message: 'Token transfer prepared',
          token: tokenAddress,
          from: fromAddress,
          to: toAddress,
          amount,
          amountInUnits: amountInUnits.toString(),
          transaction: tx,
          estimatedGas: hexToNumber(estimatedGas),
          note: 'Sign with private key and send via eth_sendRawTransaction',
        } as IDataObject,
      },
    ];
  } catch (error) {
    return [
      {
        json: {
          message: 'Transfer preparation failed',
          error: error instanceof Error ? error.message : 'Unknown error',
          token: tokenAddress,
          from: fromAddress,
          to: toAddress,
          amount,
          balance: formatTokenAmount(balance.toString(), decimals),
        } as IDataObject,
      },
    ];
  }
}
