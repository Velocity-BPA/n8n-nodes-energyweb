/*
 * Copyright (c) Velocity BPA, LLC
 * Licensed under the Business Source License 1.1
 * Commercial use requires a separate commercial license.
 * See LICENSE file for details.
 */

import type {
  IExecuteFunctions,
  INodeExecutionData,
  INodeType,
  INodeTypeDescription,
  IDataObject,
} from 'n8n-workflow';
import { NodeOperationError } from 'n8n-workflow';

import type { IEnergyWebCredentials, ResourceType } from './utils/types';

// Import all resource operations
import * as accounts from './actions/accounts/accounts';
import * as transactions from './actions/transactions/transactions';
import * as dids from './actions/dids/dids';
import * as origin from './actions/origin/origin';
import * as assets from './actions/assets/assets';
import * as smartContracts from './actions/smartContracts/smartContracts';
import * as tokens from './actions/tokens/tokens';
import * as network from './actions/network/network';
import * as events from './actions/events/events';
import * as utility from './actions/utility/utility';

// Licensing notice (non-blocking, informational only)
const LICENSING_NOTICE = `[Velocity BPA Licensing Notice]
This n8n node is licensed under the Business Source License 1.1 (BSL 1.1).
Use of this node by for-profit organizations in production environments requires a commercial license from Velocity BPA.
For licensing information, visit https://velobpa.com/licensing or contact licensing@velobpa.com.`;

let licensingNoticeShown = false;

