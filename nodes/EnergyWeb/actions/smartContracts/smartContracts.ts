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
import { ERROR_MESSAGES, GAS_LIMITS } from '../../constants/constants';
import type {
  IEnergyWebCredentials,
  IContractCallResult,
  IContractWriteResult,
  IEventLog,
  IDecodedEventLog,
} from '../../utils/types';

/**
 * Read from a smart contract (view/pure function)
 */
export async function readContract(
  this: IExecuteFunctions,
  credentials: IEnergyWebCredentials,
  index: number,
): Promise<INodeExecutionData[]> {
  const contractAddress = this.getNodeParameter('contractAddress', index) as string;
  const functionSignature = this.getNodeParameter('functionSignature', index) as string;
  const functionParams = this.getNodeParameter('functionParams', index, []) as string[];
  const blockNumber = this.getNodeParameter('blockNumber', index, 'latest') as string;

  if (!isValidAddress(contractAddress)) {
    throw new NodeOperationError(this.getNode(), ERROR_MESSAGES.INVALID_ADDRESS, {
      itemIndex: index,
    });
  }

  // Encode function call
  // Function signature should be like "balanceOf(address)" or just the selector "0x70a08231"
  let data: string;

  if (functionSignature.startsWith('0x')) {
    // Already a selector
    data = functionSignature;
    // Append encoded parameters
    for (const param of functionParams) {
      if (param.startsWith('0x') && param.length === 42) {
        // Address
        data += param.slice(2).padStart(64, '0');
      } else if (param.startsWith('0x')) {
        // Hex value
        data += param.slice(2).padStart(64, '0');
      } else if (/^\d+$/.test(param)) {
        // Number
        data += BigInt(param).toString(16).padStart(64, '0');
      } else {
        // String - encode as bytes
        data += Buffer.from(param).toString('hex').padStart(64, '0');
      }
    }
  } else {
    // Calculate function selector from signature
    // This is a simplified version - in production use keccak256
    // For now, expect the user to provide the selector or use common patterns
    throw new NodeOperationError(
      this.getNode(),
      'Please provide function selector (0x...) or use common function names',
      { itemIndex: index },
    );
  }

  const result = (await executeRpcRequest.call(this, credentials, 'eth_call', [
    { to: contractAddress, data },
    blockNumber,
  ])) as string;

  // Try to decode common return types
  let decodedResult: IDataObject | undefined;

  if (result && result !== '0x') {
    // Remove 0x prefix
    const resultData = result.slice(2);

    if (resultData.length === 64) {
      // Single value - could be uint256, address, bool, bytes32
      const value = BigInt('0x' + resultData);

      if (value <= BigInt(1)) {
        decodedResult = { type: 'bool', value: value === BigInt(1) };
      } else if (resultData.startsWith('000000000000000000000000') && resultData.length === 64) {
        // Likely an address
        decodedResult = { type: 'address', value: '0x' + resultData.slice(24) };
      } else {
        decodedResult = { type: 'uint256', value: value.toString() };
      }
    } else if (resultData.length >= 128) {
      // Could be string, bytes, or array
      decodedResult = {
        type: 'complex',
        rawLength: resultData.length / 2,
        note: 'Complex return type - manual decoding may be required',
      };
    }
  }

  const response: IContractCallResult = {
    result,
    decodedResult,
  };

  return [
    {
      json: {
        contractAddress,
        functionSignature,
        params: functionParams,
        ...response,
      } as unknown as IDataObject,
    },
  ];
}

/**
 * Write to a smart contract (state-changing function)
 */
