/*
 * Copyright (c) Velocity BPA, LLC
 * Licensed under the Business Source License 1.1
 * Commercial use requires a separate commercial license.
 * See LICENSE file for details.
 */

import type { IExecuteFunctions, INodeExecutionData, IDataObject } from 'n8n-workflow';
import { NodeOperationError } from 'n8n-workflow';
import { executeRpcRequest, executeEwScanRequest } from '../../transport/rpcClient';
import { isValidAddress, weiToUnits, encodeDID, hexToNumber } from '../../utils/helpers';
import { NETWORKS, ERROR_MESSAGES } from '../../constants/constants';
import type {
  IEnergyWebCredentials,
  IAccountBalance,
  ITokenBalance,
  IDIDDocument,
  NetworkType,
} from '../../utils/types';

/**
 * Get EWT balance for an address
 */
export async function getBalance(
  this: IExecuteFunctions,
  credentials: IEnergyWebCredentials,
  index: number,
): Promise<INodeExecutionData[]> {
  const address = this.getNodeParameter('address', index) as string;

  if (!isValidAddress(address)) {
    throw new NodeOperationError(this.getNode(), ERROR_MESSAGES.INVALID_ADDRESS, { itemIndex: index });
  }

  const balanceHex = await executeRpcRequest.call(this, credentials, 'eth_getBalance', [
    address,
    'latest',
  ]) as string;

  const balanceWei = BigInt(balanceHex).toString();
  const units = weiToUnits(balanceWei);
  const network = credentials.network || 'mainnet';
  const networkConfig = NETWORKS[network as keyof typeof NETWORKS] || NETWORKS.mainnet;

  const result: IAccountBalance = {
    address,
    balance: balanceWei,
    balanceEwt: units.ewt,
    network: networkConfig.name,
  };

  return [{ json: result as unknown as IDataObject }];
}

/**
 * Get token balances for an address
 */
export async function getTokenBalances(
  this: IExecuteFunctions,
  credentials: IEnergyWebCredentials,
  index: number,
): Promise<INodeExecutionData[]> {
  const address = this.getNodeParameter('address', index) as string;

  if (!isValidAddress(address)) {
    throw new NodeOperationError(this.getNode(), ERROR_MESSAGES.INVALID_ADDRESS, { itemIndex: index });
  }

  try {
    // Query EW Scan API for token balances
    const response = await executeEwScanRequest.call(
      this,
      credentials,
      '/v1/addresses/' + address + '/token-balances',
    ) as Array<{
      token: {
        address: string;
        name: string;
        symbol: string;
        decimals: number;
      };
      value: string;
    }>;

    const tokenBalances: ITokenBalance[] = (response || []).map((item) => {
      const decimals = item.token.decimals || 18;
      const balanceRaw = BigInt(item.value || '0');
      const divisor = BigInt(10 ** decimals);
      const balanceFormatted =
        (balanceRaw / divisor).toString() +
        (balanceRaw % divisor !== BigInt(0)
          ? '.' + (balanceRaw % divisor).toString().padStart(decimals, '0').replace(/0+$/, '')
          : '');

      return {
        contractAddress: item.token.address,
        tokenName: item.token.name,
        tokenSymbol: item.token.symbol,
        tokenDecimals: decimals,
        balance: item.value,
        balanceFormatted,
      };
    });

    return [{ json: { address, tokenBalances } as IDataObject }];
  } catch {
    // If EW Scan fails, return empty array
    return [{ json: { address, tokenBalances: [] } as IDataObject }];
  }
}

/**
 * Get transaction history for an address
 */
