/*
 * Copyright (c) Velocity BPA, LLC
 * Licensed under the Business Source License 1.1
 * Commercial use requires a separate commercial license.
 * See LICENSE file for details.
 */

import type { IExecuteFunctions, INodeExecutionData, IDataObject } from 'n8n-workflow';
import { NodeOperationError } from 'n8n-workflow';
import { executeRpcRequest } from '../../transport/rpcClient';
import { isValidAddress, hexToNumber, numberToHex } from '../../utils/helpers';
import { ERROR_MESSAGES } from '../../constants/constants';
import type { IEnergyWebCredentials, IEventLog, IDecodedEventLog } from '../../utils/types';

/**
 * Get event logs with filters
 */
export async function getLogs(
  this: IExecuteFunctions,
  credentials: IEnergyWebCredentials,
  index: number,
): Promise<INodeExecutionData[]> {
  const contractAddress = this.getNodeParameter('contractAddress', index, '') as string;
  const fromBlock = this.getNodeParameter('fromBlock', index, 'latest') as string | number;
  const toBlock = this.getNodeParameter('toBlock', index, 'latest') as string | number;
  const topics = this.getNodeParameter('topics', index, []) as string[];

  if (contractAddress && !isValidAddress(contractAddress)) {
    throw new NodeOperationError(this.getNode(), ERROR_MESSAGES.INVALID_ADDRESS, { itemIndex: index });
  }

  // Build filter object
  const filter: IDataObject = {
    fromBlock: typeof fromBlock === 'number' ? numberToHex(fromBlock) : fromBlock,
    toBlock: typeof toBlock === 'number' ? numberToHex(toBlock) : toBlock,
  };

  if (contractAddress) {
    filter.address = contractAddress;
  }

  if (topics.length > 0) {
    filter.topics = topics.map((t) => (t === '' || t === 'null' ? null : t));
  }

  const logs = (await executeRpcRequest.call(this, credentials, 'eth_getLogs', [filter])) as Array<{
    address: string;
    topics: string[];
    data: string;
    blockNumber: string;
    transactionHash: string;
    transactionIndex: string;
    blockHash: string;
    logIndex: string;
    removed: boolean;
  }>;

  const formattedLogs: IEventLog[] = logs.map((log) => ({
    address: log.address,
    topics: log.topics,
    data: log.data,
    blockNumber: hexToNumber(log.blockNumber),
    transactionHash: log.transactionHash,
    transactionIndex: hexToNumber(log.transactionIndex),
    blockHash: log.blockHash,
    logIndex: hexToNumber(log.logIndex),
    removed: log.removed,
  }));

  return [
    {
      json: {
        logs: formattedLogs,
        count: formattedLogs.length,
        filter: {
          address: contractAddress || 'all',
          fromBlock,
          toBlock,
          topics: topics.length > 0 ? topics : 'none',
        },
      } as IDataObject,
    },
  ];
}

/**
 * Filter events by topics
 */
