/*
 * Copyright (c) Velocity BPA, LLC
 * Licensed under the Business Source License 1.1
 * Commercial use requires a separate commercial license.
 * See LICENSE file for details.
 */

import type { IExecuteFunctions, INodeExecutionData, IDataObject } from 'n8n-workflow';
import { NodeOperationError } from 'n8n-workflow';
import { executeRpcRequest, executeEwScanRequest } from '../../transport/rpcClient';
import { hexToNumber, weiToUnits, formatTimestamp } from '../../utils/helpers';
import { NETWORKS } from '../../constants/constants';
import type {
  IEnergyWebCredentials,
  INetworkStatus,
  IBlock,
  IValidator,
  NetworkType,
} from '../../utils/types';

/**
 * Get network status
 */
export async function getNetworkStatus(
  this: IExecuteFunctions,
  credentials: IEnergyWebCredentials,
  index: number,
): Promise<INodeExecutionData[]> {
  // Get chain ID
  const chainIdHex = (await executeRpcRequest.call(
    this,
    credentials,
    'eth_chainId',
    [],
  )) as string;
  const chainId = hexToNumber(chainIdHex);

  // Get latest block number
  const blockNumberHex = (await executeRpcRequest.call(
    this,
    credentials,
    'eth_blockNumber',
    [],
  )) as string;
  const latestBlock = hexToNumber(blockNumberHex);

  // Get gas price
  const gasPriceHex = (await executeRpcRequest.call(
    this,
    credentials,
    'eth_gasPrice',
    [],
  )) as string;
  const gasPrice = BigInt(gasPriceHex);

  // Get peer count
  let peerCount = 0;
  try {
    const peerCountHex = (await executeRpcRequest.call(
      this,
      credentials,
      'net_peerCount',
      [],
    )) as string;
    peerCount = hexToNumber(peerCountHex);
  } catch {
    // net_peerCount may not be available
  }

  // Determine network name
  let networkName = 'Unknown';
  if (chainId === NETWORKS.mainnet.chainId) {
    networkName = NETWORKS.mainnet.name;
  } else if (chainId === NETWORKS.volta.chainId) {
    networkName = NETWORKS.volta.name;
  }

  const status: INetworkStatus = {
    chainId,
    networkName,
    latestBlock,
    gasPrice: gasPrice.toString(),
    gasPriceGwei: (gasPrice / BigInt(1e9)).toString(),
    isConnected: true,
    peerCount,
  };

  return [
    {
      json: {
        ...status,
        symbol: chainId === NETWORKS.volta.chainId ? 'VT' : 'EWT',
        explorerUrl:
          chainId === NETWORKS.volta.chainId
            ? NETWORKS.volta.explorerUrl
            : NETWORKS.mainnet.explorerUrl,
      } as unknown as IDataObject,
    },
  ];
}

/**
 * Get current gas price
 */
export async function getGasPrice(
  this: IExecuteFunctions,
  credentials: IEnergyWebCredentials,
  index: number,
): Promise<INodeExecutionData[]> {
  const gasPriceHex = (await executeRpcRequest.call(
    this,
    credentials,
    'eth_gasPrice',
    [],
  )) as string;

  const gasPrice = BigInt(gasPriceHex);
  const gasPriceGwei = gasPrice / BigInt(1e9);

  // Get latest block for additional gas info
  const blockHex = (await executeRpcRequest.call(
    this,
    credentials,
    'eth_getBlockByNumber',
    ['latest', false],
  )) as {
    baseFeePerGas?: string;
    gasUsed: string;
    gasLimit: string;
  };

  const gasUsed = hexToNumber(blockHex.gasUsed);
  const gasLimit = hexToNumber(blockHex.gasLimit);
  const utilizationPercent = ((gasUsed / gasLimit) * 100).toFixed(2);

  // Calculate suggested gas prices
  const slow = (gasPriceGwei * BigInt(80)) / BigInt(100);
  const standard = gasPriceGwei;
  const fast = (gasPriceGwei * BigInt(120)) / BigInt(100);

  return [
    {
      json: {
        gasPrice: gasPrice.toString(),
        gasPriceGwei: gasPriceGwei.toString(),
        suggestions: {
          slow: slow.toString(),
          standard: standard.toString(),
          fast: fast.toString(),
        },
        blockGasInfo: {
          gasUsed,
          gasLimit,
          utilizationPercent: parseFloat(utilizationPercent),
        },
        baseFeePerGas: blockHex.baseFeePerGas
          ? BigInt(blockHex.baseFeePerGas).toString()
          : undefined,
      } as IDataObject,
    },
  ];
}

/**
 * Get active validators
 */
