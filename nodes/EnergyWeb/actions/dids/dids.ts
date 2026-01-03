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
  isValidDID,
  encodeDID,
  decodeDID,
  hexToNumber,
  numberToHex,
} from '../../utils/helpers';
import { ERROR_MESSAGES, GAS_LIMITS } from '../../constants/constants';
import type {
  IEnergyWebCredentials,
  IDIDDocument,
  IDIDClaim,
  IVerifiableCredential,
  NetworkType,
} from '../../utils/types';

/**
 * Create a new DID
 */
export async function createDID(
  this: IExecuteFunctions,
  credentials: IEnergyWebCredentials,
  index: number,
): Promise<INodeExecutionData[]> {
  const address = this.getNodeParameter('address', index) as string;
  const serviceEndpoints = this.getNodeParameter('serviceEndpoints', index, []) as Array<{
    type: string;
    endpoint: string;
  }>;

  if (!isValidAddress(address)) {
    throw new NodeOperationError(this.getNode(), ERROR_MESSAGES.INVALID_ADDRESS, {
      itemIndex: index,
    });
  }

  const network = (credentials.network || 'mainnet') as NetworkType;
  const { did } = encodeDID(address, network);
  const didRegistryAddress =
    credentials.didRegistryAddress || '0xc15d5a57a8eb0e1dcbe5d88b8f9a82017e5cc4af';

  // Check if DID already exists by querying changed block
  const changedData = '0xf96d0f9f' + address.slice(2).padStart(64, '0');
  const changedResult = (await executeRpcRequest.call(this, credentials, 'eth_call', [
    { to: didRegistryAddress, data: changedData },
    'latest',
  ])) as string;

  const changedBlock = hexToNumber(changedResult);

  // Build DID document
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
    service: serviceEndpoints.map((ep, i) => ({
      id: `${did}#service-${i + 1}`,
      type: ep.type,
      serviceEndpoint: ep.endpoint,
    })),
    created: new Date().toISOString(),
  };

  // If service endpoints need to be set on-chain, prepare the transaction
  if (serviceEndpoints.length > 0 && credentials.privateKey) {
    // setAttribute would be called here with signed transaction
    return [
      {
        json: {
          did,
          address,
          document: didDocument,
          alreadyExists: changedBlock > 0,
          message:
            'DID created. Service endpoints require on-chain setAttribute transaction.',
          gasEstimate: GAS_LIMITS.didCreate,
        } as unknown as IDataObject,
      },
    ];
  }

  return [
    {
      json: {
        did,
        address,
        document: didDocument,
        alreadyExists: changedBlock > 0,
        message: changedBlock > 0 ? 'DID already exists on-chain' : 'DID created (off-chain)',
      } as unknown as IDataObject,
    },
  ];
}

/**
 * Get DID document
 */
export async function getDIDDocument(
  this: IExecuteFunctions,
  credentials: IEnergyWebCredentials,
  index: number,
): Promise<INodeExecutionData[]> {
  const didInput = this.getNodeParameter('did', index) as string;

  let address: string;
  let did: string;

  if (isValidDID(didInput)) {
    const decoded = decodeDID(didInput);
    address = decoded.address;
    did = didInput;
  } else if (isValidAddress(didInput)) {
    address = didInput;
    const network = (credentials.network || 'mainnet') as NetworkType;
    did = encodeDID(address, network).did;
  } else {
    throw new NodeOperationError(this.getNode(), ERROR_MESSAGES.INVALID_DID_FORMAT, {
      itemIndex: index,
    });
  }

  const didRegistryAddress =
    credentials.didRegistryAddress || '0xc15d5a57a8eb0e1dcbe5d88b8f9a82017e5cc4af';

  // Get identity owner
  const ownerData = '0x8733d4e8' + address.slice(2).padStart(64, '0');
  const ownerResult = (await executeRpcRequest.call(this, credentials, 'eth_call', [
    { to: didRegistryAddress, data: ownerData },
    'latest',
  ])) as string;

  const owner = '0x' + ownerResult.slice(-40);

  // Get changed block
  const changedData = '0xf96d0f9f' + address.slice(2).padStart(64, '0');
  const changedResult = (await executeRpcRequest.call(this, credentials, 'eth_call', [
    { to: didRegistryAddress, data: changedData },
    'latest',
  ])) as string;

  const changedBlock = hexToNumber(changedResult);
  const network = (credentials.network || 'mainnet') as NetworkType;

  // Build DID document
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

  // Add delegate/owner if different from identity
  if (owner.toLowerCase() !== address.toLowerCase()) {
    didDocument.verificationMethod?.push({
      id: `${did}#delegate`,
      type: 'EcdsaSecp256k1RecoveryMethod2020',
      controller: did,
      blockchainAccountId: `eip155:${network === 'volta' ? '73799' : '246'}:${owner}`,
    });
  }

  return [
    {
      json: {
        did,
        address,
        owner,
        changedBlock,
        document: didDocument,
        exists: changedBlock > 0,
      } as unknown as IDataObject,
    },
  ];
}