export async function getTransactionHistory(
  this: IExecuteFunctions,
  credentials: IEnergyWebCredentials,
  index: number,
): Promise<INodeExecutionData[]> {
  const address = this.getNodeParameter('address', index) as string;
  const limit = this.getNodeParameter('limit', index, 10) as number;
  const offset = this.getNodeParameter('offset', index, 0) as number;

  if (!isValidAddress(address)) {
    throw new NodeOperationError(this.getNode(), ERROR_MESSAGES.INVALID_ADDRESS, { itemIndex: index });
  }

  try {
    const response = await executeEwScanRequest.call(
      this,
      credentials,
      '/v1/addresses/' + address + '/transactions',
      { limit, offset },
    ) as {
      items: Array<{
        hash: string;
        blockNumber: number;
        timestamp: string;
        from: { hash: string };
        to: { hash: string } | null;
        value: string;
        gasUsed: string;
        status: string;
      }>;
      next_page_params: IDataObject | null;
    };

    const transactions = (response.items || []).map((tx) => ({
      hash: tx.hash,
      blockNumber: tx.blockNumber,
      timestamp: tx.timestamp,
      from: tx.from.hash,
      to: tx.to?.hash || null,
      value: tx.value,
      valueEwt: weiToUnits(tx.value).ewt,
      gasUsed: tx.gasUsed,
      status: tx.status,
    }));

    return [
      {
        json: {
          address,
          transactions,
          pagination: {
            limit,
            offset,
            hasMore: response.next_page_params !== null,
          },
        } as IDataObject,
      },
    ];
  } catch {
    // Fallback: get recent blocks and filter transactions
    const latestBlockHex = await executeRpcRequest.call(
      this,
      credentials,
      'eth_blockNumber',
      [],
    ) as string;
    const latestBlock = hexToNumber(latestBlockHex);

    return [
      {
        json: {
          address,
          transactions: [],
          latestBlock,
          message: 'Transaction history requires EW Scan API access',
        } as IDataObject,
      },
    ];
  }
}

/**
 * Get DID document for an address
 */
export async function getDIDDocument(
  this: IExecuteFunctions,
  credentials: IEnergyWebCredentials,
  index: number,
): Promise<INodeExecutionData[]> {
  const address = this.getNodeParameter('address', index) as string;

  if (!isValidAddress(address)) {
    throw new NodeOperationError(this.getNode(), ERROR_MESSAGES.INVALID_ADDRESS, { itemIndex: index });
  }

  const network = (credentials.network || 'mainnet') as NetworkType;
  const { did } = encodeDID(address, network);

  // Query DID Registry contract for changed block
  const didRegistryAddress = credentials.didRegistryAddress || '0xc15d5a57a8eb0e1dcbe5d88b8f9a82017e5cc4af';
  
  // Get identity owner
  const ownerData = '0x8733d4e8' + address.slice(2).padStart(64, '0'); // identityOwner(address)
  const ownerResult = await executeRpcRequest.call(
    this,
    credentials,
    'eth_call',
    [{ to: didRegistryAddress, data: ownerData }, 'latest'],
  ) as string;

  const owner = '0x' + ownerResult.slice(-40);

  // Get changed block
  const changedData = '0xf96d0f9f' + address.slice(2).padStart(64, '0'); // changed(address)
  const changedResult = await executeRpcRequest.call(
    this,
    credentials,
    'eth_call',
    [{ to: didRegistryAddress, data: changedData }, 'latest'],
  ) as string;

  const changedBlock = hexToNumber(changedResult);

  // Construct basic DID document
  const didDocument: IDIDDocument = {
    '@context': [
      'https://www.w3.org/ns/did/v1',
      'https://w3id.org/security/suites/secp256k1recovery-2020/v2',
    ],
    id: did,
    verificationMethod: [
      {
        id: `${did}#controller`,
        type: 'EcdsaSecp256k1RecoveryMethod2020',
        controller: did,
        blockchainAccountId: `eip155:${network === 'volta' ? '73799' : '246'}:${address}`,
      },
    ],
    authentication: [`${did}#controller`],
    assertionMethod: [`${did}#controller`],
  };

  return [
    {
      json: {
        did,
        address,
        owner,
        changedBlock,
        document: didDocument,
      } as unknown as IDataObject,
    },
  ];
}
