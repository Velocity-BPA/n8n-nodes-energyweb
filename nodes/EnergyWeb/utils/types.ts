/*
 * Copyright (c) Velocity BPA, LLC
 * Licensed under the Business Source License 1.1
 * Commercial use requires a separate commercial license.
 * See LICENSE file for details.
 */

import type { IDataObject } from 'n8n-workflow';

// Network types
export type NetworkType = 'mainnet' | 'volta' | 'custom';

export interface IEnergyWebCredentials {
  network: NetworkType;
  customRpcEndpoint?: string;
  privateKey?: string;
  ewScanApiKey?: string;
  originApiUrl?: string;
  didRegistryAddress?: string;
}

// JSON-RPC types
export interface IJsonRpcRequest {
  jsonrpc: '2.0';
  method: string;
  params: unknown[];
  id: number;
}

export interface IJsonRpcResponse<T = unknown> {
  jsonrpc: '2.0';
  id: number;
  result?: T;
  error?: {
    code: number;
    message: string;
    data?: unknown;
  };
}

// Account types
export interface IAccountBalance {
  address: string;
  balance: string;
  balanceEwt: string;
  network: string;
}

export interface ITokenBalance {
  contractAddress: string;
  tokenName: string;
  tokenSymbol: string;
  tokenDecimals: number;
  balance: string;
  balanceFormatted: string;
}

export interface ITransaction {
  hash: string;
  nonce: number;
  blockHash: string | null;
  blockNumber: number | null;
  transactionIndex: number | null;
  from: string;
  to: string | null;
  value: string;
  gasPrice: string;
  gas: number;
  input: string;
  v?: string;
  r?: string;
  s?: string;
}

export interface ITransactionReceipt {
  transactionHash: string;
  transactionIndex: number;
  blockHash: string;
  blockNumber: number;
  from: string;
  to: string | null;
  cumulativeGasUsed: number;
  gasUsed: number;
  contractAddress: string | null;
  logs: IEventLog[];
  status: boolean;
  logsBloom: string;
}

export interface ITransactionStatus {
  hash: string;
  status: 'pending' | 'confirmed' | 'failed';
  confirmations: number;
  blockNumber: number | null;
  gasUsed?: number;
}

// DID types
export interface IDIDDocument {
  '@context': string[];
  id: string;
  verificationMethod?: IVerificationMethod[];
  authentication?: string[];
  assertionMethod?: string[];
  service?: IServiceEndpoint[];
  created?: string;
  updated?: string;
}

export interface IVerificationMethod {
  id: string;
  type: string;
  controller: string;
  publicKeyJwk?: IDataObject;
  publicKeyHex?: string;
  blockchainAccountId?: string;
}

export interface IServiceEndpoint {
  id: string;
  type: string;
  serviceEndpoint: string;
}

export interface IDIDClaim {
  id: string;
  subject: string;
  issuer: string;
  claimType: string;
  claimData: IDataObject;
  issuanceDate: string;
  expirationDate?: string;
  proof?: IDataObject;
}

export interface IVerifiableCredential {
  '@context': string[];
  id: string;
  type: string[];
  issuer: string;
  issuanceDate: string;
  expirationDate?: string;
  credentialSubject: IDataObject;
  proof?: IDataObject;
}

// Origin (REC) types
export interface ICertificate {
  id: string;
  deviceId: string;
  generationStartTime: number;
  generationEndTime: number;
  creationTime: number;
  owners: { [address: string]: string };
  energy: string;
  isRetired: boolean;
  claimData?: IClaimData;
}

export interface IClaimData {
  beneficiary: string;
  location: string;
  countryCode: string;
  periodStartDate: string;
  periodEndDate: string;
  purpose: string;
}

export interface ICertificateHistory {
  certificateId: string;
  events: ICertificateEvent[];
}

export interface ICertificateEvent {
  type: 'issued' | 'transferred' | 'claimed' | 'retired';
  timestamp: number;
  from?: string;
  to?: string;
  amount?: string;
  txHash: string;
}

// Asset types
export interface IAsset {
  id: string;
  owner: string;
  assetType: string;
  capacity: string;
  location: ILocation;
  commissioningDate: string;
  gridOperator: string;
  status: 'active' | 'inactive' | 'pending';
  metadata: IDataObject;
  linkedDID?: string;
}

export interface ILocation {
  country: string;
  region?: string;
  latitude?: number;
  longitude?: number;
  address?: string;
}

export interface IAssetHistory {
  assetId: string;
  events: IAssetEvent[];
}

