/*
 * Copyright (c) Velocity BPA, LLC
 * Licensed under the Business Source License 1.1
 * Commercial use requires a separate commercial license.
 * See LICENSE file for details.
 */

import type { IExecuteFunctions, INodeExecutionData, IDataObject } from 'n8n-workflow';
import { NodeOperationError } from 'n8n-workflow';
import { executeRpcRequest } from '../../transport/rpcClient';
import {
  weiToUnits,
  unitsToWei,
  encodeDID as encodeDIDHelper,
  isValidAddress,
  hexToNumber,
} from '../../utils/helpers';
import { NETWORKS, ERROR_MESSAGES } from '../../constants/constants';
import type { IEnergyWebCredentials, IUnitConversion, IEncodedDID, IAPIHealth, NetworkType } from '../../utils/types';

/**
 * Convert between Wei, Gwei, and EWT units
 */
export async function convertUnits(
  this: IExecuteFunctions,
  credentials: IEnergyWebCredentials,
  index: number,
): Promise<INodeExecutionData[]> {
  const amount = this.getNodeParameter('amount', index) as string;
  const fromUnit = this.getNodeParameter('fromUnit', index) as 'wei' | 'gwei' | 'ewt';
  const toUnit = this.getNodeParameter('toUnit', index) as 'wei' | 'gwei' | 'ewt';

  // Validate amount
  if (!amount || isNaN(parseFloat(amount))) {
    throw new NodeOperationError(this.getNode(), 'Invalid amount provided', { itemIndex: index });
  }

  // First convert to Wei
  let weiValue: string;

  switch (fromUnit) {
    case 'wei':
      weiValue = amount;
      break;
    case 'gwei':
      weiValue = unitsToWei(amount, 'gwei');
      break;
    case 'ewt':
      weiValue = unitsToWei(amount, 'ewt');
      break;
    default:
      throw new NodeOperationError(this.getNode(), `Unknown unit: ${fromUnit}`, { itemIndex: index });
  }

  // Then convert to target unit
  const converted = weiToUnits(weiValue);
  let result: string;

  switch (toUnit) {
    case 'wei':
      result = converted.wei;
      break;
    case 'gwei':
      result = converted.gwei;
      break;
    case 'ewt':
      result = converted.ewt;
      break;
    default:
      throw new NodeOperationError(this.getNode(), `Unknown unit: ${toUnit}`, { itemIndex: index });
  }

  const conversion: IUnitConversion = {
    wei: converted.wei,
    gwei: converted.gwei,
    ewt: converted.ewt,
  };

  return [
    {
      json: {
        input: {
          amount,
          unit: fromUnit,
        },
        output: {
          amount: result,
          unit: toUnit,
        },
        allUnits: conversion,
      } as IDataObject,
    },
  ];
}

/**
 * Encode/format a DID string from an address
 */
export async function encodeDID(
  this: IExecuteFunctions,
  credentials: IEnergyWebCredentials,
  index: number,
): Promise<INodeExecutionData[]> {
  const address = this.getNodeParameter('address', index) as string;

  if (!isValidAddress(address)) {
    throw new NodeOperationError(this.getNode(), ERROR_MESSAGES.INVALID_ADDRESS, { itemIndex: index });
  }

  const network = (credentials.network || 'mainnet') as NetworkType;
  const encoded = encodeDIDHelper(address, network);
  const networkConfig = NETWORKS[network as keyof typeof NETWORKS] || NETWORKS.mainnet;

  const result: IEncodedDID & { network: string; chainId: number } = {
    did: encoded.did,
    method: encoded.method,
    identifier: encoded.identifier,
    network: networkConfig.name,
    chainId: networkConfig.chainId,
  };

  return [{ json: result as unknown as IDataObject }];
}

/**
 * Check API health and connectivity
 */
export async function getAPIHealth(
  this: IExecuteFunctions,
  credentials: IEnergyWebCredentials,
  index: number,
): Promise<INodeExecutionData[]> {
  const startTime = Date.now();
  let rpcConnected = false;
  let chainId: number | undefined;
  let blockNumber: number | undefined;
  let status: 'healthy' | 'degraded' | 'down' = 'down';

  try {
    // Test RPC connection
    const chainIdHex = (await executeRpcRequest.call(this, credentials, 'eth_chainId', [])) as string;
    chainId = hexToNumber(chainIdHex);
    rpcConnected = true;

    // Get latest block
    const blockNumberHex = (await executeRpcRequest.call(
      this,
      credentials,
      'eth_blockNumber',
      [],
    )) as string;
    blockNumber = hexToNumber(blockNumberHex);

    // Check network health
    const network = credentials.network || 'mainnet';
    const expectedChainId = NETWORKS[network as keyof typeof NETWORKS]?.chainId;

    if (expectedChainId && chainId !== expectedChainId) {
      status = 'degraded';
    } else {
      status = 'healthy';
    }
  } catch {
    status = 'down';
    rpcConnected = false;
  }

  const latency = Date.now() - startTime;

  const healthResult: IAPIHealth = {
    status,
    rpcConnected,
    latency,
    chainId,
    blockNumber,
  };

  // Get network info
  const network = credentials.network || 'mainnet';
  const networkConfig = NETWORKS[network as keyof typeof NETWORKS] || NETWORKS.mainnet;

  return [
    {
      json: {
        ...healthResult,
        network: {
          name: networkConfig.name,
          expectedChainId: networkConfig.chainId,
          rpcUrl: credentials.customRpcEndpoint || networkConfig.rpcUrl,
        },
        timestamp: new Date().toISOString(),
      } as IDataObject,
    },
  ];
}