/**
 * Update DID document
 */
export async function updateDIDDocument(
  this: IExecuteFunctions,
  credentials: IEnergyWebCredentials,
  index: number,
): Promise<INodeExecutionData[]> {
  const didInput = this.getNodeParameter('did', index) as string;
  const attributeName = this.getNodeParameter('attributeName', index) as string;
  const attributeValue = this.getNodeParameter('attributeValue', index) as string;
  const validity = this.getNodeParameter('validity', index, 86400) as number; // Default 1 day

  let address: string;

  if (isValidDID(didInput)) {
    const decoded = decodeDID(didInput);
    address = decoded.address;
  } else if (isValidAddress(didInput)) {
    address = didInput;
  } else {
    throw new NodeOperationError(this.getNode(), ERROR_MESSAGES.INVALID_DID_FORMAT, {
      itemIndex: index,
    });
  }

  if (!credentials.privateKey) {
    throw new NodeOperationError(
      this.getNode(),
      'Private key is required for updating DID documents',
      { itemIndex: index },
    );
  }

  const didRegistryAddress =
    credentials.didRegistryAddress || '0xc15d5a57a8eb0e1dcbe5d88b8f9a82017e5cc4af';

  // Encode attribute name as bytes32
  const nameHex = Buffer.from(attributeName).toString('hex').padEnd(64, '0');
  // Encode attribute value as bytes
  const valueHex = Buffer.from(attributeValue).toString('hex');

  // Build setAttribute call data
  // setAttribute(address identity, bytes32 name, bytes value, uint256 validity)
  const functionSelector = '0x7ad4b0a4';
  const data =
    functionSelector +
    address.slice(2).padStart(64, '0') +
    nameHex +
    '80'.padStart(64, '0') + // offset to value bytes
    numberToHex(validity).slice(2).padStart(64, '0') +
    numberToHex(valueHex.length / 2)
      .slice(2)
      .padStart(64, '0') +
    valueHex.padEnd(Math.ceil(valueHex.length / 64) * 64, '0');

  return [
    {
      json: {
        did: isValidDID(didInput) ? didInput : encodeDID(address, credentials.network as NetworkType).did,
        address,
        attributeName,
        attributeValue,
        validity,
        transaction: {
          to: didRegistryAddress,
          data,
          gasEstimate: GAS_LIMITS.didUpdate,
        },
        message: 'Transaction prepared. Sign and send via eth_sendRawTransaction.',
      } as IDataObject,
    },
  ];
}

/**
 * Revoke DID
 */