export async function filterEvents(
  this: IExecuteFunctions,
  credentials: IEnergyWebCredentials,
  index: number,
): Promise<INodeExecutionData[]> {
  const contractAddress = this.getNodeParameter('contractAddress', index) as string;
  const eventSignature = this.getNodeParameter('eventSignature', index, '') as string;
  const topic1 = this.getNodeParameter('topic1', index, '') as string;
  const topic2 = this.getNodeParameter('topic2', index, '') as string;
  const topic3 = this.getNodeParameter('topic3', index, '') as string;
  const fromBlock = this.getNodeParameter('fromBlock', index, 'latest') as string | number;
  const toBlock = this.getNodeParameter('toBlock', index, 'latest') as string | number;

  if (!isValidAddress(contractAddress)) {
    throw new NodeOperationError(this.getNode(), ERROR_MESSAGES.INVALID_ADDRESS, { itemIndex: index });
  }

  // Build topics array
  const topics: (string | null)[] = [];

  if (eventSignature) {
    // Event signature should be keccak256 hash
    topics.push(eventSignature.startsWith('0x') ? eventSignature : `0x${eventSignature}`);
  } else {
    topics.push(null);
  }

  if (topic1) {
    topics.push(topic1.startsWith('0x') ? topic1 : `0x${topic1.padStart(64, '0')}`);
  } else if (topic2 || topic3) {
    topics.push(null);
  }

  if (topic2) {
    topics.push(topic2.startsWith('0x') ? topic2 : `0x${topic2.padStart(64, '0')}`);
  } else if (topic3) {
    topics.push(null);
  }

  if (topic3) {
    topics.push(topic3.startsWith('0x') ? topic3 : `0x${topic3.padStart(64, '0')}`);
  }

  const filter: IDataObject = {
    address: contractAddress,
    fromBlock: typeof fromBlock === 'number' ? numberToHex(fromBlock) : fromBlock,
    toBlock: typeof toBlock === 'number' ? numberToHex(toBlock) : toBlock,
    topics,
  };

  const logs = (await executeRpcRequest.call(this, credentials, 'eth_getLogs', [filter])) as Array<{
    address: string;
    topics: string[];
    data: string;
    blockNumber: string;
    transactionHash: string;
    transactionIndex: string;
    blockHash: string;
    logIndex: string;
    removed: boolean;
  }>;

  const formattedLogs: IDecodedEventLog[] = logs.map((log) => ({
    address: log.address,
    topics: log.topics,
    data: log.data,
    blockNumber: hexToNumber(log.blockNumber),
    transactionHash: log.transactionHash,
    transactionIndex: hexToNumber(log.transactionIndex),
    blockHash: log.blockHash,
    logIndex: hexToNumber(log.logIndex),
    removed: log.removed,
    eventName: eventSignature ? 'Filtered Event' : undefined,
  }));

  return [
    {
      json: {
        logs: formattedLogs,
        count: formattedLogs.length,
        filter: {
          address: contractAddress,
          fromBlock,
          toBlock,
          eventSignature: eventSignature || 'any',
          topics: topics.filter((t) => t !== null),
        },
      } as IDataObject,
    },
  ];
}

/**
 * Subscribe to real-time events (returns filter ID for polling)
 */
export async function subscribeToEvents(
  this: IExecuteFunctions,
  credentials: IEnergyWebCredentials,
  index: number,
): Promise<INodeExecutionData[]> {
  const contractAddress = this.getNodeParameter('contractAddress', index, '') as string;
  const topics = this.getNodeParameter('topics', index, []) as string[];

  if (contractAddress && !isValidAddress(contractAddress)) {
    throw new NodeOperationError(this.getNode(), ERROR_MESSAGES.INVALID_ADDRESS, { itemIndex: index });
  }

  // Create log filter
  const filterParams: IDataObject = {};

  if (contractAddress) {
    filterParams.address = contractAddress;
  }

  if (topics.length > 0) {
    filterParams.topics = topics.map((t) => (t === '' || t === 'null' ? null : t));
  }

  try {
    // Create new filter
    const filterId = (await executeRpcRequest.call(this, credentials, 'eth_newFilter', [
      filterParams,
    ])) as string;

    // Get current block for reference
    const currentBlockHex = (await executeRpcRequest.call(
      this,
      credentials,
      'eth_blockNumber',
      [],
    )) as string;
    const currentBlock = hexToNumber(currentBlockHex);

    return [
      {
        json: {
          filterId,
          filterType: 'logs',
          address: contractAddress || 'all',
          topics: topics.length > 0 ? topics : 'none',
          createdAtBlock: currentBlock,
          instructions: {
            poll: 'Use eth_getFilterChanges with filterId to poll for new events',
            uninstall: 'Use eth_uninstallFilter with filterId when done',
            note: 'Filters expire after ~5 minutes of inactivity on most nodes',
          },
        } as IDataObject,
      },
    ];
  } catch {
    // Fallback: Some nodes don't support filters, provide polling instructions
    const currentBlockHex = (await executeRpcRequest.call(
      this,
      credentials,
      'eth_blockNumber',
      [],
    )) as string;
    const currentBlock = hexToNumber(currentBlockHex);

    return [
      {
        json: {
          filterId: null,
          filterType: 'polling',
          address: contractAddress || 'all',
          topics: topics.length > 0 ? topics : 'none',
          startBlock: currentBlock,
          instructions: {
            poll: 'Use getLogs operation with incrementing fromBlock to poll for new events',
            note: 'This RPC endpoint does not support event filters. Use manual polling instead.',
          },
        } as IDataObject,
      },
    ];
  }
}
