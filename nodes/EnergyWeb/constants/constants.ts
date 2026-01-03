/*
 * Copyright (c) Velocity BPA, LLC
 * Licensed under the Business Source License 1.1
 * Commercial use requires a separate commercial license.
 * See LICENSE file for details.
 */

// Network configuration
export const NETWORKS = {
  mainnet: {
    name: 'Energy Web Chain',
    chainId: 246,
    rpcUrl: 'https://rpc.energyweb.org',
    explorerUrl: 'https://explorer.energyweb.org',
    symbol: 'EWT',
    decimals: 18,
  },
  volta: {
    name: 'Volta Testnet',
    chainId: 73799,
    rpcUrl: 'https://volta-rpc.energyweb.org',
    explorerUrl: 'https://volta-explorer.energyweb.org',
    symbol: 'VT',
    decimals: 18,
  },
} as const;

// Default contract addresses
export const DEFAULT_CONTRACTS = {
  mainnet: {
    didRegistry: '0xc15d5a57a8eb0e1dcbe5d88b8f9a82017e5cc4af',
    claimManager: '0x5339adE9332A604A1c957B9bC1C6eee0Bcf7a031',
    identityManager: '0x985e531693E3F7353F897EC1cE1E0C70B2bE6F6E',
  },
  volta: {
    didRegistry: '0xc15d5a57a8eb0e1dcbe5d88b8f9a82017e5cc4af',
    claimManager: '0x5339adE9332A604A1c957B9bC1C6eee0Bcf7a031',
    identityManager: '0x985e531693E3F7353F897EC1cE1E0C70B2bE6F6E',
  },
} as const;

// Alias for backwards compatibility
export const CONTRACT_ADDRESSES = DEFAULT_CONTRACTS;

// DID method
export const DID_METHOD = 'did:ethr:ewc';
export const DID_METHOD_VOLTA = 'did:ethr:volta';

// API endpoints
export const ORIGIN_API = {
  mainnet: 'https://origin.energyweb.org/api',
  volta: 'https://origin-volta.energyweb.org/api',
} as const;

// ERC20 ABI (minimal)
export const ERC20_ABI = [
  'function name() view returns (string)',
  'function symbol() view returns (string)',
  'function decimals() view returns (uint8)',
  'function totalSupply() view returns (uint256)',
  'function balanceOf(address owner) view returns (uint256)',
  'function transfer(address to, uint256 amount) returns (bool)',
  'function allowance(address owner, address spender) view returns (uint256)',
  'function approve(address spender, uint256 amount) returns (bool)',
  'function transferFrom(address from, address to, uint256 amount) returns (bool)',
  'event Transfer(address indexed from, address indexed to, uint256 value)',
  'event Approval(address indexed owner, address indexed spender, uint256 value)',
];

// DID Registry ABI (minimal)
export const DID_REGISTRY_ABI = [
  'function identityOwner(address identity) view returns (address)',
  'function changed(address identity) view returns (uint256)',
  'function nonce(address identity) view returns (uint256)',
  'function changeOwner(address identity, address newOwner)',
  'function changeOwnerSigned(address identity, uint8 sigV, bytes32 sigR, bytes32 sigS, address newOwner)',
  'function setAttribute(address identity, bytes32 name, bytes value, uint256 validity)',
  'function setAttributeSigned(address identity, uint8 sigV, bytes32 sigR, bytes32 sigS, bytes32 name, bytes value, uint256 validity)',
  'function revokeAttribute(address identity, bytes32 name, bytes value)',
  'function revokeAttributeSigned(address identity, uint8 sigV, bytes32 sigR, bytes32 sigS, bytes32 name, bytes value)',
  'event DIDOwnerChanged(address indexed identity, address owner, uint256 previousChange)',
  'event DIDAttributeChanged(address indexed identity, bytes32 name, bytes value, uint256 validTo, uint256 previousChange)',
];

// Origin Certificate ABI (minimal)
export const ORIGIN_CERTIFICATE_ABI = [
  'function issue(address to, uint256 amount, uint256 generationStart, uint256 generationEnd) returns (uint256)',
  'function transfer(address to, uint256 id, uint256 amount)',
  'function claim(uint256 id, bytes claimData)',
  'function getCertificate(uint256 id) view returns (tuple(uint256 deviceId, uint256 generationStart, uint256 generationEnd, uint256 creationTime, bool isRetired))',
  'function balanceOf(address owner, uint256 id) view returns (uint256)',
  'event CertificateIssued(uint256 indexed id, address indexed to, uint256 amount)',
  'event CertificateTransferred(uint256 indexed id, address indexed from, address indexed to, uint256 amount)',
  'event CertificateClaimed(uint256 indexed id, address indexed claimer, bytes claimData)',
];

// Gas limits
export const GAS_LIMITS = {
  transfer: 21000,
  erc20Transfer: 65000,
  didCreate: 150000,
  didUpdate: 100000,
  didRevoke: 80000,
  claimIssue: 200000,
  certificateIssue: 250000,
  certificateTransfer: 120000,
  certificateRetire: 100000,
  contractDeploy: 3000000,
} as const;

// Polling intervals (in milliseconds)
export const POLL_INTERVALS = {
  fast: 5000,
  normal: 15000,
  slow: 60000,
} as const;

// API rate limits
export const RATE_LIMITS = {
  rpc: {
    requestsPerSecond: 25,
    burstLimit: 50,
  },
  origin: {
    requestsPerMinute: 60,
  },
} as const;

// Wei conversion factors
export const WEI_UNITS = {
  wei: '1',
  kwei: '1000',
  mwei: '1000000',
  gwei: '1000000000',
  szabo: '1000000000000',
  finney: '1000000000000000',
  ether: '1000000000000000000',
  ewt: '1000000000000000000',
} as const;

// Error messages
export const ERROR_MESSAGES = {
  INVALID_ADDRESS: 'Invalid Ethereum address format',
  INVALID_PRIVATE_KEY: 'Invalid private key format',
  INSUFFICIENT_BALANCE: 'Insufficient balance for transaction',
  TRANSACTION_FAILED: 'Transaction failed',
  RPC_ERROR: 'RPC request failed',
  DID_NOT_FOUND: 'DID document not found',
  CERTIFICATE_NOT_FOUND: 'Certificate not found',
  ASSET_NOT_FOUND: 'Asset not found',
  INVALID_DID_FORMAT: 'Invalid DID format',
  CONTRACT_CALL_FAILED: 'Contract call failed',
  NETWORK_ERROR: 'Network connection error',
  INVALID_PARAMETERS: 'Invalid parameters provided',
} as const;

// Licensing notice
export const LICENSING_NOTICE = `[Velocity BPA Licensing Notice]

This n8n node is licensed under the Business Source License 1.1 (BSL 1.1).

Use of this node by for-profit organizations in production environments requires a commercial license from Velocity BPA.

For licensing information, visit https://velobpa.com/licensing or contact licensing@velobpa.com.`;