export async function revokeDID(
  this: IExecuteFunctions,
  credentials: IEnergyWebCredentials,
  index: number,
): Promise<INodeExecutionData[]> {
  const didInput = this.getNodeParameter('did', index) as string;
  const attributeName = this.getNodeParameter('attributeName', index, '') as string;

  let address: string;

  if (isValidDID(didInput)) {
    const decoded = decodeDID(didInput);
    address = decoded.address;
  } else if (isValidAddress(didInput)) {
    address = didInput;
  } else {
    throw new NodeOperationError(this.getNode(), ERROR_MESSAGES.INVALID_DID_FORMAT, {
      itemIndex: index,
    });
  }

  if (!credentials.privateKey) {
    throw new NodeOperationError(this.getNode(), 'Private key is required for revoking DIDs', {
      itemIndex: index,
    });
  }

  const didRegistryAddress =
    credentials.didRegistryAddress || '0xc15d5a57a8eb0e1dcbe5d88b8f9a82017e5cc4af';

  if (attributeName) {
    // Revoke specific attribute
    const nameHex = Buffer.from(attributeName).toString('hex').padEnd(64, '0');
    const functionSelector = '0x00c023da'; // revokeAttribute
    const data =
      functionSelector +
      address.slice(2).padStart(64, '0') +
      nameHex +
      '60'.padStart(64, '0') + // offset
      '0'.padStart(64, '0'); // empty value

    return [
      {
        json: {
          did: isValidDID(didInput) ? didInput : encodeDID(address, credentials.network as NetworkType).did,
          address,
          action: 'revokeAttribute',
          attributeName,
          transaction: {
            to: didRegistryAddress,
            data,
            gasEstimate: GAS_LIMITS.didRevoke,
          },
          message: 'Attribute revocation transaction prepared.',
        } as IDataObject,
      },
    ];
  }

  // Full DID deactivation by changing owner to zero address
  const functionSelector = '0xf00d4b5d'; // changeOwner
  const zeroAddress = '0x0000000000000000000000000000000000000000';
  const data =
    functionSelector +
    address.slice(2).padStart(64, '0') +
    zeroAddress.slice(2).padStart(64, '0');

  return [
    {
      json: {
        did: isValidDID(didInput) ? didInput : encodeDID(address, credentials.network as NetworkType).did,
        address,
        action: 'deactivate',
        transaction: {
          to: didRegistryAddress,
          data,
          gasEstimate: GAS_LIMITS.didRevoke,
        },
        message: 'DID deactivation transaction prepared. This is irreversible.',
        warning: 'Setting owner to zero address will permanently deactivate this DID.',
      } as IDataObject,
    },
  ];
}

/**
 * Get DID claims
 */
export async function getDIDClaims(
  this: IExecuteFunctions,
  credentials: IEnergyWebCredentials,
  index: number,
): Promise<INodeExecutionData[]> {
  const didInput = this.getNodeParameter('did', index) as string;

  let address: string;
  let did: string;

  if (isValidDID(didInput)) {
    const decoded = decodeDID(didInput);
    address = decoded.address;
    did = didInput;
  } else if (isValidAddress(didInput)) {
    address = didInput;
    const network = (credentials.network || 'mainnet') as NetworkType;
    did = encodeDID(address, network).did;
  } else {
    throw new NodeOperationError(this.getNode(), ERROR_MESSAGES.INVALID_DID_FORMAT, {
      itemIndex: index,
    });
  }

  // Query DID Registry for attribute change events
  const didRegistryAddress =
    credentials.didRegistryAddress || '0xc15d5a57a8eb0e1dcbe5d88b8f9a82017e5cc4af';

  // DIDAttributeChanged event signature
  const eventTopic = '0x18ab6b2ae3d64571f55c37cad9c99caa4b7ac4a0b9b762b91aff50a08b7cf21f';

  const logs = (await executeRpcRequest.call(this, credentials, 'eth_getLogs', [
    {
      address: didRegistryAddress,
      topics: [eventTopic, '0x' + address.slice(2).padStart(64, '0')],
      fromBlock: '0x0',
      toBlock: 'latest',
    },
  ])) as Array<{
    data: string;
    topics: string[];
    blockNumber: string;
    transactionHash: string;
  }>;

  // Parse claims from logs
  const claims: IDIDClaim[] = logs.map((log, i) => ({
    id: `${did}#claim-${i + 1}`,
    subject: did,
    issuer: did,
    claimType: 'attribute',
    claimData: {
      raw: log.data,
      blockNumber: hexToNumber(log.blockNumber),
      transactionHash: log.transactionHash,
    },
    issuanceDate: new Date().toISOString(),
  }));

  return [
    {
      json: {
        did,
        address,
        claims,
        totalClaims: claims.length,
      } as unknown as IDataObject,
    },
  ];
}

/**
 * Issue a verifiable claim
 */
