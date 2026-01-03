/*
 * Copyright (c) Velocity BPA, LLC
 * Licensed under the Business Source License 1.1
 * Commercial use requires a separate commercial license.
 * See LICENSE file for details.
 */

import type {
  IAuthenticateGeneric,
  ICredentialTestRequest,
  ICredentialType,
  INodeProperties,
} from 'n8n-workflow';

export class EnergyWebApi implements ICredentialType {
  name = 'energyWebApi';
  displayName = 'Energy Web API';
  documentationUrl = 'https://docs.energyweb.org/';
  properties: INodeProperties[] = [
    {
      displayName: 'Network',
      name: 'network',
      type: 'options',
      options: [
        {
          name: 'Energy Web Chain (Mainnet)',
          value: 'mainnet',
        },
        {
          name: 'Volta (Testnet)',
          value: 'volta',
        },
        {
          name: 'Custom',
          value: 'custom',
        },
      ],
      default: 'mainnet',
      description: 'Select the Energy Web network to connect to',
    },
    {
      displayName: 'Custom RPC Endpoint',
      name: 'customRpcEndpoint',
      type: 'string',
      default: '',
      placeholder: 'https://your-custom-rpc.example.com',
      description: 'Custom RPC endpoint URL (only used when Network is set to Custom)',
      displayOptions: {
        show: {
          network: ['custom'],
        },
      },
    },
    {
      displayName: 'Private Key',
      name: 'privateKey',
      type: 'string',
      typeOptions: {
        password: true,
      },
      default: '',
      placeholder: '0x...',
      description:
        'Private key for signing transactions. Required for write operations. Keep this secure!',
    },
    {
      displayName: 'EW Scan API Key',
      name: 'ewScanApiKey',
      type: 'string',
      typeOptions: {
        password: true,
      },
      default: '',
      description: 'Optional API key for Energy Web Explorer (EW Scan) enhanced features',
    },
    {
      displayName: 'Origin API URL',
      name: 'originApiUrl',
      type: 'string',
      default: 'https://origin.energyweb.org/api',
      description: 'URL for the Origin platform API (REC management)',
    },
    {
      displayName: 'DID Registry Address',
      name: 'didRegistryAddress',
      type: 'string',
      default: '0xc15d5a57a8eb0e1dcbe5d88b8f9a82017e5cc4af',
      description: 'Address of the DID Registry smart contract',
    },
  ];

  authenticate: IAuthenticateGeneric = {
    type: 'generic',
    properties: {},
  };

  test: ICredentialTestRequest = {
    request: {
      baseURL: '={{$credentials.network === "mainnet" ? "https://rpc.energyweb.org" : $credentials.network === "volta" ? "https://volta-rpc.energyweb.org" : $credentials.customRpcEndpoint}}',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        method: 'eth_chainId',
        params: [],
        id: 1,
      }),
    },
  };
}