export async function getValidators(
  this: IExecuteFunctions,
  credentials: IEnergyWebCredentials,
  index: number,
): Promise<INodeExecutionData[]> {
  try {
    // Try EW Scan API for validators
    const response = await executeEwScanRequest.call(
      this,
      credentials,
      '/v1/validators',
    ) as {
      items: Array<{
        address: { hash: string };
        is_active: boolean;
        blocks_validated_count: number;
      }>;
    };

    const validators: IValidator[] = (response.items || []).map((item) => ({
      address: item.address.hash,
      isActive: item.is_active,
      blocksMined: item.blocks_validated_count,
    }));

    const activeCount = validators.filter((v) => v.isActive).length;

    return [
      {
        json: {
          validators,
          totalValidators: validators.length,
          activeValidators: activeCount,
          inactiveValidators: validators.length - activeCount,
        } as unknown as IDataObject,
      },
    ];
  } catch {
    // Fallback - get recent block miners
    const latestBlockHex = (await executeRpcRequest.call(
      this,
      credentials,
      'eth_blockNumber',
      [],
    )) as string;
    const latestBlock = hexToNumber(latestBlockHex);

    // Get last 10 blocks to find validators
    const validatorSet = new Set<string>();
    const blockPromises: Promise<{ miner: string }>[] = [];

    for (let i = 0; i < 10 && latestBlock - i > 0; i++) {
      blockPromises.push(
        executeRpcRequest.call(this, credentials, 'eth_getBlockByNumber', [
          '0x' + (latestBlock - i).toString(16),
          false,
        ]) as Promise<{ miner: string }>,
      );
    }

    const blocks = await Promise.all(blockPromises);
    blocks.forEach((block) => {
      if (block?.miner) {
        validatorSet.add(block.miner.toLowerCase());
      }
    });

    const validators: IValidator[] = Array.from(validatorSet).map((addr) => ({
      address: addr,
      isActive: true,
    }));

    return [
      {
        json: {
          validators,
          totalValidators: validators.length,
          message: 'Validator list from recent blocks. Full list requires EW Scan API.',
          blocksScanned: Math.min(10, latestBlock),
        } as unknown as IDataObject,
      },
    ];
  }
}

/**
 * Get block details
 */
export async function getBlock(
  this: IExecuteFunctions,
  credentials: IEnergyWebCredentials,
  index: number,
): Promise<INodeExecutionData[]> {
  const blockIdentifier = this.getNodeParameter('blockIdentifier', index) as string;
  const includeTransactions = this.getNodeParameter('includeTransactions', index, false) as boolean;

  let blockParam: string;

  if (blockIdentifier === 'latest' || blockIdentifier === 'pending' || blockIdentifier === 'earliest') {
    blockParam = blockIdentifier;
  } else if (blockIdentifier.startsWith('0x')) {
    // Block hash or hex number
    if (blockIdentifier.length === 66) {
      // Block hash
      const block = (await executeRpcRequest.call(this, credentials, 'eth_getBlockByHash', [
        blockIdentifier,
        includeTransactions,
      ])) as IBlock | null;

      if (!block) {
        throw new NodeOperationError(this.getNode(), 'Block not found', { itemIndex: index });
      }

      return formatBlockResponse(block);
    }
    blockParam = blockIdentifier;
  } else {
    // Assume decimal block number
    blockParam = '0x' + parseInt(blockIdentifier).toString(16);
  }

  const block = (await executeRpcRequest.call(this, credentials, 'eth_getBlockByNumber', [
    blockParam,
    includeTransactions,
  ])) as IBlock | null;

  if (!block) {
    throw new NodeOperationError(this.getNode(), 'Block not found', { itemIndex: index });
  }

  return formatBlockResponse(block);
}

/**
 * Format block response
 */
function formatBlockResponse(block: IBlock): INodeExecutionData[] {
  const blockNumber = typeof block.number === 'string' ? hexToNumber(block.number as unknown as string) : block.number;
  const timestamp = typeof block.timestamp === 'string' ? hexToNumber(block.timestamp as unknown as string) : block.timestamp;
  const gasUsed = typeof block.gasUsed === 'string' ? hexToNumber(block.gasUsed as unknown as string) : block.gasUsed;
  const gasLimit = typeof block.gasLimit === 'string' ? hexToNumber(block.gasLimit as unknown as string) : block.gasLimit;
  const size = typeof block.size === 'string' ? hexToNumber(block.size as unknown as string) : block.size;

  return [
    {
      json: {
        number: blockNumber,
        hash: block.hash,
        parentHash: block.parentHash,
        timestamp,
        timestampFormatted: formatTimestamp(timestamp),
        miner: block.miner,
        gasUsed,
        gasLimit,
        gasUtilization: ((gasUsed / gasLimit) * 100).toFixed(2) + '%',
        size,
        transactionCount: Array.isArray(block.transactions) ? block.transactions.length : 0,
        transactions: block.transactions,
        difficulty: block.difficulty,
        totalDifficulty: block.totalDifficulty,
        extraData: block.extraData,
        nonce: block.nonce,
        uncles: block.uncles,
      } as unknown as IDataObject,
    },
  ];
}