export async function writeContract(
  this: IExecuteFunctions,
  credentials: IEnergyWebCredentials,
  index: number,
): Promise<INodeExecutionData[]> {
  const contractAddress = this.getNodeParameter('contractAddress', index) as string;
  const functionSignature = this.getNodeParameter('functionSignature', index) as string;
  const functionParams = this.getNodeParameter('functionParams', index, []) as string[];
  const value = this.getNodeParameter('value', index, '0') as string;
  const gasLimit = this.getNodeParameter('gasLimit', index, 100000) as number;
  const fromAddress = this.getNodeParameter('fromAddress', index) as string;

  if (!isValidAddress(contractAddress)) {
    throw new NodeOperationError(this.getNode(), 'Invalid contract address', { itemIndex: index });
  }

  if (!isValidAddress(fromAddress)) {
    throw new NodeOperationError(this.getNode(), 'Invalid from address', { itemIndex: index });
  }

  if (!credentials.privateKey) {
    throw new NodeOperationError(
      this.getNode(),
      'Private key is required for contract writes',
      { itemIndex: index },
    );
  }

  // Encode function call
  let data: string;

  if (functionSignature.startsWith('0x')) {
    data = functionSignature;
    for (const param of functionParams) {
      if (param.startsWith('0x') && param.length === 42) {
        data += param.slice(2).padStart(64, '0');
      } else if (param.startsWith('0x')) {
        data += param.slice(2).padStart(64, '0');
      } else if (/^\d+$/.test(param)) {
        data += BigInt(param).toString(16).padStart(64, '0');
      } else {
        data += Buffer.from(param).toString('hex').padStart(64, '0');
      }
    }
  } else {
    throw new NodeOperationError(
      this.getNode(),
      'Please provide function selector (0x...)',
      { itemIndex: index },
    );
  }

  // Get nonce
  const nonce = (await executeRpcRequest.call(this, credentials, 'eth_getTransactionCount', [
    fromAddress,
    'pending',
  ])) as string;

  // Get gas price
  const gasPrice = (await executeRpcRequest.call(
    this,
    credentials,
    'eth_gasPrice',
    [],
  )) as string;

  // Prepare transaction
  const tx = {
    from: fromAddress,
    to: contractAddress,
    data,
    gas: numberToHex(gasLimit),
    gasPrice,
    nonce,
    value: value !== '0' ? numberToHex(parseInt(value)) : '0x0',
  };

  // Estimate gas to validate
  try {
    const estimatedGas = (await executeRpcRequest.call(this, credentials, 'eth_estimateGas', [
      tx,
    ])) as string;

    return [
      {
        json: {
          message: 'Transaction prepared for signing',
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
          message: 'Transaction preparation failed',
          transaction: tx,
          error: error instanceof Error ? error.message : 'Gas estimation failed',
          note: 'Contract call may revert. Check parameters and contract state.',
        } as IDataObject,
      },
    ];
  }
}

/**
 * Get contract events/logs
 */
export async function getContractEvents(
  this: IExecuteFunctions,
  credentials: IEnergyWebCredentials,
  index: number,
): Promise<INodeExecutionData[]> {
  const contractAddress = this.getNodeParameter('contractAddress', index) as string;
  const eventSignature = this.getNodeParameter('eventSignature', index, '') as string;
  const fromBlock = this.getNodeParameter('fromBlock', index, 'earliest') as string;
  const toBlock = this.getNodeParameter('toBlock', index, 'latest') as string;
  const additionalTopics = this.getNodeParameter('additionalTopics', index, []) as string[];

  if (!isValidAddress(contractAddress)) {
    throw new NodeOperationError(this.getNode(), ERROR_MESSAGES.INVALID_ADDRESS, {
      itemIndex: index,
    });
  }

  const topics: (string | null)[] = [];

  if (eventSignature) {
    // Event signature should be the keccak256 hash or provided directly
    if (eventSignature.startsWith('0x') && eventSignature.length === 66) {
      topics.push(eventSignature);
    } else {
      // Would need keccak256 here - expect user to provide hash
      topics.push(eventSignature);
    }
  }

  // Add additional filter topics
  for (const topic of additionalTopics) {
    if (topic) {
      topics.push(topic.startsWith('0x') ? topic : '0x' + topic.padStart(64, '0'));
    } else {
      topics.push(null);
    }
  }

  const filter: IDataObject = {
    address: contractAddress,
    fromBlock,
    toBlock,
  };

  if (topics.length > 0) {
    filter.topics = topics;
  }

  const logs = (await executeRpcRequest.call(this, credentials, 'eth_getLogs', [filter])) as IEventLog[];

  // Format logs with decoded data where possible
  const formattedLogs: IDecodedEventLog[] = logs.map((log) => ({
    ...log,
    blockNumber: typeof log.blockNumber === 'string' ? hexToNumber(log.blockNumber) : log.blockNumber,
    transactionIndex:
      typeof log.transactionIndex === 'string'
        ? hexToNumber(log.transactionIndex)
        : log.transactionIndex,
    logIndex: typeof log.logIndex === 'string' ? hexToNumber(log.logIndex) : log.logIndex,
  }));

  return [
    {
      json: {
        contractAddress,
        eventSignature: eventSignature || 'all',
        fromBlock,
        toBlock,
        events: formattedLogs,
        totalEvents: formattedLogs.length,
      } as unknown as IDataObject,
    },
  ];
}

