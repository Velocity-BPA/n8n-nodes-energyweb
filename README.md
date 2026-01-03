# n8n-nodes-energyweb

> [Velocity BPA Licensing Notice]
>
> This n8n node is licensed under the Business Source License 1.1 (BSL 1.1).
>
> Use of this node by for-profit organizations in production environments requires a commercial license from Velocity BPA.
>
> For licensing information, visit https://velobpa.com/licensing or contact licensing@velobpa.com.

A comprehensive n8n community node for Energy Web Chain blockchain providing 10 resource categories and 50+ operations for DIDs, renewable energy certificates (RECs), asset management, and smart contract interactions. The Energy Web Chain is the purpose-built blockchain for the energy sector.

![n8n version](https://img.shields.io/badge/n8n-0.200%2B-blue)
![Node version](https://img.shields.io/badge/node-18%2B-green)
![License](https://img.shields.io/badge/license-BSL--1.1-blue)

## Features

- **Complete Blockchain Integration** - Full JSON-RPC support for Energy Web Chain mainnet and Volta testnet
- **Decentralized Identity (DID)** - Create, read, update, and revoke W3C-compliant DIDs
- **Renewable Energy Certificates (RECs)** - Issue, transfer, and retire Origin platform certificates
- **Asset Management** - Register and manage energy assets and devices
- **Smart Contract Operations** - Read, write, and deploy smart contracts
- **Token Operations** - ERC20 token queries and transfers
- **Event Triggers** - Poll-based triggers for certificates, DIDs, assets, and large transfers
- **Network Utilities** - Gas estimation, validator queries, and unit conversion

## Installation

### Community Nodes (Recommended)

1. Go to **Settings > Community Nodes** in your n8n instance
2. Select **Install**
3. Enter `n8n-nodes-energyweb` and confirm installation

### Manual Installation

```bash
# Navigate to your n8n installation directory
cd ~/.n8n

# Install the package
npm install n8n-nodes-energyweb

# Restart n8n
```

### Development Installation

```bash
# Clone or extract the package
cd n8n-nodes-energyweb

# Install dependencies
npm install

# Build the project
npm run build

# Create symlink to n8n custom nodes directory
mkdir -p ~/.n8n/custom
ln -s $(pwd) ~/.n8n/custom/n8n-nodes-energyweb

# Restart n8n
n8n start
```

## Credentials Setup

Create Energy Web API credentials in n8n with the following parameters:

| Parameter | Description | Required | Default |
|-----------|-------------|----------|---------|
| Network | Chain network (mainnet/volta/custom) | Yes | mainnet |
| Custom RPC Endpoint | URL for custom network | No | - |
| Private Key | For signing transactions | No | - |
| EW Scan API Key | Enhanced explorer features | No | - |
| Origin API URL | Custom Origin platform URL | No | - |
| DID Registry Address | Custom registry contract | No | - |

## Resources & Operations

### Accounts
| Operation | Description |
|-----------|-------------|
| Get Balance | Get EWT balance for an address |
| Get Token Balances | Get all ERC20 token holdings |
| Get Transaction History | Retrieve transaction history |
| Get DID Document | Get associated DID document |

### Transactions
| Operation | Description |
|-----------|-------------|
| Get Transaction | Get full transaction details |
| Send Transaction | Prepare and sign a transaction |
| Estimate Gas | Estimate gas for a transaction |
| Get Transaction Status | Check confirmation status |

### DIDs (Decentralized Identifiers)
| Operation | Description |
|-----------|-------------|
| Create DID | Create a new W3C-compliant DID |
| Get DID Document | Resolve DID to its document |
| Update DID Document | Add or modify DID attributes |
| Revoke DID | Deactivate a DID |
| Get DID Claims | Retrieve associated claims |
| Issue Claim | Create a verifiable credential |
| Verify Claim | Validate credential authenticity |

### Origin (RECs)
| Operation | Description |
|-----------|-------------|
| Get Certificate | Get REC details by ID |
| Issue Certificate | Create a new REC |
| Transfer Certificate | Transfer REC ownership |
| Retire Certificate | Claim/retire a REC |
| Get Certificate History | View transfer history |
| Get User Certificates | List all user holdings |

### Assets
| Operation | Description |
|-----------|-------------|
| Register Asset | Register an energy asset |
| Get Asset Info | Retrieve asset details |
| Update Asset | Modify asset information |
| Get Asset History | View asset activity log |
| Link DID to Asset | Associate DID with asset |

### Smart Contracts
| Operation | Description |
|-----------|-------------|
| Read Contract | Call view/pure functions |
| Write Contract | Execute state-changing functions |
| Get Contract Events | Query event logs |
| Deploy Contract | Deploy a new contract |

### Tokens
| Operation | Description |
|-----------|-------------|
| Get Token Info | Get ERC20 metadata |
| Get Token Holders | List token holders |
| Transfer Token | Send ERC20 tokens |

### Network
| Operation | Description |
|-----------|-------------|
| Get Network Status | Chain status and info |
| Get Gas Price | Current gas pricing |
| Get Validators | Active validator list |
| Get Block | Block details by number/hash |

### Events
| Operation | Description |
|-----------|-------------|
| Get Logs | Query event logs with filters |
| Filter Events | Filter by topics |
| Subscribe to Events | Monitor events (polling) |

### Utility
| Operation | Description |
|-----------|-------------|
| Convert Units | Wei/Gwei/EWT conversion |
| Encode DID | Format DID string |
| Get API Health | Check service status |

## Trigger Node

The Energy Web Trigger node polls for blockchain events:

| Trigger | Description |
|---------|-------------|
| Certificate Issued | New REC issued |
| Certificate Transferred | REC transferred |
| DID Created | New DID registered |
| DID Updated | DID document modified |
| Asset Registered | New asset registered |
| Large Transfer | EWT transfer above threshold |

Configure triggers with:
- **Filter Address**: Monitor specific addresses
- **Lookback Blocks**: Initial block scan range
- **Transfer Threshold**: Minimum EWT for large transfer alerts

## Usage Examples

### Get Account Balance

```javascript
// Configure the Energy Web node:
// Resource: Accounts
// Operation: Get Balance
// Address: 0x1234...

// Returns:
{
  "address": "0x1234...",
  "balance": "1000000000000000000",
  "balanceEwt": "1.0",
  "network": "Energy Web Chain"
}
```

### Create a DID

```javascript
// Configure the Energy Web node:
// Resource: DIDs
// Operation: Create DID
// Address: 0x1234...

// Returns a prepared DID document and transaction data
```

### Issue a REC

```javascript
// Configure the Energy Web node:
// Resource: Origin (RECs)
// Operation: Issue Certificate
// Device ID: "device-123"
// Energy (Wh): 1000000
// Generation Start: 2024-01-01T00:00:00Z
// Generation End: 2024-01-31T23:59:59Z
```

## Energy Web Concepts

| Concept | Description |
|---------|-------------|
| EWT | Energy Web Token - Native currency |
| DID | Decentralized Identifier (W3C standard) |
| REC | Renewable Energy Certificate |
| Origin | Platform for REC management |
| Volta | Energy Web testnet |
| Claim | Verifiable credential |
| Asset | Energy device or resource |

## Networks

| Network | Chain ID | RPC URL |
|---------|----------|---------|
| Mainnet | 246 | https://rpc.energyweb.org |
| Volta (Testnet) | 73799 | https://volta-rpc.energyweb.org |

## Error Handling

The node provides detailed error messages for common issues:

- **Invalid Address**: Check Ethereum address format (0x + 40 hex characters)
- **Invalid Private Key**: Ensure 64 hex characters (with or without 0x prefix)
- **RPC Error**: Network connectivity or rate limiting issues
- **DID Not Found**: The DID hasn't been registered on-chain
- **Insufficient Balance**: Not enough EWT for the transaction

## Security Best Practices

1. **Store private keys securely** - Use n8n's credential encryption
2. **Use Volta testnet** for development and testing
3. **Monitor gas prices** before sending transactions
4. **Validate addresses** before transfers
5. **Test workflows** thoroughly before production use

## Development

```bash
# Install dependencies
npm install

# Build
npm run build

# Run tests
npm test

# Run tests with coverage
npm run test:coverage

# Lint code
npm run lint

# Fix lint issues
npm run lint:fix
```

## Author

**Velocity BPA**
- Website: [velobpa.com](https://velobpa.com)
- GitHub: [Velocity-BPA](https://github.com/Velocity-BPA)

## Licensing

This n8n community node is licensed under the **Business Source License 1.1**.

### Free Use
Permitted for personal, educational, research, and internal business use.

### Commercial Use
Use of this node within any SaaS, PaaS, hosted platform, managed service,
or paid automation offering requires a commercial license.

For licensing inquiries:
**licensing@velobpa.com**

See [LICENSE](LICENSE), [COMMERCIAL_LICENSE.md](COMMERCIAL_LICENSE.md), and [LICENSING_FAQ.md](LICENSING_FAQ.md) for details.

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Run tests and linting
5. Submit a pull request

Please ensure all contributions comply with the BSL 1.1 license terms.

## Support

- **Documentation**: [Energy Web Developer Docs](https://energy-web-foundation.gitbook.io/)
- **Issues**: [GitHub Issues](https://github.com/Velocity-BPA/n8n-nodes-energyweb/issues)
- **Community**: [Energy Web Discord](https://discord.gg/energyweb)

## Acknowledgments

- [Energy Web Foundation](https://www.energyweb.org/) for the blockchain platform
- [n8n](https://n8n.io/) for the workflow automation framework
- The open-source community for supporting decentralized energy solutions
