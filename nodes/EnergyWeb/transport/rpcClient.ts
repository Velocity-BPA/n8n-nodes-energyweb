/*
 * Copyright (c) Velocity BPA, LLC
 * Licensed under the Business Source License 1.1
 * Commercial use requires a separate commercial license.
 * See LICENSE file for details.
 */

import type {
  IExecuteFunctions,
  IHookFunctions,
  ILoadOptionsFunctions,
  IPollFunctions,
  IHttpRequestOptions,
  IDataObject,
  JsonObject,
} from 'n8n-workflow';
import { NodeApiError } from 'n8n-workflow';
import { NETWORKS, ERROR_MESSAGES } from '../constants/constants';
import type {
  IEnergyWebCredentials,
  IJsonRpcRequest,
  IJsonRpcResponse,
  NetworkType,
} from '../utils/types';

// Type for functions that can make HTTP requests
type HttpRequestFunctions = IExecuteFunctions | IHookFunctions | ILoadOptionsFunctions | IPollFunctions;

let rpcRequestId = 1;

/**
 * Get RPC endpoint URL based on network configuration
 */
export function getRpcEndpoint(credentials: IEnergyWebCredentials): string {
  const { network, customRpcEndpoint } = credentials;

  if (network === 'custom' && customRpcEndpoint) {
    return customRpcEndpoint;
  }

  if (network === 'mainnet' || network === 'volta') {
    return NETWORKS[network].rpcUrl;
  }

  return NETWORKS.mainnet.rpcUrl;
}

/**
 * Get chain ID for the configured network
 */
export function getChainId(network: NetworkType): number {
  if (network === 'mainnet') {
    return NETWORKS.mainnet.chainId;
  }
  if (network === 'volta') {
    return NETWORKS.volta.chainId;
  }
  return NETWORKS.mainnet.chainId;
}

// Helper to create error object
function createErrorObject(message: string, code?: number): JsonObject {
  const obj: JsonObject = { message };
  if (code !== undefined) {
    obj.code = code;
  }
  return obj;
}

/**
 * Execute a JSON-RPC request to the Energy Web Chain
 */
export async function executeRpcRequest<T = unknown>(
  this: HttpRequestFunctions,
  credentials: IEnergyWebCredentials,
  method: string,
  params: unknown[] = [],
): Promise<T> {
  const rpcEndpoint = getRpcEndpoint(credentials);

  const requestBody: IJsonRpcRequest = {
    jsonrpc: '2.0',
    method,
    params,
    id: rpcRequestId++,
  };

  const options: IHttpRequestOptions = {
    method: 'POST',
    url: rpcEndpoint,
    headers: {
      'Content-Type': 'application/json',
    },
    body: requestBody,
    json: true,
  };

  try {
    const response = (await this.helpers.httpRequest(options)) as IJsonRpcResponse<T>;

    if (response.error) {
      throw new NodeApiError(this.getNode(), createErrorObject(response.error.message, response.error.code));
    }

    return response.result as T;
  } catch (error) {
    if (error instanceof NodeApiError) {
      throw error;
    }
    throw new NodeApiError(
      this.getNode(),
      createErrorObject(error instanceof Error ? error.message : ERROR_MESSAGES.RPC_ERROR),
    );
  }
}

/**
 * Execute a batch of JSON-RPC requests
 */
export async function executeBatchRpcRequest<T = unknown>(
  this: HttpRequestFunctions,
  credentials: IEnergyWebCredentials,
  requests: Array<{ method: string; params: unknown[] }>,
): Promise<T[]> {
  const rpcEndpoint = getRpcEndpoint(credentials);

  const batchBody = requests.map((req) => ({
    jsonrpc: '2.0' as const,
    method: req.method,
    params: req.params,
    id: rpcRequestId++,
  }));

  const options: IHttpRequestOptions = {
    method: 'POST',
    url: rpcEndpoint,
    headers: {
      'Content-Type': 'application/json',
    },
    body: batchBody,
    json: true,
  };

  try {
    const responses = (await this.helpers.httpRequest(options)) as IJsonRpcResponse<T>[];

    return responses.map((response, index) => {
      if (response.error) {
        throw new NodeApiError(
          this.getNode(),
          createErrorObject(`Batch request ${index} failed: ${response.error.message}`),
        );
      }
      return response.result as T;
    });
  } catch (error) {
    if (error instanceof NodeApiError) {
      throw error;
    }
    throw new NodeApiError(
      this.getNode(),
      createErrorObject(error instanceof Error ? error.message : ERROR_MESSAGES.RPC_ERROR),
    );
  }
}

/**
 * Execute an HTTP request to the Origin API
 */
export async function executeOriginApiRequest<T = unknown>(
  this: HttpRequestFunctions,
  credentials: IEnergyWebCredentials,
  method: 'GET' | 'POST' | 'PUT' | 'DELETE',
  endpoint: string,
  body?: IDataObject,
  query?: IDataObject,
): Promise<T> {
  const baseUrl = credentials.originApiUrl || 'https://origin.energyweb.org/api';

  const options: IHttpRequestOptions = {
    method,
    url: `${baseUrl}${endpoint}`,
    headers: {
      'Content-Type': 'application/json',
    },
    json: true,
  };

  if (body) {
    options.body = body;
  }

  if (query) {
    options.qs = query;
  }

  try {
    return (await this.helpers.httpRequest(options)) as T;
  } catch (error) {
    throw new NodeApiError(
      this.getNode(),
      createErrorObject(error instanceof Error ? error.message : 'Origin API request failed'),
    );
  }
}

/**
 * Execute an HTTP request to EW Scan API
 */
export async function executeEwScanRequest<T = unknown>(
  this: HttpRequestFunctions,
  credentials: IEnergyWebCredentials,
  endpoint: string,
  query?: IDataObject,
): Promise<T> {
  const network = credentials.network || 'mainnet';
  const baseUrl =
    network === 'volta'
      ? 'https://volta-explorer.energyweb.org/api'
      : 'https://explorer.energyweb.org/api';

  const options: IHttpRequestOptions = {
    method: 'GET',
    url: `${baseUrl}${endpoint}`,
    headers: {
      'Content-Type': 'application/json',
    },
    json: true,
  };

  if (credentials.ewScanApiKey) {
    options.headers = {
      ...options.headers,
      'X-API-Key': credentials.ewScanApiKey,
    };
  }

  if (query) {
    options.qs = query;
  }

  try {
    return (await this.helpers.httpRequest(options)) as T;
  } catch (error) {
    throw new NodeApiError(
      this.getNode(),
      createErrorObject(error instanceof Error ? error.message : 'EW Scan API request failed'),
    );
  }
}