export interface IAssetEvent {
  type: 'registered' | 'updated' | 'activated' | 'deactivated' | 'didLinked';
  timestamp: number;
  data?: IDataObject;
  txHash: string;
}

// Smart Contract types
export interface IContractCallResult {
  result: unknown;
  decodedResult?: IDataObject;
}

export interface IContractWriteResult {
  transactionHash: string;
  blockNumber?: number;
  gasUsed?: number;
  status: boolean;
}

export interface IEventLog {
  address: string;
  topics: string[];
  data: string;
  blockNumber: number;
  transactionHash: string;
  transactionIndex: number;
  blockHash: string;
  logIndex: number;
  removed: boolean;
}

export interface IDecodedEventLog extends IEventLog {
  eventName?: string;
  decodedData?: IDataObject;
}

// Token types
export interface ITokenInfo {
  address: string;
  name: string;
  symbol: string;
  decimals: number;
  totalSupply: string;
  owner?: string;
}

export interface ITokenHolder {
  address: string;
  balance: string;
  balanceFormatted: string;
  percentage: number;
}

// Network types
export interface INetworkStatus {
  chainId: number;
  networkName: string;
  latestBlock: number;
  gasPrice: string;
  gasPriceGwei: string;
  isConnected: boolean;
  peerCount: number;
}

export interface IBlock {
  number: number;
  hash: string;
  parentHash: string;
  nonce: string;
  sha3Uncles: string;
  logsBloom: string;
  transactionsRoot: string;
  stateRoot: string;
  receiptsRoot: string;
  miner: string;
  difficulty: string;
  totalDifficulty: string;
  extraData: string;
  size: number;
  gasLimit: number;
  gasUsed: number;
  timestamp: number;
  transactions: string[] | ITransaction[];
  uncles: string[];
}

export interface IValidator {
  address: string;
  isActive: boolean;
  blocksMined?: number;
  lastBlockMined?: number;
}

// Utility types
export interface IUnitConversion {
  wei: string;
  gwei: string;
  ewt: string;
}

export interface IEncodedDID {
  did: string;
  method: string;
  identifier: string;
}

export interface IAPIHealth {
  status: 'healthy' | 'degraded' | 'down';
  rpcConnected: boolean;
  latency: number;
  chainId?: number;
  blockNumber?: number;
}

// Trigger types
export interface ITriggerEvent {
  eventType: string;
  timestamp: number;
  data: IDataObject;
  transactionHash?: string;
  blockNumber?: number;
}

export interface IPollState {
  lastBlockNumber: number;
  lastTimestamp: number;
  processedTxHashes: string[];
}

// Resource and operation types
export type ResourceType =
  | 'accounts'
  | 'transactions'
  | 'dids'
  | 'origin'
  | 'assets'
  | 'smartContracts'
  | 'tokens'
  | 'network'
  | 'events'
  | 'utility';

export type AccountsOperation =
  | 'getBalance'
  | 'getTokenBalances'
  | 'getTransactionHistory'
  | 'getDIDDocument';

export type TransactionsOperation =
  | 'getTransaction'
  | 'sendTransaction'
  | 'estimateGas'
  | 'getTransactionStatus';

export type DIDsOperation =
  | 'createDID'
  | 'getDIDDocument'
  | 'updateDIDDocument'
  | 'revokeDID'
  | 'getDIDClaims'
  | 'issueClaim'
  | 'verifyClaim';

export type OriginOperation =
  | 'getCertificate'
  | 'issueCertificate'
  | 'transferCertificate'
  | 'retireCertificate'
  | 'getCertificateHistory'
  | 'getUserCertificates';

export type AssetsOperation =
  | 'registerAsset'
  | 'getAssetInfo'
  | 'updateAsset'
  | 'getAssetHistory'
  | 'linkDIDToAsset';

export type SmartContractsOperation =
  | 'readContract'
  | 'writeContract'
  | 'getContractEvents'
  | 'deployContract';

export type TokensOperation = 'getTokenInfo' | 'getTokenHolders' | 'transferToken';

export type NetworkOperation = 'getNetworkStatus' | 'getGasPrice' | 'getValidators' | 'getBlock';

export type EventsOperation = 'getLogs' | 'filterEvents' | 'subscribeToEvents';

export type UtilityOperation = 'convertUnits' | 'encodeDID' | 'getAPIHealth';

export type TriggerType =
  | 'certificateIssued'
  | 'certificateTransferred'
  | 'didCreated'
  | 'didUpdated'
  | 'assetRegistered'
  | 'largeTransfer';
