/*
 * Copyright (c) Velocity BPA, LLC
 * Licensed under the Business Source License 1.1
 * Commercial use requires a separate commercial license.
 * See LICENSE file for details.
 */

import type {
  IPollFunctions,
  INodeExecutionData,
  INodeType,
  INodeTypeDescription,
  IDataObject,
} from 'n8n-workflow';
import { NodeOperationError } from 'n8n-workflow';

import { executeRpcRequest, executeEwScanRequest } from './transport/rpcClient';
import { hexToNumber, numberToHex, weiToUnits, isValidAddress } from './utils/helpers';
import { NETWORKS, DEFAULT_CONTRACTS } from './constants/constants';
import type { IEnergyWebCredentials, TriggerType, NetworkType } from './utils/types';

// Licensing notice (non-blocking, informational only)
const LICENSING_NOTICE = `[Velocity BPA Licensing Notice]
This n8n node is licensed under the Business Source License 1.1 (BSL 1.1).
Use of this node by for-profit organizations in production environments requires a commercial license from Velocity BPA.
For licensing information, visit https://velobpa.com/licensing or contact licensing@velobpa.com.`;

let licensingNoticeShown = false;

// Poll state interface
interface IPollState {
  lastBlockNumber: number;
  lastTimestamp: number;
  processedTxHashes: string[];
}

// Helper to get network config safely
function getNetworkConfig(network: NetworkType) {
  if (network === 'mainnet' || network === 'volta') {
    return NETWORKS[network];
  }
  return NETWORKS.mainnet;
}

// Helper to get contract address
function getContractAddress(network: NetworkType, contract: 'didRegistry' | 'claimManager' | 'identityManager'): string {
  if (network === 'mainnet' || network === 'volta') {
    return DEFAULT_CONTRACTS[network][contract];
  }
  return DEFAULT_CONTRACTS.mainnet[contract];
}

export class EnergyWebTrigger implements INodeType {
  description: INodeTypeDescription = {
    displayName: 'Energy Web Trigger',
    name: 'energyWebTrigger',
    icon: 'file:energyweb.svg',
    group: ['trigger'],
    version: 1,
    subtitle: '={{$parameter["triggerType"]}}',
    description: 'Poll for Energy Web Chain events - certificates, DIDs, assets, and transfers',
    defaults: {
      name: 'Energy Web Trigger',
    },
    inputs: [],
    outputs: ['main'],
    credentials: [
      {
        name: 'energyWebApi',
        required: true,
      },
    ],
    polling: true,
    properties: [
      {
        displayName: 'Trigger Type',
        name: 'triggerType',
        type: 'options',
        options: [
          {
            name: 'Asset Registered',
            value: 'assetRegistered',
            description: 'Trigger when a new energy asset is registered',
          },
          {
            name: 'Certificate Issued',
            value: 'certificateIssued',
            description: 'Trigger when a new REC is issued',
          },
          {
            name: 'Certificate Transferred',
            value: 'certificateTransferred',
            description: 'Trigger when a REC is transferred',
          },
          {
            name: 'DID Created',
            value: 'didCreated',
            description: 'Trigger when a new DID is created',
          },
          {
            name: 'DID Updated',
            value: 'didUpdated',
            description: 'Trigger when a DID document is updated',
          },
          {
            name: 'Large Transfer',
            value: 'largeTransfer',
            description: 'Trigger when a transfer above threshold occurs',
          },
        ],
        default: 'certificateIssued',
        required: true,
      },

      // Filter by address (optional)
      {
        displayName: 'Filter by Address',
        name: 'filterAddress',
        type: 'string',
        default: '',
        placeholder: '0x...',
        description: 'Only trigger for events involving this address (optional)',
        displayOptions: {
          show: {
            triggerType: [
              'certificateIssued',
              'certificateTransferred',
              'didCreated',
              'didUpdated',
              'assetRegistered',
              'largeTransfer',
            ],
          },
        },
      },

      // Large transfer threshold
      {
        displayName: 'Transfer Threshold (EWT)',
        name: 'transferThreshold',
        type: 'number',
        default: 100,
        description: 'Minimum transfer amount in EWT to trigger',
        displayOptions: {
          show: {
            triggerType: ['largeTransfer'],
          },
        },
      },

      // Lookback blocks for first poll
      {
        displayName: 'Lookback Blocks',
        name: 'lookbackBlocks',
        type: 'number',
        default: 100,
        description: 'Number of blocks to look back on first poll',
      },

      // Contract address (for certificate events)
      {
        displayName: 'Certificate Contract Address',
        name: 'certificateContract',
        type: 'string',
        default: '',
        placeholder: '0x...',
        description: 'Origin certificate contract address (optional, uses default if empty)',
        displayOptions: {
          show: {
            triggerType: ['certificateIssued', 'certificateTransferred'],
          },
        },
      },
    ],
  };

