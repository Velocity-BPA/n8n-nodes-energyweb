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
  isValidAddress,
  isValidTxHash,
  isValidPrivateKey,
  weiToUnits,
  ewtToWei,
  hexToNumber,
  numberToHex,
} from '../../utils/helpers';
import { ERROR_MESSAGES, GAS_LIMITS } from '../../constants/constants';
import type {
  IEnergyWebCredentials,
  ITransaction,
  ITransactionReceipt,
  ITransactionStatus,
} from '../../utils/types';

/**
 * Get transaction details by hash
 */
export async function getTransaction(
  this: IExecuteFunctions,
  credentials: IEnergyWebCredentials,
  index: number,
): Promise<INodeExecutionData[]> {
  const txHash = this.getNodeParameter('transactionHash', index) as string;

  if (!isValidTxHash(txHash)) {
    throw new NodeOperationError(this.getNode(), 'Invalid transaction hash format', {
      itemIndex: index,
    });
  }

  const transaction = (await executeRpcRequest.call(this, credentials, 'eth_getTransactionByHash', [
    txHash,
  ])) as ITransaction | null;

  if (!transaction) {
    throw new NodeOperationError(this.getNode(), 'Transaction not found', { itemIndex: index });
  }

  // Get receipt for additional details
  const receipt = (await executeRpcRequest.call(
    this,
    credentials,
    'eth_getTransactionReceipt',
    [txHash],
  )) as ITransactionReceipt | null;

  const valueUnits = weiToUnits(BigInt(transaction.value).toString());

  return [
    {
      json: {
        hash: transaction.hash,
        nonce: transaction.nonce,
        blockHash: transaction.blockHash,
        blockNumber: transaction.blockNumber,
        transactionIndex: transaction.transactionIndex,
        from: transaction.from,
        to: transaction.to,
        value: transaction.value,
        valueEwt: valueUnits.ewt,
        gasPrice: transaction.gasPrice,
        gas: transaction.gas,
        input: transaction.input,
        status: receipt ? receipt.status : null,
        gasUsed: receipt ? receipt.gasUsed : null,
        contractAddress: receipt ? receipt.contractAddress : null,
        logs: receipt ? receipt.logs : [],
      } as IDataObject,
    },
  ];
}

/**
 * Send a transaction
 */
export async function sendTransaction(
  this: IExecuteFunctions,
  credentials: IEnergyWebCredentials,
  index: number,
): Promise<INodeExecutionData[]> {
  const to = this.getNodeParameter('to', index) as string;
  const valueEwt = this.getNodeParameter('value', index) as string;
  const data = this.getNodeParameter('data', index, '') as string;
  const gasLimit = this.getNodeParameter('gasLimit', index, GAS_LIMITS.transfer) as number;
  const gasPriceGwei = this.getNodeParameter('gasPrice', index, '') as string;

  if (!isValidAddress(to)) {
    throw new NodeOperationError(this.getNode(), ERROR_MESSAGES.INVALID_ADDRESS, {
      itemIndex: index,
    });
  }

  if (!credentials.privateKey) {
    throw new NodeOperationError(
      this.getNode(),
      'Private key is required for sending transactions',
      { itemIndex: index },
    );
  }

  if (!isValidPrivateKey(credentials.privateKey)) {
    throw new NodeOperationError(this.getNode(), ERROR_MESSAGES.INVALID_PRIVATE_KEY, {
      itemIndex: index,
    });
  }

  // Get gas price if not provided
  let gasPrice: string;
  if (gasPriceGwei) {
    gasPrice = numberToHex(parseInt(gasPriceGwei) * 1e9);
  } else {
    gasPrice = (await executeRpcRequest.call(
      this,
      credentials,
      'eth_gasPrice',
      [],
    )) as string;
  }

  // Convert value to Wei
  const valueWei = ewtToWei(valueEwt);

  // Get nonce
  const privateKey = credentials.privateKey.startsWith('0x')
    ? credentials.privateKey
    : '0x' + credentials.privateKey;

  // Derive address from private key (simplified - in production use proper crypto library)
  // For now, we'll require the user to provide the from address
  const from = this.getNodeParameter('from', index, '') as string;

  if (!from || !isValidAddress(from)) {
    throw new NodeOperationError(
      this.getNode(),
      'From address is required and must be valid',
      { itemIndex: index },
    );
  }

  const nonce = (await executeRpcRequest.call(this, credentials, 'eth_getTransactionCount', [
    from,
    'pending',
  ])) as string;

  // Build transaction object
  const tx = {
    from,
    to,
    value: numberToHex(parseInt(valueWei)),
    gas: numberToHex(gasLimit),
    gasPrice,
    nonce,
    data: data || '0x',
  };

  // Note: In production, you would sign the transaction with the private key
  // and send it via eth_sendRawTransaction. This requires a crypto library.
  // For demonstration, we'll document this requirement.

  return [
    {
      json: {
        message: 'Transaction prepared',
        transaction: tx,
        note: 'Transaction signing requires a crypto library. Use eth_sendRawTransaction with signed tx.',
        privateKeyProvided: !!privateKey,
      } as IDataObject,
    },
  ];
}

