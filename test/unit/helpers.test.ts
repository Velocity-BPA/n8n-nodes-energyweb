/*
 * Copyright (c) Velocity BPA, LLC
 * Licensed under the Business Source License 1.1
 * Commercial use requires a separate commercial license.
 * See LICENSE file for details.
 */

import { isValidAddress, isValidPrivateKey, weiToUnits, encodeDID, hexToNumber, numberToHex } from '../../nodes/EnergyWeb/utils/helpers';

describe('Energy Web Helpers', () => {
  describe('isValidAddress', () => {
    it('should return true for valid Ethereum addresses', () => {
      expect(isValidAddress('0x1234567890123456789012345678901234567890')).toBe(true);
      expect(isValidAddress('0xABCDEF1234567890abcdef1234567890ABCDEF12')).toBe(true);
    });

    it('should return false for invalid addresses', () => {
      expect(isValidAddress('')).toBe(false);
      expect(isValidAddress('0x123')).toBe(false);
      expect(isValidAddress('1234567890123456789012345678901234567890')).toBe(false);
      expect(isValidAddress('0xGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGG')).toBe(false);
    });
  });

  describe('isValidPrivateKey', () => {
    it('should return true for valid private keys', () => {
      expect(isValidPrivateKey('0x1234567890123456789012345678901234567890123456789012345678901234')).toBe(true);
      expect(isValidPrivateKey('1234567890123456789012345678901234567890123456789012345678901234')).toBe(true);
    });

    it('should return false for invalid private keys', () => {
      expect(isValidPrivateKey('')).toBe(false);
      expect(isValidPrivateKey('0x123')).toBe(false);
    });
  });

  describe('weiToUnits', () => {
    it('should convert wei to EWT correctly', () => {
      const result = weiToUnits('1000000000000000000');
      expect(result.ewt).toBe('1');
      expect(result.wei).toBe('1000000000000000000');
    });

    it('should handle small amounts', () => {
      const result = weiToUnits('1000000000');
      expect(result.gwei).toBe('1');
    });

    it('should handle zero', () => {
      const result = weiToUnits('0');
      expect(result.wei).toBe('0');
      expect(result.ewt).toBe('0');
    });
  });

  describe('encodeDID', () => {
    it('should encode mainnet DIDs correctly', () => {
      const result = encodeDID('0x1234567890123456789012345678901234567890', 'mainnet');
      expect(result.did).toBe('did:ethr:ewc:0x1234567890123456789012345678901234567890');
      expect(result.method).toBe('did:ethr');
      expect(result.identifier).toBe('0x1234567890123456789012345678901234567890');
    });

    it('should encode volta DIDs correctly', () => {
      const result = encodeDID('0x1234567890123456789012345678901234567890', 'volta');
      expect(result.did).toBe('did:ethr:volta:0x1234567890123456789012345678901234567890');
      expect(result.method).toBe('did:ethr');
      expect(result.identifier).toBe('0x1234567890123456789012345678901234567890');
    });
  });

  describe('hexToNumber', () => {
    it('should convert hex strings to numbers', () => {
      expect(hexToNumber('0x10')).toBe(16);
      expect(hexToNumber('0xff')).toBe(255);
      expect(hexToNumber('0x0')).toBe(0);
    });
  });

  describe('numberToHex', () => {
    it('should convert numbers to hex strings', () => {
      expect(numberToHex(16)).toBe('0x10');
      expect(numberToHex(255)).toBe('0xff');
      expect(numberToHex(0)).toBe('0x0');
    });
  });
});

describe('Energy Web Constants', () => {
  it('should export required constants', () => {
    const constants = require('../../nodes/EnergyWeb/constants/constants');
    expect(constants.NETWORKS).toBeDefined();
    expect(constants.NETWORKS.mainnet.chainId).toBe(246);
    expect(constants.NETWORKS.volta.chainId).toBe(73799);
    expect(constants.DEFAULT_CONTRACTS).toBeDefined();
    expect(constants.CONTRACT_ADDRESSES).toBeDefined();
    expect(constants.ERROR_MESSAGES).toBeDefined();
  });
});