  async poll(this: IPollFunctions): Promise<INodeExecutionData[][] | null> {
    // Show licensing notice once per node load (non-blocking)
    if (!licensingNoticeShown) {
      this.logger.warn(LICENSING_NOTICE);
      licensingNoticeShown = true;
    }

    const credentials = (await this.getCredentials('energyWebApi')) as unknown as IEnergyWebCredentials;
    const triggerType = this.getNodeParameter('triggerType') as TriggerType;
    const lookbackBlocks = this.getNodeParameter('lookbackBlocks', 100) as number;

    // Get poll state
    const workflowStaticData = this.getWorkflowStaticData('node') as IDataObject;
    const pollState: IPollState = {
      lastBlockNumber: (workflowStaticData.lastBlockNumber as number) || 0,
      lastTimestamp: (workflowStaticData.lastTimestamp as number) || 0,
      processedTxHashes: (workflowStaticData.processedTxHashes as string[]) || [],
    };

    try {
      // Get current block number
      const currentBlockHex = await executeRpcRequest.call(
        this,
        credentials,
        'eth_blockNumber',
        [],
      ) as string;
      const currentBlock = hexToNumber(currentBlockHex);

      // Calculate from block
      let fromBlock: number;
      if (pollState.lastBlockNumber === 0) {
        // First poll - look back specified number of blocks
        fromBlock = Math.max(0, currentBlock - lookbackBlocks);
      } else {
        // Subsequent polls - start from last block + 1
        fromBlock = pollState.lastBlockNumber + 1;
      }

      // Skip if no new blocks
      if (fromBlock > currentBlock) {
        return null;
      }

      let events: INodeExecutionData[] = [];

      // Execute the appropriate poll function based on trigger type
      switch (triggerType) {
        case 'certificateIssued':
          events = await pollCertificateIssued.call(this, credentials, fromBlock, currentBlock);
          break;
        case 'certificateTransferred':
          events = await pollCertificateTransferred.call(this, credentials, fromBlock, currentBlock);
          break;
        case 'didCreated':
          events = await pollDIDCreated.call(this, credentials, fromBlock, currentBlock);
          break;
        case 'didUpdated':
          events = await pollDIDUpdated.call(this, credentials, fromBlock, currentBlock);
          break;
        case 'assetRegistered':
          events = await pollAssetRegistered.call(this, credentials, fromBlock, currentBlock);
          break;
        case 'largeTransfer':
          events = await pollLargeTransfer.call(this, credentials, fromBlock, currentBlock);
          break;
        default:
          throw new NodeOperationError(this.getNode(), `Unknown trigger type: ${triggerType}`);
      }

      // Filter out already processed events
      const newEvents = events.filter((event) => {
        const txHash = (event.json as IDataObject).transactionHash as string;
        return !pollState.processedTxHashes.includes(txHash);
      });

      // Update poll state
      workflowStaticData.lastBlockNumber = currentBlock;
      workflowStaticData.lastTimestamp = Date.now();
      workflowStaticData.processedTxHashes = newEvents
        .map((e) => (e.json as IDataObject).transactionHash as string)
        .filter(Boolean)
        .slice(-1000); // Keep last 1000 tx hashes to prevent memory issues

      if (newEvents.length === 0) {
        return null;
      }

      return [newEvents];
    } catch (error) {
      throw new NodeOperationError(
        this.getNode(),
        `Poll failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
}

// Poll function implementations

async function pollCertificateIssued(
  this: IPollFunctions,
  credentials: IEnergyWebCredentials,
  fromBlock: number,
  toBlock: number,
): Promise<INodeExecutionData[]> {
  const filterAddress = this.getNodeParameter('filterAddress', '') as string;
  const certificateContract = this.getNodeParameter('certificateContract', '') as string;
  const network = (credentials.network || 'mainnet') as NetworkType;
  const networkConfig = getNetworkConfig(network);

  // CertificateIssued event topic
  const eventTopic = '0x' + 'CertificateIssued'.padEnd(64, '0').slice(0, 64);

  const logs = await executeRpcRequest.call(this, credentials, 'eth_getLogs', [
    {
      fromBlock: numberToHex(fromBlock),
      toBlock: numberToHex(toBlock),
      address: certificateContract || undefined,
      topics: [eventTopic],
    },
  ]) as Array<{
    address: string;
    topics: string[];
    data: string;
    blockNumber: string;
    transactionHash: string;
    logIndex: string;
  }>;

  const events: INodeExecutionData[] = [];

  for (const log of logs) {
    // Parse the event data
    const certificateId = log.topics[1] ? hexToNumber(log.topics[1]).toString() : 'unknown';
    const toAddress = log.topics[2] ? '0x' + log.topics[2].slice(-40) : 'unknown';

    // Apply address filter if specified
    if (filterAddress && isValidAddress(filterAddress)) {
      if (toAddress.toLowerCase() !== filterAddress.toLowerCase()) {
        continue;
      }
    }

    events.push({
      json: {
        eventType: 'certificateIssued',
        certificateId,
        to: toAddress,
        contractAddress: log.address,
        blockNumber: hexToNumber(log.blockNumber),
        transactionHash: log.transactionHash,
        logIndex: hexToNumber(log.logIndex),
        network: networkConfig.name,
        timestamp: Date.now(),
      },
    });
  }

  return events;
}

async function pollCertificateTransferred(
  this: IPollFunctions,
  credentials: IEnergyWebCredentials,
  fromBlock: number,
  toBlock: number,
): Promise<INodeExecutionData[]> {
  const filterAddress = this.getNodeParameter('filterAddress', '') as string;
  const certificateContract = this.getNodeParameter('certificateContract', '') as string;
  const network = (credentials.network || 'mainnet') as NetworkType;
  const networkConfig = getNetworkConfig(network);

  // Transfer event topic (ERC1155 style)
  const eventTopic = '0xc3d58168c5ae7397731d063d5bbf3d657854427343f4c083240f7aacaa2d0f62';

  const logs = await executeRpcRequest.call(this, credentials, 'eth_getLogs', [
    {
      fromBlock: numberToHex(fromBlock),
      toBlock: numberToHex(toBlock),
      address: certificateContract || undefined,
      topics: [eventTopic],
    },
  ]) as Array<{
    address: string;
    topics: string[];
    data: string;
    blockNumber: string;
    transactionHash: string;
    logIndex: string;
  }>;

  const events: INodeExecutionData[] = [];

  for (const log of logs) {
    const from = log.topics[2] ? '0x' + log.topics[2].slice(-40) : 'unknown';
    const to = log.topics[3] ? '0x' + log.topics[3].slice(-40) : 'unknown';

    // Apply address filter
    if (filterAddress && isValidAddress(filterAddress)) {
      const filterLower = filterAddress.toLowerCase();
      if (from.toLowerCase() !== filterLower && to.toLowerCase() !== filterLower) {
        continue;
      }
    }

    events.push({
      json: {
        eventType: 'certificateTransferred',
        from,
        to,
        contractAddress: log.address,
        blockNumber: hexToNumber(log.blockNumber),
        transactionHash: log.transactionHash,
        logIndex: hexToNumber(log.logIndex),
        network: networkConfig.name,
        timestamp: Date.now(),
      },
    });
  }

  return events;
}

async function pollDIDCreated(
  this: IPollFunctions,
  credentials: IEnergyWebCredentials,
  fromBlock: number,
  toBlock: number,
): Promise<INodeExecutionData[]> {
  const filterAddress = this.getNodeParameter('filterAddress', '') as string;
  const network = (credentials.network || 'mainnet') as NetworkType;
  const networkConfig = getNetworkConfig(network);
  const didRegistry = credentials.didRegistryAddress || getContractAddress(network, 'didRegistry');

  // DIDOwnerChanged event topic
  const eventTopic = '0x38a5a6e68f30ed1ab45860a4afb34bcb2fc00f22ca462d249b8a8d40cda6f7a3';

  const logs = await executeRpcRequest.call(this, credentials, 'eth_getLogs', [
    {
      fromBlock: numberToHex(fromBlock),
      toBlock: numberToHex(toBlock),
      address: didRegistry,
      topics: [eventTopic],
    },
  ]) as Array<{
    address: string;
    topics: string[];
    data: string;
    blockNumber: string;
    transactionHash: string;
    logIndex: string;
  }>;

  const events: INodeExecutionData[] = [];

  for (const log of logs) {
    const identity = log.topics[1] ? '0x' + log.topics[1].slice(-40) : 'unknown';
    const owner = log.data ? '0x' + log.data.slice(26, 66) : 'unknown';

    // Check if this is a new DID (owner = identity typically for new DIDs)
    if (identity.toLowerCase() !== owner.toLowerCase()) {
      continue;
    }

    // Apply address filter
    if (filterAddress && isValidAddress(filterAddress)) {
      if (identity.toLowerCase() !== filterAddress.toLowerCase()) {
        continue;
      }
    }

    const did = `did:ethr:${network === 'volta' ? 'volta' : 'ewc'}:${identity}`;

    events.push({
      json: {
        eventType: 'didCreated',
        did,
        identity,
        owner,
        blockNumber: hexToNumber(log.blockNumber),
        transactionHash: log.transactionHash,
        logIndex: hexToNumber(log.logIndex),
        network: networkConfig.name,
        timestamp: Date.now(),
      },
    });
  }

  return events;
}

async function pollDIDUpdated(
  this: IPollFunctions,
  credentials: IEnergyWebCredentials,
  fromBlock: number,
  toBlock: number,
): Promise<INodeExecutionData[]> {
  const filterAddress = this.getNodeParameter('filterAddress', '') as string;
  const network = (credentials.network || 'mainnet') as NetworkType;
  const networkConfig = getNetworkConfig(network);
  const didRegistry = credentials.didRegistryAddress || getContractAddress(network, 'didRegistry');

  // DIDAttributeChanged event topic
  const eventTopic = '0x18ab6b2ae3d64571f0c9f8c5e2b72f3a23bfa3773b1c3c4e5d3e2fd0e3e1c4b2';

  const logs = await executeRpcRequest.call(this, credentials, 'eth_getLogs', [
    {
      fromBlock: numberToHex(fromBlock),
      toBlock: numberToHex(toBlock),
      address: didRegistry,
      topics: [eventTopic],
    },
  ]) as Array<{
    address: string;
    topics: string[];
    data: string;
    blockNumber: string;
    transactionHash: string;
    logIndex: string;
  }>;

  const events: INodeExecutionData[] = [];

  for (const log of logs) {
    const identity = log.topics[1] ? '0x' + log.topics[1].slice(-40) : 'unknown';

    // Apply address filter
    if (filterAddress && isValidAddress(filterAddress)) {
      if (identity.toLowerCase() !== filterAddress.toLowerCase()) {
        continue;
      }
    }

    const did = `did:ethr:${network === 'volta' ? 'volta' : 'ewc'}:${identity}`;

    events.push({
      json: {
        eventType: 'didUpdated',
        did,
        identity,
        blockNumber: hexToNumber(log.blockNumber),
        transactionHash: log.transactionHash,
        logIndex: hexToNumber(log.logIndex),
        network: networkConfig.name,
        timestamp: Date.now(),
      },
    });
  }

  return events;
}

async function pollAssetRegistered(
  this: IPollFunctions,
  credentials: IEnergyWebCredentials,
  fromBlock: number,
  toBlock: number,
): Promise<INodeExecutionData[]> {
  const filterAddress = this.getNodeParameter('filterAddress', '') as string;
  const network = (credentials.network || 'mainnet') as NetworkType;
  const networkConfig = getNetworkConfig(network);

  // Try to get asset registration events from EW Scan API
  try {
    const response = await executeEwScanRequest.call(
      this,
      credentials,
      '/v1/logs',
      {
        from_block: fromBlock,
        to_block: toBlock,
        topic: 'AssetRegistered',
      },
    ) as { items: Array<{
      address: string;
      topics: string[];
      data: string;
      block_number: number;
      transaction_hash: string;
      log_index: number;
    }> };

    const events: INodeExecutionData[] = [];

    for (const log of response.items || []) {
      const owner = log.topics[1] ? '0x' + log.topics[1].slice(-40) : 'unknown';

      // Apply address filter
      if (filterAddress && isValidAddress(filterAddress)) {
        if (owner.toLowerCase() !== filterAddress.toLowerCase()) {
          continue;
        }
      }

      events.push({
        json: {
          eventType: 'assetRegistered',
          owner,
          contractAddress: log.address,
          blockNumber: log.block_number,
          transactionHash: log.transaction_hash,
          logIndex: log.log_index,
          network: networkConfig.name,
          timestamp: Date.now(),
        },
      });
    }

    return events;
  } catch {
    // Return empty if EW Scan API not available
    return [];
  }
}

async function pollLargeTransfer(
  this: IPollFunctions,
  credentials: IEnergyWebCredentials,
  fromBlock: number,
  toBlock: number,
): Promise<INodeExecutionData[]> {
  const filterAddress = this.getNodeParameter('filterAddress', '') as string;
  const threshold = this.getNodeParameter('transferThreshold', 100) as number;
  const network = (credentials.network || 'mainnet') as NetworkType;
  const networkConfig = getNetworkConfig(network);

  const thresholdWei = BigInt(threshold) * BigInt(10 ** 18);

  // Get blocks and check for large transfers
  const events: INodeExecutionData[] = [];

  // Process in batches to avoid timeout
  const batchSize = 10;
  for (let block = fromBlock; block <= toBlock; block += batchSize) {
    const endBlock = Math.min(block + batchSize - 1, toBlock);

    for (let b = block; b <= endBlock; b++) {
      try {
        const blockData = await executeRpcRequest.call(this, credentials, 'eth_getBlockByNumber', [
          numberToHex(b),
          true,
        ]) as {
          number: string;
          timestamp: string;
          transactions: Array<{
            hash: string;
            from: string;
            to: string | null;
            value: string;
          }>;
        } | null;

        if (!blockData || !blockData.transactions) {
          continue;
        }

        for (const tx of blockData.transactions) {
          const value = BigInt(tx.value || '0');

          if (value < thresholdWei) {
            continue;
          }

          // Apply address filter
          if (filterAddress && isValidAddress(filterAddress)) {
            const filterLower = filterAddress.toLowerCase();
            if (
              tx.from.toLowerCase() !== filterLower &&
              (tx.to?.toLowerCase() || '') !== filterLower
            ) {
              continue;
            }
          }

          const valueUnits = weiToUnits(value.toString());

          events.push({
            json: {
              eventType: 'largeTransfer',
              from: tx.from,
              to: tx.to,
              value: value.toString(),
              valueEwt: valueUnits.ewt,
              threshold,
              blockNumber: hexToNumber(blockData.number),
              transactionHash: tx.hash,
              network: networkConfig.name,
              timestamp: hexToNumber(blockData.timestamp) * 1000,
            },
          });
        }
      } catch {
        // Skip problematic blocks
        continue;
      }
    }
  }

  return events;
}
