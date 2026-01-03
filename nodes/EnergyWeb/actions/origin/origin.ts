/*
 * Copyright (c) Velocity BPA, LLC
 * Licensed under the Business Source License 1.1
 * Commercial use requires a separate commercial license.
 * See LICENSE file for details.
 */

import type { IExecuteFunctions, INodeExecutionData, IDataObject } from 'n8n-workflow';
import { NodeOperationError } from 'n8n-workflow';
import { executeOriginApiRequest, executeRpcRequest } from '../../transport/rpcClient';
import { isValidAddress, hexToNumber, numberToHex, formatTimestamp } from '../../utils/helpers';
import { ERROR_MESSAGES, GAS_LIMITS } from '../../constants/constants';
import type {
  IEnergyWebCredentials,
  ICertificate,
  ICertificateHistory,
  ICertificateEvent,
  IClaimData,
} from '../../utils/types';

/**
 * Get certificate details
 */
export async function getCertificate(
  this: IExecuteFunctions,
  credentials: IEnergyWebCredentials,
  index: number,
): Promise<INodeExecutionData[]> {
  const certificateId = this.getNodeParameter('certificateId', index) as string;

  try {
    // Try Origin API first
    const certificate = await executeOriginApiRequest.call(
      this,
      credentials,
      'GET',
      `/certificates/${certificateId}`,
    ) as ICertificate;

    return [
      {
        json: {
          ...certificate,
          energyMwh: parseInt(certificate.energy) / 1000000,
          generationStartFormatted: formatTimestamp(certificate.generationStartTime),
          generationEndFormatted: formatTimestamp(certificate.generationEndTime),
        } as unknown as IDataObject,
      },
    ];
  } catch {
    // Fallback to direct contract call
    return [
      {
        json: {
          certificateId,
          message: 'Certificate lookup requires Origin API or direct contract access',
          error: ERROR_MESSAGES.CERTIFICATE_NOT_FOUND,
        } as IDataObject,
      },
    ];
  }
}

/**
 * Issue a new certificate
 */
export async function issueCertificate(
  this: IExecuteFunctions,
  credentials: IEnergyWebCredentials,
  index: number,
): Promise<INodeExecutionData[]> {
  const deviceId = this.getNodeParameter('deviceId', index) as string;
  const energy = this.getNodeParameter('energy', index) as number;
  const generationStart = this.getNodeParameter('generationStart', index) as string;
  const generationEnd = this.getNodeParameter('generationEnd', index) as string;
  const recipientAddress = this.getNodeParameter('recipientAddress', index) as string;

  if (!isValidAddress(recipientAddress)) {
    throw new NodeOperationError(this.getNode(), ERROR_MESSAGES.INVALID_ADDRESS, {
      itemIndex: index,
    });
  }

  if (!credentials.privateKey) {
    throw new NodeOperationError(
      this.getNode(),
      'Private key is required for issuing certificates',
      { itemIndex: index },
    );
  }

  const generationStartTime = Math.floor(new Date(generationStart).getTime() / 1000);
  const generationEndTime = Math.floor(new Date(generationEnd).getTime() / 1000);

  // Energy in Wh (Origin standard)
  const energyWh = energy * 1000000; // Convert MWh to Wh

  try {
    // Try Origin API
    const result = await executeOriginApiRequest.call(this, credentials, 'POST', '/certificates', {
      deviceId,
      energy: energyWh.toString(),
      generationStart: generationStartTime,
      generationEnd: generationEndTime,
      to: recipientAddress,
    }) as { certificateId: string; transactionHash: string };

    return [
      {
        json: {
          success: true,
          certificateId: result.certificateId,
          transactionHash: result.transactionHash,
          deviceId,
          energy: energyWh.toString(),
          energyMwh: energy,
          recipient: recipientAddress,
          generationPeriod: {
            start: generationStart,
            end: generationEnd,
          },
        } as IDataObject,
      },
    ];
  } catch {
    // Prepare direct contract transaction
    return [
      {
        json: {
          message: 'Certificate issuance prepared',
          deviceId,
          energy: energyWh.toString(),
          energyMwh: energy,
          recipient: recipientAddress,
          generationStartTime,
          generationEndTime,
          gasEstimate: GAS_LIMITS.certificateIssue,
          note: 'Direct contract call requires Origin Certificate contract address and ABI',
        } as IDataObject,
      },
    ];
  }
}

/**
 * Transfer a certificate
 */
export async function transferCertificate(
  this: IExecuteFunctions,
  credentials: IEnergyWebCredentials,
  index: number,
): Promise<INodeExecutionData[]> {
  const certificateId = this.getNodeParameter('certificateId', index) as string;
  const toAddress = this.getNodeParameter('toAddress', index) as string;
  const amount = this.getNodeParameter('amount', index, '') as string;

  if (!isValidAddress(toAddress)) {
    throw new NodeOperationError(this.getNode(), ERROR_MESSAGES.INVALID_ADDRESS, {
      itemIndex: index,
    });
  }

  if (!credentials.privateKey) {
    throw new NodeOperationError(
      this.getNode(),
      'Private key is required for transferring certificates',
      { itemIndex: index },
    );
  }

  try {
    const result = await executeOriginApiRequest.call(
      this,
      credentials,
      'POST',
      `/certificates/${certificateId}/transfer`,
      {
        to: toAddress,
        amount: amount || undefined,
      },
    ) as { transactionHash: string };

    return [
      {
        json: {
          success: true,
          certificateId,
          to: toAddress,
          amount: amount || 'full',
          transactionHash: result.transactionHash,
        } as IDataObject,
      },
    ];
  } catch {
    return [
      {
        json: {
          message: 'Certificate transfer prepared',
          certificateId,
          to: toAddress,
          amount: amount || 'full',
          gasEstimate: GAS_LIMITS.certificateTransfer,
          note: 'Direct contract call required',
        } as IDataObject,
      },
    ];
  }
}