export async function issueClaim(
  this: IExecuteFunctions,
  credentials: IEnergyWebCredentials,
  index: number,
): Promise<INodeExecutionData[]> {
  const subjectDid = this.getNodeParameter('subjectDid', index) as string;
  const claimType = this.getNodeParameter('claimType', index) as string;
  const claimData = this.getNodeParameter('claimData', index, {}) as IDataObject;
  const expirationDate = this.getNodeParameter('expirationDate', index, '') as string;

  if (!isValidDID(subjectDid) && !isValidAddress(subjectDid)) {
    throw new NodeOperationError(this.getNode(), ERROR_MESSAGES.INVALID_DID_FORMAT, {
      itemIndex: index,
    });
  }

  if (!credentials.privateKey) {
    throw new NodeOperationError(this.getNode(), 'Private key is required for issuing claims', {
      itemIndex: index,
    });
  }

  const network = (credentials.network || 'mainnet') as NetworkType;
  const issuerAddress = this.getNodeParameter('issuerAddress', index, '') as string;

  if (!issuerAddress || !isValidAddress(issuerAddress)) {
    throw new NodeOperationError(this.getNode(), 'Valid issuer address is required', {
      itemIndex: index,
    });
  }

  const issuerDid = encodeDID(issuerAddress, network).did;
  const subjectDidFormatted = isValidDID(subjectDid)
    ? subjectDid
    : encodeDID(subjectDid, network).did;

  const credential: IVerifiableCredential = {
    '@context': [
      'https://www.w3.org/2018/credentials/v1',
      'https://www.w3.org/2018/credentials/examples/v1',
    ],
    id: `urn:uuid:${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    type: ['VerifiableCredential', claimType],
    issuer: issuerDid,
    issuanceDate: new Date().toISOString(),
    credentialSubject: {
      id: subjectDidFormatted,
      ...claimData,
    },
  };

  if (expirationDate) {
    credential.expirationDate = expirationDate;
  }

  return [
    {
      json: {
        credential,
        message:
          'Verifiable credential created. Sign with issuer private key for on-chain registration.',
        gasEstimate: GAS_LIMITS.claimIssue,
      } as unknown as IDataObject,
    },
  ];
}

/**
 * Verify a claim
 */
export async function verifyClaim(
  this: IExecuteFunctions,
  credentials: IEnergyWebCredentials,
  index: number,
): Promise<INodeExecutionData[]> {
  const credentialJson = this.getNodeParameter('credential', index) as string;

  let credential: IVerifiableCredential;
  try {
    credential = JSON.parse(credentialJson);
  } catch {
    throw new NodeOperationError(this.getNode(), 'Invalid credential JSON', { itemIndex: index });
  }

  // Basic structure validation
  const validationResults = {
    hasContext: Array.isArray(credential['@context']) && credential['@context'].length > 0,
    hasId: !!credential.id,
    hasType: Array.isArray(credential.type) && credential.type.includes('VerifiableCredential'),
    hasIssuer: !!credential.issuer,
    hasIssuanceDate: !!credential.issuanceDate,
    hasCredentialSubject:
      !!credential.credentialSubject && !!credential.credentialSubject.id,
    isNotExpired: !credential.expirationDate || new Date(credential.expirationDate) > new Date(),
  };

  const isValid = Object.values(validationResults).every((v) => v === true);

  // If issuer is a DID, verify it exists on-chain
  let issuerVerified = false;
  if (credential.issuer && isValidDID(credential.issuer)) {
    const decoded = decodeDID(credential.issuer);
    const didRegistryAddress =
      credentials.didRegistryAddress || '0xc15d5a57a8eb0e1dcbe5d88b8f9a82017e5cc4af';

    const changedData = '0xf96d0f9f' + decoded.address.slice(2).padStart(64, '0');
    const changedResult = (await executeRpcRequest.call(this, credentials, 'eth_call', [
      { to: didRegistryAddress, data: changedData },
      'latest',
    ])) as string;

    issuerVerified = hexToNumber(changedResult) > 0;
  }

  return [
    {
      json: {
        isValid,
        issuerVerified,
        validationResults,
        credential,
        verifiedAt: new Date().toISOString(),
        note: 'Full cryptographic verification requires proof validation',
      } as unknown as IDataObject,
    },
  ];
}