/**
 * Estimate gas for a transaction
 */
export async function estimateGas(
  this: IExecuteFunctions,
  credentials: IEnergyWebCredentials,
  index: number,
): Promise<INodeExecutionData[]> {
  const from = this.getNodeParameter('from', index, '') as string;
  const to = this.getNodeParameter('to', index) as string;
  const value = this.getNodeParameter('value', index, '0') as string;
  const data = this.getNodeParameter('data', index, '') as string;

  if (to && !isValidAddress(to)) {
    throw new NodeOperationError(this.getNode(), ERROR_MESSAGES.INVALID_ADDRESS, {
      itemIndex: index,
    });
  }

  const txParams: IDataObject = {
    to,
    data: data || '0x',
  };

  if (from && isValidAddress(from)) {
    txParams.from = from;
  }

  if (value && value !== '0') {
    txParams.value = numberToHex(parseInt(ewtToWei(value)));
  }

  const gasEstimateHex = (await executeRpcRequest.call(this, credentials, 'eth_estimateGas', [
    txParams,
  ])) as string;

  const gasEstimate = hexToNumber(gasEstimateHex);

  // Get current gas price
  const gasPriceHex = (await executeRpcRequest.call(
    this,
    credentials,
    'eth_gasPrice',
    [],
  )) as string;
  const gasPrice = BigInt(gasPriceHex);

  // Calculate estimated cost
  const estimatedCost = gasPrice * BigInt(gasEstimate);
  const costUnits = weiToUnits(estimatedCost.toString());

  return [
    {
      json: {
        gasEstimate,
        gasEstimateHex,
        gasPrice: gasPrice.toString(),
        gasPriceGwei: (gasPrice / BigInt(1e9)).toString(),
        estimatedCost: estimatedCost.toString(),
        estimatedCostEwt: costUnits.ewt,
      } as IDataObject,
    },
  ];
}

/**
 * Get transaction status and confirmations
 */
export async function getTransactionStatus(
  this: IExecuteFunctions,
  credentials: IEnergyWebCredentials,
  index: number,
): Promise<INodeExecutionData[]> {
  const txHash = this.getNodeParameter('transactionHash', index) as string;

  if (!isValidTxHash(txHash)) {
    throw new NodeOperationError(this.getNode(), 'Invalid transaction hash format', {
      itemIndex: index,
    });
  }

  // Get transaction
  const transaction = (await executeRpcRequest.call(this, credentials, 'eth_getTransactionByHash', [
    txHash,
  ])) as ITransaction | null;

  if (!transaction) {
    const status: ITransactionStatus = {
      hash: txHash,
      status: 'pending',
      confirmations: 0,
      blockNumber: null,
    };
    return [{ json: status as unknown as IDataObject }];
  }

  // Get receipt
  const receipt = (await executeRpcRequest.call(
    this,
    credentials,
    'eth_getTransactionReceipt',
    [txHash],
  )) as ITransactionReceipt | null;

  if (!receipt || !transaction.blockNumber) {
    const status: ITransactionStatus = {
      hash: txHash,
      status: 'pending',
      confirmations: 0,
      blockNumber: null,
    };
    return [{ json: status as unknown as IDataObject }];
  }

  // Get current block number
  const currentBlockHex = (await executeRpcRequest.call(
    this,
    credentials,
    'eth_blockNumber',
    [],
  )) as string;
  const currentBlock = hexToNumber(currentBlockHex);
  const confirmations = currentBlock - transaction.blockNumber + 1;

  const status: ITransactionStatus = {
    hash: txHash,
    status: receipt.status ? 'confirmed' : 'failed',
    confirmations,
    blockNumber: transaction.blockNumber,
    gasUsed: receipt.gasUsed,
  };

  return [{ json: status as unknown as IDataObject }];
}