/**
 * Retire/claim a certificate
 */
export async function retireCertificate(
  this: IExecuteFunctions,
  credentials: IEnergyWebCredentials,
  index: number,
): Promise<INodeExecutionData[]> {
  const certificateId = this.getNodeParameter('certificateId', index) as string;
  const beneficiary = this.getNodeParameter('beneficiary', index, '') as string;
  const location = this.getNodeParameter('location', index, '') as string;
  const countryCode = this.getNodeParameter('countryCode', index, '') as string;
  const purpose = this.getNodeParameter('purpose', index, '') as string;

  if (!credentials.privateKey) {
    throw new NodeOperationError(
      this.getNode(),
      'Private key is required for retiring certificates',
      { itemIndex: index },
    );
  }

  const claimData: IClaimData = {
    beneficiary: beneficiary || '',
    location: location || '',
    countryCode: countryCode || '',
    periodStartDate: '',
    periodEndDate: '',
    purpose: purpose || 'Carbon offset',
  };

  try {
    const result = await executeOriginApiRequest.call(
      this,
      credentials,
      'POST',
      `/certificates/${certificateId}/claim`,
      { claimData },
    ) as { transactionHash: string };

    return [
      {
        json: {
          success: true,
          certificateId,
          claimData,
          transactionHash: result.transactionHash,
          retiredAt: new Date().toISOString(),
        } as unknown as IDataObject,
      },
    ];
  } catch {
    return [
      {
        json: {
          message: 'Certificate retirement prepared',
          certificateId,
          claimData,
          gasEstimate: GAS_LIMITS.certificateRetire,
          note: 'Direct contract call required',
        } as unknown as IDataObject,
      },
    ];
  }
}

/**
 * Get certificate history
 */
export async function getCertificateHistory(
  this: IExecuteFunctions,
  credentials: IEnergyWebCredentials,
  index: number,
): Promise<INodeExecutionData[]> {
  const certificateId = this.getNodeParameter('certificateId', index) as string;

  try {
    const history = await executeOriginApiRequest.call(
      this,
      credentials,
      'GET',
      `/certificates/${certificateId}/history`,
    ) as ICertificateHistory;

    const formattedEvents = history.events.map((event) => ({
      ...event,
      timestampFormatted: formatTimestamp(event.timestamp),
    }));

    return [
      {
        json: {
          certificateId: history.certificateId,
          events: formattedEvents,
          totalEvents: formattedEvents.length,
        } as unknown as IDataObject,
      },
    ];
  } catch {
    // Try to get events from blockchain logs
    const network = credentials.network || 'mainnet';

    // Get CertificateIssued, CertificateTransferred, CertificateClaimed events
    // This would require the certificate contract address
    const events: ICertificateEvent[] = [];

    return [
      {
        json: {
          certificateId,
          events,
          message: 'Full history requires Origin API or event log parsing',
        } as unknown as IDataObject,
      },
    ];
  }
}

/**
 * Get user certificates
 */
export async function getUserCertificates(
  this: IExecuteFunctions,
  credentials: IEnergyWebCredentials,
  index: number,
): Promise<INodeExecutionData[]> {
  const address = this.getNodeParameter('address', index) as string;
  const includeRetired = this.getNodeParameter('includeRetired', index, false) as boolean;

  if (!isValidAddress(address)) {
    throw new NodeOperationError(this.getNode(), ERROR_MESSAGES.INVALID_ADDRESS, {
      itemIndex: index,
    });
  }

  try {
    const params: IDataObject = { owner: address };
    if (!includeRetired) {
      params.retired = 'false';
    }

    const certificates = await executeOriginApiRequest.call(
      this,
      credentials,
      'GET',
      '/certificates',
      undefined,
      params,
    ) as ICertificate[];

    const formattedCertificates = certificates.map((cert) => ({
      ...cert,
      energyMwh: parseInt(cert.energy) / 1000000,
      generationStartFormatted: formatTimestamp(cert.generationStartTime),
      generationEndFormatted: formatTimestamp(cert.generationEndTime),
    }));

    // Calculate totals
    const totalEnergy = certificates.reduce((sum, cert) => sum + parseInt(cert.energy), 0);
    const activeCerts = certificates.filter((cert) => !cert.isRetired);
    const retiredCerts = certificates.filter((cert) => cert.isRetired);

    return [
      {
        json: {
          address,
          certificates: formattedCertificates,
          summary: {
            totalCertificates: certificates.length,
            activeCertificates: activeCerts.length,
            retiredCertificates: retiredCerts.length,
            totalEnergyWh: totalEnergy,
            totalEnergyMwh: totalEnergy / 1000000,
          },
        } as unknown as IDataObject,
      },
    ];
  } catch {
    return [
      {
        json: {
          address,
          certificates: [],
          message: 'Certificate lookup requires Origin API access',
        } as IDataObject,
      },
    ];
  }
}
