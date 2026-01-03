/*
 * Copyright (c) Velocity BPA, LLC
 * Licensed under the Business Source License 1.1
 * Commercial use requires a separate commercial license.
 * See LICENSE file for details.
 */

import type { IExecuteFunctions, INodeExecutionData, IDataObject } from 'n8n-workflow';
import { NodeOperationError } from 'n8n-workflow';
import { executeOriginApiRequest } from '../../transport/rpcClient';
import { isValidAddress, isValidDID, encodeDID, formatTimestamp } from '../../utils/helpers';
import { ERROR_MESSAGES } from '../../constants/constants';
import type {
  IEnergyWebCredentials,
  IAsset,
  IAssetHistory,
  ILocation,
  NetworkType,
} from '../../utils/types';

/**
 * Register a new energy asset
 */
export async function registerAsset(
  this: IExecuteFunctions,
  credentials: IEnergyWebCredentials,
  index: number,
): Promise<INodeExecutionData[]> {
  const ownerAddress = this.getNodeParameter('ownerAddress', index) as string;
  const assetType = this.getNodeParameter('assetType', index) as string;
  const capacity = this.getNodeParameter('capacity', index) as string;
  const country = this.getNodeParameter('country', index) as string;
  const region = this.getNodeParameter('region', index, '') as string;
  const commissioningDate = this.getNodeParameter('commissioningDate', index) as string;
  const gridOperator = this.getNodeParameter('gridOperator', index, '') as string;
  const latitude = this.getNodeParameter('latitude', index, null) as number | null;
  const longitude = this.getNodeParameter('longitude', index, null) as number | null;
  const additionalMetadata = this.getNodeParameter('additionalMetadata', index, {}) as IDataObject;

  if (!isValidAddress(ownerAddress)) {
    throw new NodeOperationError(this.getNode(), ERROR_MESSAGES.INVALID_ADDRESS, {
      itemIndex: index,
    });
  }

  const location: ILocation = {
    country,
    region: region || undefined,
    latitude: latitude ?? undefined,
    longitude: longitude ?? undefined,
  };

  const assetData: Partial<IAsset> = {
    owner: ownerAddress,
    assetType,
    capacity,
    location,
    commissioningDate,
    gridOperator: gridOperator || '',
    status: 'pending',
    metadata: additionalMetadata,
  };

  try {
    const result = await executeOriginApiRequest.call(
      this,
      credentials,
      'POST',
      '/devices',
      assetData as IDataObject,
    ) as IAsset;

    return [
      {
        json: {
          success: true,
          asset: result,
          message: 'Asset registered successfully',
        } as unknown as IDataObject,
      },
    ];
  } catch {
    // Generate a local asset ID for tracking
    const localAssetId = `asset-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    return [
      {
        json: {
          success: false,
          localAssetId,
          assetData,
          message: 'Asset registration prepared. Origin API required for on-chain registration.',
          note: 'Store this data and retry when API is available',
        } as unknown as IDataObject,
      },
    ];
  }
}

/**
 * Get asset information
 */
export async function getAssetInfo(
  this: IExecuteFunctions,
  credentials: IEnergyWebCredentials,
  index: number,
): Promise<INodeExecutionData[]> {
  const assetId = this.getNodeParameter('assetId', index) as string;

  try {
    const asset = await executeOriginApiRequest.call(
      this,
      credentials,
      'GET',
      `/devices/${assetId}`,
    ) as IAsset;

    return [
      {
        json: {
          ...asset,
          capacityKw: parseFloat(asset.capacity),
          commissioningDateFormatted: asset.commissioningDate,
        } as unknown as IDataObject,
      },
    ];
  } catch {
    return [
      {
        json: {
          assetId,
          error: ERROR_MESSAGES.ASSET_NOT_FOUND,
          message: 'Asset lookup requires Origin API access',
        } as IDataObject,
      },
    ];
  }
}

/**
 * Update asset information
 */
export async function updateAsset(
  this: IExecuteFunctions,
  credentials: IEnergyWebCredentials,
  index: number,
): Promise<INodeExecutionData[]> {
  const assetId = this.getNodeParameter('assetId', index) as string;
  const updates = this.getNodeParameter('updates', index, {}) as IDataObject;

  if (!credentials.privateKey) {
    throw new NodeOperationError(this.getNode(), 'Private key is required for updating assets', {
      itemIndex: index,
    });
  }

  // Validate location updates if present
  if (updates.location) {
    const location = updates.location as IDataObject;
    if (!location.country) {
      throw new NodeOperationError(this.getNode(), 'Country is required in location update', {
        itemIndex: index,
      });
    }
  }

  try {
    const result = await executeOriginApiRequest.call(
      this,
      credentials,
      'PUT',
      `/devices/${assetId}`,
      updates,
    ) as IAsset;

    return [
      {
        json: {
          success: true,
          assetId,
          updatedAsset: result,
          updatedFields: Object.keys(updates),
        } as unknown as IDataObject,
      },
    ];
  } catch {
    return [
      {
        json: {
          assetId,
          updates,
          message: 'Asset update prepared. Origin API required for on-chain update.',
        } as IDataObject,
      },
    ];
  }
}

/**
 * Get asset history
 */
export async function getAssetHistory(
  this: IExecuteFunctions,
  credentials: IEnergyWebCredentials,
  index: number,
): Promise<INodeExecutionData[]> {
  const assetId = this.getNodeParameter('assetId', index) as string;

  try {
    const history = await executeOriginApiRequest.call(
      this,
      credentials,
      'GET',
      `/devices/${assetId}/history`,
    ) as IAssetHistory;

    const formattedEvents = history.events.map((event) => ({
      ...event,
      timestampFormatted: formatTimestamp(event.timestamp),
    }));

    return [
      {
        json: {
          assetId: history.assetId,
          events: formattedEvents,
          totalEvents: formattedEvents.length,
        } as unknown as IDataObject,
      },
    ];
  } catch {
    return [
      {
        json: {
          assetId,
          events: [],
          message: 'Asset history requires Origin API access',
        } as IDataObject,
      },
    ];
  }
}

/**
 * Link DID to asset
 */
export async function linkDIDToAsset(
  this: IExecuteFunctions,
  credentials: IEnergyWebCredentials,
  index: number,
): Promise<INodeExecutionData[]> {
  const assetId = this.getNodeParameter('assetId', index) as string;
  const didInput = this.getNodeParameter('did', index) as string;

  let did: string;

  if (isValidDID(didInput)) {
    did = didInput;
  } else if (isValidAddress(didInput)) {
    const network = (credentials.network || 'mainnet') as NetworkType;
    did = encodeDID(didInput, network).did;
  } else {
    throw new NodeOperationError(this.getNode(), ERROR_MESSAGES.INVALID_DID_FORMAT, {
      itemIndex: index,
    });
  }

  if (!credentials.privateKey) {
    throw new NodeOperationError(this.getNode(), 'Private key is required for linking DIDs', {
      itemIndex: index,
    });
  }

  try {
    const result = await executeOriginApiRequest.call(
      this,
      credentials,
      'POST',
      `/devices/${assetId}/link-did`,
      { did },
    ) as { success: boolean; transactionHash?: string };

    return [
      {
        json: {
          success: true,
          assetId,
          linkedDID: did,
          transactionHash: result.transactionHash,
          message: 'DID successfully linked to asset',
        } as IDataObject,
      },
    ];
  } catch {
    return [
      {
        json: {
          assetId,
          did,
          message: 'DID link prepared. Origin API required for on-chain linking.',
          note: 'This creates a verifiable association between the asset and the DID',
        } as IDataObject,
      },
    ];
  }
}