export class EnergyWeb implements INodeType {
  description: INodeTypeDescription = {
    displayName: 'Energy Web',
    name: 'energyWeb',
    icon: 'file:energyweb.svg',
    group: ['transform'],
    version: 1,
    subtitle: '={{$parameter["operation"] + ": " + $parameter["resource"]}}',
    description:
      'Interact with Energy Web Chain - DIDs, RECs, assets, and smart contracts for the energy sector',
    defaults: {
      name: 'Energy Web',
    },
    inputs: ['main'],
    outputs: ['main'],
    credentials: [
      {
        name: 'energyWebApi',
        required: true,
      },
    ],
    properties: [
      // Resource selector
      {
        displayName: 'Resource',
        name: 'resource',
        type: 'options',
        noDataExpression: true,
        options: [
          { name: 'Accounts', value: 'accounts' },
          { name: 'Assets', value: 'assets' },
          { name: 'DIDs', value: 'dids' },
          { name: 'Events', value: 'events' },
          { name: 'Network', value: 'network' },
          { name: 'Origin (RECs)', value: 'origin' },
          { name: 'Smart Contracts', value: 'smartContracts' },
          { name: 'Tokens', value: 'tokens' },
          { name: 'Transactions', value: 'transactions' },
          { name: 'Utility', value: 'utility' },
        ],
        default: 'accounts',
      },

      // ==================== ACCOUNTS OPERATIONS ====================
      {
        displayName: 'Operation',
        name: 'operation',
        type: 'options',
        noDataExpression: true,
        displayOptions: { show: { resource: ['accounts'] } },
        options: [
          { name: 'Get Balance', value: 'getBalance', description: 'Get EWT balance for an address', action: 'Get balance' },
          { name: 'Get DID Document', value: 'getDIDDocument', description: 'Get decentralized identity document', action: 'Get DID document' },
          { name: 'Get Token Balances', value: 'getTokenBalances', description: 'Get token holdings for an address', action: 'Get token balances' },
          { name: 'Get Transaction History', value: 'getTransactionHistory', description: 'Get transaction history', action: 'Get transaction history' },
        ],
        default: 'getBalance',
      },

      // ==================== TRANSACTIONS OPERATIONS ====================
      {
        displayName: 'Operation',
        name: 'operation',
        type: 'options',
        noDataExpression: true,
        displayOptions: { show: { resource: ['transactions'] } },
        options: [
          { name: 'Estimate Gas', value: 'estimateGas', description: 'Estimate gas for a transaction', action: 'Estimate gas' },
          { name: 'Get Transaction', value: 'getTransaction', description: 'Get transaction details', action: 'Get transaction' },
          { name: 'Get Transaction Status', value: 'getTransactionStatus', description: 'Get confirmation status', action: 'Get transaction status' },
          { name: 'Send Transaction', value: 'sendTransaction', description: 'Submit a transaction', action: 'Send transaction' },
        ],
        default: 'getTransaction',
      },

      // ==================== DIDs OPERATIONS ====================
      {
        displayName: 'Operation',
        name: 'operation',
        type: 'options',
        noDataExpression: true,
        displayOptions: { show: { resource: ['dids'] } },
        options: [
          { name: 'Create DID', value: 'createDID', description: 'Create a new DID', action: 'Create DID' },
          { name: 'Get DID Claims', value: 'getDIDClaims', description: 'Get associated claims', action: 'Get DID claims' },
          { name: 'Get DID Document', value: 'getDIDDocument', description: 'Resolve DID to document', action: 'Get DID document' },
          { name: 'Issue Claim', value: 'issueClaim', description: 'Create verifiable credential', action: 'Issue claim' },
          { name: 'Revoke DID', value: 'revokeDID', description: 'Deactivate DID', action: 'Revoke DID' },
          { name: 'Update DID Document', value: 'updateDIDDocument', description: 'Modify DID document', action: 'Update DID document' },
          { name: 'Verify Claim', value: 'verifyClaim', description: 'Validate credential', action: 'Verify claim' },
        ],
        default: 'getDIDDocument',
      },

      // ==================== ORIGIN OPERATIONS ====================
      {
        displayName: 'Operation',
        name: 'operation',
        type: 'options',
        noDataExpression: true,
        displayOptions: { show: { resource: ['origin'] } },
        options: [
          { name: 'Get Certificate', value: 'getCertificate', description: 'Get REC details', action: 'Get certificate' },
          { name: 'Get Certificate History', value: 'getCertificateHistory', description: 'Get transfer history', action: 'Get certificate history' },
          { name: 'Get User Certificates', value: 'getUserCertificates', description: 'Get user holdings', action: 'Get user certificates' },
          { name: 'Issue Certificate', value: 'issueCertificate', description: 'Create new REC', action: 'Issue certificate' },
          { name: 'Retire Certificate', value: 'retireCertificate', description: 'Claim/retire REC', action: 'Retire certificate' },
          { name: 'Transfer Certificate', value: 'transferCertificate', description: 'Send REC to address', action: 'Transfer certificate' },
        ],
        default: 'getCertificate',
      },

      // ==================== ASSETS OPERATIONS ====================
      {
        displayName: 'Operation',
        name: 'operation',
        type: 'options',
        noDataExpression: true,
        displayOptions: { show: { resource: ['assets'] } },
        options: [
          { name: 'Get Asset History', value: 'getAssetHistory', description: 'Get asset activity', action: 'Get asset history' },
          { name: 'Get Asset Info', value: 'getAssetInfo', description: 'Get asset details', action: 'Get asset info' },
          { name: 'Link DID to Asset', value: 'linkDIDToAsset', description: 'Associate identity with asset', action: 'Link DID to asset' },
          { name: 'Register Asset', value: 'registerAsset', description: 'Register energy asset', action: 'Register asset' },
          { name: 'Update Asset', value: 'updateAsset', description: 'Modify asset info', action: 'Update asset' },
        ],
        default: 'getAssetInfo',
      },

      // ==================== SMART CONTRACTS OPERATIONS ====================
      {
        displayName: 'Operation',
        name: 'operation',
        type: 'options',
        noDataExpression: true,
        displayOptions: { show: { resource: ['smartContracts'] } },
        options: [
          { name: 'Deploy Contract', value: 'deployContract', description: 'Deploy new contract', action: 'Deploy contract' },
          { name: 'Get Contract Events', value: 'getContractEvents', description: 'Get event logs', action: 'Get contract events' },
          { name: 'Read Contract', value: 'readContract', description: 'Call view function', action: 'Read contract' },
          { name: 'Write Contract', value: 'writeContract', description: 'Send transaction to contract', action: 'Write contract' },
        ],
        default: 'readContract',
      },

      // ==================== TOKENS OPERATIONS ====================
      {
        displayName: 'Operation',
        name: 'operation',
        type: 'options',
        noDataExpression: true,
        displayOptions: { show: { resource: ['tokens'] } },
        options: [
          { name: 'Get Token Holders', value: 'getTokenHolders', description: 'Get holder list', action: 'Get token holders' },
          { name: 'Get Token Info', value: 'getTokenInfo', description: 'Get token details', action: 'Get token info' },
          { name: 'Transfer Token', value: 'transferToken', description: 'Send tokens', action: 'Transfer token' },
        ],
        default: 'getTokenInfo',
      },

      // ==================== NETWORK OPERATIONS ====================
      {
        displayName: 'Operation',
        name: 'operation',
        type: 'options',
        noDataExpression: true,
        displayOptions: { show: { resource: ['network'] } },
        options: [
          { name: 'Get Block', value: 'getBlock', description: 'Get block details', action: 'Get block' },
          { name: 'Get Gas Price', value: 'getGasPrice', description: 'Get current gas price', action: 'Get gas price' },
          { name: 'Get Network Status', value: 'getNetworkStatus', description: 'Get chain status', action: 'Get network status' },
          { name: 'Get Validators', value: 'getValidators', description: 'Get active validators', action: 'Get validators' },
        ],
        default: 'getNetworkStatus',
      },

      // ==================== EVENTS OPERATIONS ====================
      {
        displayName: 'Operation',
        name: 'operation',
        type: 'options',
        noDataExpression: true,
        displayOptions: { show: { resource: ['events'] } },
        options: [
          { name: 'Filter Events', value: 'filterEvents', description: 'Filter by topics', action: 'Filter events' },
          { name: 'Get Logs', value: 'getLogs', description: 'Get event logs with filters', action: 'Get logs' },
          { name: 'Subscribe to Events', value: 'subscribeToEvents', description: 'Create event subscription', action: 'Subscribe to events' },
        ],
        default: 'getLogs',
      },

      // ==================== UTILITY OPERATIONS ====================
      {
        displayName: 'Operation',
        name: 'operation',
        type: 'options',
        noDataExpression: true,
        displayOptions: { show: { resource: ['utility'] } },
        options: [
          { name: 'Convert Units', value: 'convertUnits', description: 'EWT/Wei conversion', action: 'Convert units' },
          { name: 'Encode DID', value: 'encodeDID', description: 'Format DID string', action: 'Encode DID' },
          { name: 'Get API Health', value: 'getAPIHealth', description: 'Check service status', action: 'Get API health' },
        ],
        default: 'convertUnits',
      },

      // ==================== COMMON PARAMETERS ====================
      // Address parameter (used by multiple operations)
      {
        displayName: 'Address',
        name: 'address',
        type: 'string',
        default: '',
        required: true,
        placeholder: '0x...',
        description: 'Ethereum address (0x...)',
        displayOptions: {
          show: {
            resource: ['accounts'],
            operation: ['getBalance', 'getTokenBalances', 'getTransactionHistory', 'getDIDDocument'],
          },
        },
      },
      {
        displayName: 'Address',
        name: 'address',
        type: 'string',
        default: '',
        required: true,
        placeholder: '0x...',
        description: 'Ethereum address (0x...)',
        displayOptions: {
          show: {
            resource: ['dids'],
            operation: ['createDID', 'getDIDDocument', 'getDIDClaims'],
          },
        },
      },
      {
        displayName: 'Address',
        name: 'address',
        type: 'string',
        default: '',
        required: true,
        placeholder: '0x...',
        description: 'Ethereum address (0x...)',
        displayOptions: {
          show: {
            resource: ['origin'],
            operation: ['getUserCertificates'],
          },
        },
      },
      {
        displayName: 'Address',
        name: 'address',
        type: 'string',
        default: '',
        required: true,
        placeholder: '0x...',
        description: 'Ethereum address to format as DID',
        displayOptions: {
          show: {
            resource: ['utility'],
            operation: ['encodeDID'],
          },
        },
      },

      // Transaction hash parameter
      {
        displayName: 'Transaction Hash',
        name: 'txHash',
        type: 'string',
        default: '',
        required: true,
        placeholder: '0x...',
        description: 'Transaction hash',
        displayOptions: {
          show: {
            resource: ['transactions'],
            operation: ['getTransaction', 'getTransactionStatus'],
          },
        },
      },

      // ==================== DID SPECIFIC PARAMETERS ====================
      {
        displayName: 'DID',
        name: 'did',
        type: 'string',
        default: '',
        required: true,
        placeholder: 'did:ethr:ewc:0x...',
        description: 'Decentralized Identifier',
        displayOptions: {
          show: {
            resource: ['dids'],
            operation: ['updateDIDDocument', 'revokeDID'],
          },
        },
      },
      {
        displayName: 'Attribute Name',
        name: 'attributeName',
        type: 'string',
        default: '',
        required: true,
        description: 'DID attribute name to set/update',
        displayOptions: {
          show: {
            resource: ['dids'],
            operation: ['updateDIDDocument'],
          },
        },
      },
      {
        displayName: 'Attribute Value',
        name: 'attributeValue',
        type: 'string',
        default: '',
        required: true,
        description: 'DID attribute value',
        displayOptions: {
          show: {
            resource: ['dids'],
            operation: ['updateDIDDocument'],
          },
        },
      },
      {
        displayName: 'Validity (Seconds)',
        name: 'validity',
        type: 'number',
        default: 86400,
        description: 'Attribute validity period in seconds',
        displayOptions: {
          show: {
            resource: ['dids'],
            operation: ['updateDIDDocument'],
          },
        },
      },

      // ==================== CLAIM PARAMETERS ====================
      {
        displayName: 'Subject DID',
        name: 'subjectDid',
        type: 'string',
        default: '',
        required: true,
        placeholder: 'did:ethr:ewc:0x...',
        description: 'DID of the claim subject',
        displayOptions: {
          show: {
            resource: ['dids'],
            operation: ['issueClaim'],
          },
        },
      },
      {
        displayName: 'Claim Type',
        name: 'claimType',
        type: 'string',
        default: '',
        required: true,
        description: 'Type of claim (e.g., EnergyProducer, AssetOwner)',
        displayOptions: {
          show: {
            resource: ['dids'],
            operation: ['issueClaim'],
          },
        },
      },
      {
        displayName: 'Claim Data',
        name: 'claimData',
        type: 'json',
        default: '{}',
        required: true,
        description: 'JSON data for the claim',
        displayOptions: {
          show: {
            resource: ['dids'],
            operation: ['issueClaim'],
          },
        },
      },
      {
        displayName: 'Credential',
        name: 'credential',
        type: 'json',
        default: '{}',
        required: true,
        description: 'Verifiable credential to verify',
        displayOptions: {
          show: {
            resource: ['dids'],
            operation: ['verifyClaim'],
          },
        },
      },

      // ==================== CERTIFICATE PARAMETERS ====================
      {
        displayName: 'Certificate ID',
        name: 'certificateId',
        type: 'string',
        default: '',
        required: true,
        description: 'REC certificate ID',
        displayOptions: {
          show: {
            resource: ['origin'],
            operation: ['getCertificate', 'getCertificateHistory', 'transferCertificate', 'retireCertificate'],
          },
        },
      },
      {
        displayName: 'Device ID',
        name: 'deviceId',
        type: 'string',
        default: '',
        required: true,
        description: 'Generating device ID',
        displayOptions: {
          show: {
            resource: ['origin'],
            operation: ['issueCertificate'],
          },
        },
      },
      {
        displayName: 'Energy (Wh)',
        name: 'energy',
        type: 'number',
        default: 0,
        required: true,
        description: 'Energy amount in watt-hours',
        displayOptions: {
          show: {
            resource: ['origin'],
            operation: ['issueCertificate'],
          },
        },
      },
      {
        displayName: 'Generation Start Time',
        name: 'generationStartTime',
        type: 'dateTime',
        default: '',
        required: true,
        description: 'Start of generation period',
        displayOptions: {
          show: {
            resource: ['origin'],
            operation: ['issueCertificate'],
          },
        },
      },
      {
        displayName: 'Generation End Time',
        name: 'generationEndTime',
        type: 'dateTime',
        default: '',
        required: true,
        description: 'End of generation period',
        displayOptions: {
          show: {
            resource: ['origin'],
            operation: ['issueCertificate'],
          },
        },
      },
      {
        displayName: 'Recipient Address',
        name: 'recipientAddress',
        type: 'string',
        default: '',
        required: true,
        placeholder: '0x...',
        description: 'Address to receive the certificate',
        displayOptions: {
          show: {
            resource: ['origin'],
            operation: ['transferCertificate'],
          },
        },
      },
      {
        displayName: 'Amount',
        name: 'amount',
        type: 'number',
        default: 0,
        description: 'Amount to transfer (0 for full certificate)',
        displayOptions: {
          show: {
            resource: ['origin'],
            operation: ['transferCertificate'],
          },
        },
      },
      {
        displayName: 'Claim Data',
        name: 'claimData',
        type: 'json',
        default: '{}',
        description: 'Retirement claim data (beneficiary, purpose, etc.)',
        displayOptions: {
          show: {
            resource: ['origin'],
            operation: ['retireCertificate'],
          },
        },
      },

      // ==================== ASSET PARAMETERS ====================
      {
        displayName: 'Asset ID',
        name: 'assetId',
        type: 'string',
        default: '',
        required: true,
        description: 'Energy asset ID',
        displayOptions: {
          show: {
            resource: ['assets'],
            operation: ['getAssetInfo', 'getAssetHistory', 'updateAsset', 'linkDIDToAsset'],
          },
        },
      },
      {
        displayName: 'Asset Type',
        name: 'assetType',
        type: 'options',
        options: [
          { name: 'Solar', value: 'solar' },
          { name: 'Wind', value: 'wind' },
          { name: 'Hydro', value: 'hydro' },
          { name: 'Biomass', value: 'biomass' },
          { name: 'Storage', value: 'storage' },
          { name: 'Other', value: 'other' },
        ],
        default: 'solar',
        required: true,
        displayOptions: {
          show: {
            resource: ['assets'],
            operation: ['registerAsset'],
          },
        },
      },
      {
        displayName: 'Capacity (kW)',
        name: 'capacity',
        type: 'number',
        default: 0,
        required: true,
        description: 'Asset capacity in kilowatts',
        displayOptions: {
          show: {
            resource: ['assets'],
            operation: ['registerAsset'],
          },
        },
      },
      {
        displayName: 'Country',
        name: 'country',
        type: 'string',
        default: '',
        required: true,
        description: 'Country code (ISO 3166-1 alpha-2)',
        displayOptions: {
          show: {
            resource: ['assets'],
            operation: ['registerAsset'],
          },
        },
      },
      {
        displayName: 'Grid Operator',
        name: 'gridOperator',
        type: 'string',
        default: '',
        description: 'Grid operator name',
        displayOptions: {
          show: {
            resource: ['assets'],
            operation: ['registerAsset'],
          },
        },
      },
      {
        displayName: 'DID',
        name: 'did',
        type: 'string',
        default: '',
        required: true,
        placeholder: 'did:ethr:ewc:0x...',
        description: 'DID to link to asset',
        displayOptions: {
          show: {
            resource: ['assets'],
            operation: ['linkDIDToAsset'],
          },
        },
      },
      {
        displayName: 'Update Data',
        name: 'updateData',
        type: 'json',
        default: '{}',
        description: 'Asset fields to update',
        displayOptions: {
          show: {
            resource: ['assets'],
            operation: ['updateAsset'],
          },
        },
      },

      // ==================== SMART CONTRACT PARAMETERS ====================
      {
        displayName: 'Contract Address',
        name: 'contractAddress',
        type: 'string',
        default: '',
        required: true,
        placeholder: '0x...',
        description: 'Smart contract address',
        displayOptions: {
          show: {
            resource: ['smartContracts'],
            operation: ['readContract', 'writeContract', 'getContractEvents'],
          },
        },
      },
      {
        displayName: 'Contract Address',
        name: 'contractAddress',
        type: 'string',
        default: '',
        placeholder: '0x...',
        description: 'Contract address to filter events (optional)',
        displayOptions: {
          show: {
            resource: ['events'],
            operation: ['getLogs', 'filterEvents', 'subscribeToEvents'],
          },
        },
      },
      {
        displayName: 'Function Name',
        name: 'functionName',
        type: 'string',
        default: '',
        required: true,
        description: 'Contract function name',
        displayOptions: {
          show: {
            resource: ['smartContracts'],
            operation: ['readContract', 'writeContract'],
          },
        },
      },
      {
        displayName: 'Function Parameters',
        name: 'functionParams',
        type: 'json',
        default: '[]',
        description: 'Function parameters as JSON array',
        displayOptions: {
          show: {
            resource: ['smartContracts'],
            operation: ['readContract', 'writeContract'],
          },
        },
      },
      {
        displayName: 'ABI',
        name: 'abi',
        type: 'json',
        default: '[]',
        description: 'Contract ABI (optional for common functions)',
        displayOptions: {
          show: {
            resource: ['smartContracts'],
            operation: ['readContract', 'writeContract', 'getContractEvents', 'deployContract'],
          },
        },
      },
      {
        displayName: 'Bytecode',
        name: 'bytecode',
        type: 'string',
        default: '',
        required: true,
        description: 'Contract bytecode to deploy',
        displayOptions: {
          show: {
            resource: ['smartContracts'],
            operation: ['deployContract'],
          },
        },
      },
      {
        displayName: 'Constructor Parameters',
        name: 'constructorParams',
        type: 'json',
        default: '[]',
        description: 'Constructor parameters as JSON array',
        displayOptions: {
          show: {
            resource: ['smartContracts'],
            operation: ['deployContract'],
          },
        },
      },
      {
        displayName: 'Event Name',
        name: 'eventName',
        type: 'string',
        default: '',
        description: 'Event name to filter',
        displayOptions: {
          show: {
            resource: ['smartContracts'],
            operation: ['getContractEvents'],
          },
        },
      },

      // ==================== TOKEN PARAMETERS ====================
      {
        displayName: 'Token Address',
        name: 'tokenAddress',
        type: 'string',
        default: '',
        required: true,
        placeholder: '0x...',
        description: 'ERC20 token contract address',
        displayOptions: {
          show: {
            resource: ['tokens'],
            operation: ['getTokenInfo', 'getTokenHolders', 'transferToken'],
          },
        },
      },
      {
        displayName: 'Recipient Address',
        name: 'recipientAddress',
        type: 'string',
        default: '',
        required: true,
        placeholder: '0x...',
        description: 'Address to receive tokens',
        displayOptions: {
          show: {
            resource: ['tokens'],
            operation: ['transferToken'],
          },
        },
      },
      {
        displayName: 'Amount',
        name: 'amount',
        type: 'string',
        default: '',
        required: true,
        description: 'Amount to transfer',
        displayOptions: {
          show: {
            resource: ['tokens'],
            operation: ['transferToken'],
          },
        },
      },

      // ==================== NETWORK PARAMETERS ====================
      {
        displayName: 'Block Number',
        name: 'blockNumber',
        type: 'string',
        default: 'latest',
        description: 'Block number or "latest"',
        displayOptions: {
          show: {
            resource: ['network'],
            operation: ['getBlock'],
          },
        },
      },
      {
        displayName: 'Include Transactions',
        name: 'includeTransactions',
        type: 'boolean',
        default: false,
        description: 'Whether to include full transaction objects',
        displayOptions: {
          show: {
            resource: ['network'],
            operation: ['getBlock'],
          },
        },
      },

      // ==================== EVENTS PARAMETERS ====================
      {
        displayName: 'From Block',
        name: 'fromBlock',
        type: 'string',
        default: 'latest',
        description: 'Starting block number or "latest"',
        displayOptions: {
          show: {
            resource: ['events'],
            operation: ['getLogs', 'filterEvents'],
          },
        },
      },
      {
        displayName: 'From Block',
        name: 'fromBlock',
        type: 'string',
        default: 'latest',
        description: 'Starting block number or "latest"',
        displayOptions: {
          show: {
            resource: ['smartContracts'],
            operation: ['getContractEvents'],
          },
        },
      },
      {
        displayName: 'To Block',
        name: 'toBlock',
        type: 'string',
        default: 'latest',
        description: 'Ending block number or "latest"',
        displayOptions: {
          show: {
            resource: ['events'],
            operation: ['getLogs', 'filterEvents'],
          },
        },
      },
      {
        displayName: 'To Block',
        name: 'toBlock',
        type: 'string',
        default: 'latest',
        description: 'Ending block number or "latest"',
        displayOptions: {
          show: {
            resource: ['smartContracts'],
            operation: ['getContractEvents'],
          },
        },
      },
      {
        displayName: 'Topics',
        name: 'topics',
        type: 'fixedCollection',
        typeOptions: { multipleValues: true },
        default: {},
        description: 'Event topics to filter',
        displayOptions: {
          show: {
            resource: ['events'],
            operation: ['getLogs', 'subscribeToEvents'],
          },
        },
        options: [
          {
            name: 'topicValues',
            displayName: 'Topic',
            values: [
              {
                displayName: 'Topic',
                name: 'topic',
                type: 'string',
                default: '',
                description: 'Topic hash (0x...)',
              },
            ],
          },
        ],
      },
      {
        displayName: 'Event Signature',
        name: 'eventSignature',
        type: 'string',
        default: '',
        description: 'Keccak256 hash of event signature',
        displayOptions: {
          show: {
            resource: ['events'],
            operation: ['filterEvents'],
          },
        },
      },
      {
        displayName: 'Topic 1',
        name: 'topic1',
        type: 'string',
        default: '',
        description: 'First indexed parameter',
        displayOptions: {
          show: {
            resource: ['events'],
            operation: ['filterEvents'],
          },
        },
      },
      {
        displayName: 'Topic 2',
        name: 'topic2',
        type: 'string',
        default: '',
        description: 'Second indexed parameter',
        displayOptions: {
          show: {
            resource: ['events'],
            operation: ['filterEvents'],
          },
        },
      },
      {
        displayName: 'Topic 3',
        name: 'topic3',
        type: 'string',
        default: '',
        description: 'Third indexed parameter',
        displayOptions: {
          show: {
            resource: ['events'],
            operation: ['filterEvents'],
          },
        },
      },

      // ==================== UTILITY PARAMETERS ====================
      {
        displayName: 'Amount',
        name: 'amount',
        type: 'string',
        default: '',
        required: true,
        description: 'Amount to convert',
        displayOptions: {
          show: {
            resource: ['utility'],
            operation: ['convertUnits'],
          },
        },
      },
      {
        displayName: 'From Unit',
        name: 'fromUnit',
        type: 'options',
        options: [
          { name: 'Wei', value: 'wei' },
          { name: 'Gwei', value: 'gwei' },
          { name: 'EWT', value: 'ewt' },
        ],
        default: 'ewt',
        required: true,
        displayOptions: {
          show: {
            resource: ['utility'],
            operation: ['convertUnits'],
          },
        },
      },
      {
        displayName: 'To Unit',
        name: 'toUnit',
        type: 'options',
        options: [
          { name: 'Wei', value: 'wei' },
          { name: 'Gwei', value: 'gwei' },
          { name: 'EWT', value: 'ewt' },
        ],
        default: 'wei',
        required: true,
        displayOptions: {
          show: {
            resource: ['utility'],
            operation: ['convertUnits'],
          },
        },
      },

      // ==================== TRANSACTION PARAMETERS ====================
      {
        displayName: 'To Address',
        name: 'toAddress',
        type: 'string',
        default: '',
        required: true,
        placeholder: '0x...',
        description: 'Recipient address',
        displayOptions: {
          show: {
            resource: ['transactions'],
            operation: ['sendTransaction', 'estimateGas'],
          },
        },
      },
      {
        displayName: 'Value (EWT)',
        name: 'value',
        type: 'string',
        default: '0',
        description: 'Amount of EWT to send',
        displayOptions: {
          show: {
            resource: ['transactions'],
            operation: ['sendTransaction', 'estimateGas'],
          },
        },
      },
      {
        displayName: 'Data',
        name: 'data',
        type: 'string',
        default: '0x',
        description: 'Transaction data (hex)',
        displayOptions: {
          show: {
            resource: ['transactions'],
            operation: ['sendTransaction', 'estimateGas'],
          },
        },
      },
      {
        displayName: 'Gas Limit',
        name: 'gasLimit',
        type: 'number',
        default: 21000,
        description: 'Gas limit for the transaction',
        displayOptions: {
          show: {
            resource: ['transactions'],
            operation: ['sendTransaction'],
          },
        },
      },

      // ==================== PAGINATION PARAMETERS ====================
      {
        displayName: 'Limit',
        name: 'limit',
        type: 'number',
        default: 10,
        description: 'Maximum number of results',
        displayOptions: {
          show: {
            resource: ['accounts'],
            operation: ['getTransactionHistory'],
          },
        },
      },
      {
        displayName: 'Limit',
        name: 'limit',
        type: 'number',
        default: 10,
        description: 'Maximum number of results',
        displayOptions: {
          show: {
            resource: ['tokens'],
            operation: ['getTokenHolders'],
          },
        },
      },
      {
        displayName: 'Offset',
        name: 'offset',
        type: 'number',
        default: 0,
        description: 'Number of results to skip',
        displayOptions: {
          show: {
            resource: ['accounts'],
            operation: ['getTransactionHistory'],
          },
        },
      },
    ],
  };