/**
 * Deploy a new smart contract
 */
export async function deployContract(
  this: IExecuteFunctions,
  credentials: IEnergyWebCredentials,
  index: number,
): Promise<INodeExecutionData[]> {
  const bytecode = this.getNodeParameter('bytecode', index) as string;
  const constructorParams = this.getNodeParameter('constructorParams', index, '') as string;
  const fromAddress = this.getNodeParameter('fromAddress', index) as string;
  const gasLimit = this.getNodeParameter('gasLimit', index, GAS_LIMITS.contractDeploy) as number;

  if (!isValidAddress(fromAddress)) {
    throw new NodeOperationError(this.getNode(), 'Invalid from address', { itemIndex: index });
  }

  if (!credentials.privateKey) {
    throw new NodeOperationError(
      this.getNode(),
      'Private key is required for contract deployment',
      { itemIndex: index },
    );
  }

  // Prepare deployment data
  let data = bytecode.startsWith('0x') ? bytecode : '0x' + bytecode;

  // Append constructor parameters if provided
  if (constructorParams) {
    const params = constructorParams.startsWith('0x')
      ? constructorParams.slice(2)
      : constructorParams;
    data += params;
  }

  // Get nonce
  const nonce = (await executeRpcRequest.call(this, credentials, 'eth_getTransactionCount', [
    fromAddress,
    'pending',
  ])) as string;

  // Get gas price
  const gasPrice = (await executeRpcRequest.call(
    this,
    credentials,
    'eth_gasPrice',
    [],
  )) as string;

  // Prepare deployment transaction
  const tx = {
    from: fromAddress,
    data,
    gas: numberToHex(gasLimit),
    gasPrice,
    nonce,
  };

  // Estimate gas
  try {
    const estimatedGas = (await executeRpcRequest.call(this, credentials, 'eth_estimateGas', [
      tx,
    ])) as string;

    // Calculate expected contract address (CREATE opcode)
    // address = keccak256(rlp([sender, nonce]))[12:]
    // Simplified - would need proper RLP encoding and keccak256

    return [
      {
        json: {
          message: 'Contract deployment transaction prepared',
          transaction: tx,
          estimatedGas: hexToNumber(estimatedGas),
          bytecodeSize: (data.length - 2) / 2,
          note: 'Sign with private key and send via eth_sendRawTransaction',
        } as IDataObject,
      },
    ];
  } catch (error) {
    return [
      {
        json: {
          message: 'Deployment preparation failed',
          transaction: tx,
          error: error instanceof Error ? error.message : 'Gas estimation failed',
          note: 'Check bytecode validity and constructor parameters',
        } as IDataObject,
      },
    ];
  }
}