  async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
    // Show licensing notice once per node load (non-blocking)
    if (!licensingNoticeShown) {
      this.logger.warn(LICENSING_NOTICE);
      licensingNoticeShown = true;
    }

    const items = this.getInputData();
    const returnData: INodeExecutionData[] = [];
    const credentials = (await this.getCredentials('energyWebApi')) as unknown as IEnergyWebCredentials;
    const resource = this.getNodeParameter('resource', 0) as ResourceType;
    const operation = this.getNodeParameter('operation', 0) as string;

    for (let i = 0; i < items.length; i++) {
      try {
        let result: INodeExecutionData[] = [];

        // Execute the appropriate operation based on resource type
        if (resource === 'accounts') {
          switch (operation) {
            case 'getBalance':
              result = await accounts.getBalance.call(this, credentials, i);
              break;
            case 'getTokenBalances':
              result = await accounts.getTokenBalances.call(this, credentials, i);
              break;
            case 'getTransactionHistory':
              result = await accounts.getTransactionHistory.call(this, credentials, i);
              break;
            case 'getDIDDocument':
              result = await accounts.getDIDDocument.call(this, credentials, i);
              break;
            default:
              throw new NodeOperationError(this.getNode(), `Unknown accounts operation: ${operation}`, { itemIndex: i });
          }
        } else if (resource === 'transactions') {
          switch (operation) {
            case 'getTransaction':
              result = await transactions.getTransaction.call(this, credentials, i);
              break;
            case 'sendTransaction':
              result = await transactions.sendTransaction.call(this, credentials, i);
              break;
            case 'estimateGas':
              result = await transactions.estimateGas.call(this, credentials, i);
              break;
            case 'getTransactionStatus':
              result = await transactions.getTransactionStatus.call(this, credentials, i);
              break;
            default:
              throw new NodeOperationError(this.getNode(), `Unknown transactions operation: ${operation}`, { itemIndex: i });
          }
        } else if (resource === 'dids') {
          switch (operation) {
            case 'createDID':
              result = await dids.createDID.call(this, credentials, i);
              break;
            case 'getDIDDocument':
              result = await dids.getDIDDocument.call(this, credentials, i);
              break;
            case 'updateDIDDocument':
              result = await dids.updateDIDDocument.call(this, credentials, i);
              break;
            case 'revokeDID':
              result = await dids.revokeDID.call(this, credentials, i);
              break;
            case 'getDIDClaims':
              result = await dids.getDIDClaims.call(this, credentials, i);
              break;
            case 'issueClaim':
              result = await dids.issueClaim.call(this, credentials, i);
              break;
            case 'verifyClaim':
              result = await dids.verifyClaim.call(this, credentials, i);
              break;
            default:
              throw new NodeOperationError(this.getNode(), `Unknown DIDs operation: ${operation}`, { itemIndex: i });
          }
        } else if (resource === 'origin') {
          switch (operation) {
            case 'getCertificate':
              result = await origin.getCertificate.call(this, credentials, i);
              break;
            case 'issueCertificate':
              result = await origin.issueCertificate.call(this, credentials, i);
              break;
            case 'transferCertificate':
              result = await origin.transferCertificate.call(this, credentials, i);
              break;
            case 'retireCertificate':
              result = await origin.retireCertificate.call(this, credentials, i);
              break;
            case 'getCertificateHistory':
              result = await origin.getCertificateHistory.call(this, credentials, i);
              break;
            case 'getUserCertificates':
              result = await origin.getUserCertificates.call(this, credentials, i);
              break;
            default:
              throw new NodeOperationError(this.getNode(), `Unknown Origin operation: ${operation}`, { itemIndex: i });
          }
        } else if (resource === 'assets') {
          switch (operation) {
            case 'registerAsset':
              result = await assets.registerAsset.call(this, credentials, i);
              break;
            case 'getAssetInfo':
              result = await assets.getAssetInfo.call(this, credentials, i);
              break;
            case 'updateAsset':
              result = await assets.updateAsset.call(this, credentials, i);
              break;
            case 'getAssetHistory':
              result = await assets.getAssetHistory.call(this, credentials, i);
              break;
            case 'linkDIDToAsset':
              result = await assets.linkDIDToAsset.call(this, credentials, i);
              break;
            default:
              throw new NodeOperationError(this.getNode(), `Unknown Assets operation: ${operation}`, { itemIndex: i });
          }
        } else if (resource === 'smartContracts') {
          switch (operation) {
            case 'readContract':
              result = await smartContracts.readContract.call(this, credentials, i);
              break;
            case 'writeContract':
              result = await smartContracts.writeContract.call(this, credentials, i);
              break;
            case 'getContractEvents':
              result = await smartContracts.getContractEvents.call(this, credentials, i);
              break;
            case 'deployContract':
              result = await smartContracts.deployContract.call(this, credentials, i);
              break;
            default:
              throw new NodeOperationError(this.getNode(), `Unknown Smart Contracts operation: ${operation}`, { itemIndex: i });
          }
        } else if (resource === 'tokens') {
          switch (operation) {
            case 'getTokenInfo':
              result = await tokens.getTokenInfo.call(this, credentials, i);
              break;
            case 'getTokenHolders':
              result = await tokens.getTokenHolders.call(this, credentials, i);
              break;
            case 'transferToken':
              result = await tokens.transferToken.call(this, credentials, i);
              break;
            default:
              throw new NodeOperationError(this.getNode(), `Unknown Tokens operation: ${operation}`, { itemIndex: i });
          }
        } else if (resource === 'network') {
          switch (operation) {
            case 'getNetworkStatus':
              result = await network.getNetworkStatus.call(this, credentials, i);
              break;
            case 'getGasPrice':
              result = await network.getGasPrice.call(this, credentials, i);
              break;
            case 'getValidators':
              result = await network.getValidators.call(this, credentials, i);
              break;
            case 'getBlock':
              result = await network.getBlock.call(this, credentials, i);
              break;
            default:
              throw new NodeOperationError(this.getNode(), `Unknown Network operation: ${operation}`, { itemIndex: i });
          }
        } else if (resource === 'events') {
          switch (operation) {
            case 'getLogs':
              result = await events.getLogs.call(this, credentials, i);
              break;
            case 'filterEvents':
              result = await events.filterEvents.call(this, credentials, i);
              break;
            case 'subscribeToEvents':
              result = await events.subscribeToEvents.call(this, credentials, i);
              break;
            default:
              throw new NodeOperationError(this.getNode(), `Unknown Events operation: ${operation}`, { itemIndex: i });
          }
        } else if (resource === 'utility') {
          switch (operation) {
            case 'convertUnits':
              result = await utility.convertUnits.call(this, credentials, i);
              break;
            case 'encodeDID':
              result = await utility.encodeDID.call(this, credentials, i);
              break;
            case 'getAPIHealth':
              result = await utility.getAPIHealth.call(this, credentials, i);
              break;
            default:
              throw new NodeOperationError(this.getNode(), `Unknown Utility operation: ${operation}`, { itemIndex: i });
          }
        } else {
          throw new NodeOperationError(this.getNode(), `Unknown resource: ${resource}`, { itemIndex: i });
        }

        returnData.push(...result);
      } catch (error) {
        if (this.continueOnFail()) {
          returnData.push({
            json: {
              error: error instanceof Error ? error.message : String(error),
            } as IDataObject,
            pairedItem: { item: i },
          });
          continue;
        }
        throw error;
      }
    }

    return [returnData];
  }
}
