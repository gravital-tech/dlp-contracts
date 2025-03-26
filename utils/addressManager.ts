import fs from "fs/promises"; // Use fs.promises for async operations
import path from "path";
import stringifyBigInt from "./bigInt";

// Interface for the deployment information we want to store
export interface DeploymentInfo {
  address: string;
  contractType: string; // e.g., "UUPS Proxy", "Beacon", "Standard"
  implementation?: string; // For proxies and beacons
  beaconAddress?: string; // For beacons
  deployedBy: string;
  network: string;
  timestamp: number;
  transactionHash: string; // CRUCIAL: Store the transaction hash
  blockNumber: number; // CRUCIAL: Store the block number
  constructorArgs?: any[];
  initArgs?: any[];
  [key: string]: any; // Allow for nested DeploymentInfo types
}

interface Addresses {
  [chainId: number]: {
    // Use number for chainId
    [contractName: string]: DeploymentInfo | any; // Allow for nested objects
  };
}

class AddressManager {
  private filePath: string;
  private addresses: Addresses;
  private addressesLoaded: Promise<void>;
  private static instance: AddressManager;

  private constructor(
    filePath: string = path.join(__dirname, "../deployments/addresses.json")
  ) {
    // Use __dirname directly - it's available in CommonJS
    this.filePath = filePath;
    this.addresses = {}; // Initialize addresses
    this.addressesLoaded = this.loadAddresses().catch((err) => {
      console.error("Failed to load addresses:", err); // Log but don't crash.
      //  Continue with an empty object.
    });
  }

  public static getInstance(filePath?: string): AddressManager {
    if (!AddressManager.instance) {
      AddressManager.instance = new AddressManager(filePath);
    }
    return AddressManager.instance;
  }

  private async loadAddresses(): Promise<void> {
    try {
      const data = await fs.readFile(this.filePath, "utf8");
      this.addresses = JSON.parse(data, (key, value) => {
        // Revive BigInts
        return typeof value === "string" && /^\d+n$/.test(value)
          ? BigInt(value.slice(0, -1))
          : value;
      });
    } catch (error: any) {
      if (error.code === "ENOENT") {
        // File doesn't exist yet, which is fine.
        console.warn("Addresses file not found, initializing empty addresses.");
        this.addresses = {};
      } else {
        // Some other error occurred.
        console.error("Failed to load addresses:", error);
        this.addresses = {}; // Fallback to empty object
      }
    }
  }

  private async saveAddresses(): Promise<void> {
    try {
      await this.addressesLoaded;

      //Ensure directory exists.
      const dir = path.dirname(this.filePath);
      await fs.mkdir(dir, { recursive: true });

      await fs.writeFile(
        this.filePath,
        JSON.stringify(
          this.addresses,
          (key, value) => {
            // Convert BigInts to strings
            return typeof value === "bigint" ? value.toString() + "n" : value;
          },
          2
        )
      );
    } catch (error) {
      console.error("Failed to save addresses:", error);
      throw error; // Re-throw to halt deployment if saving fails.
    }
  }

  async addDeployment(
    chainId: number,
    contractName: string,
    deploymentInfo: DeploymentInfo
  ): Promise<void> {
    await this.addressesLoaded;

    if (!this.addresses[chainId]) {
      this.addresses[chainId] = {};
    }

    // Handle nested paths (e.g., "beacons.token")
    const parts = contractName.split(".");
    let current = this.addresses[chainId];

    for (let i = 0; i < parts.length - 1; i++) {
      if (!current[parts[i]]) {
        current[parts[i]] = {};
      }
      current = current[parts[i]];
    }

    // Overwrite existing data
    current[parts[parts.length - 1]] = {
      ...deploymentInfo,
      timestamp: Date.now(),
    };

    await this.saveAddresses();
  }

  async getDeployment(
    chainId: number,
    contractName: string
  ): Promise<DeploymentInfo | null> {
    await this.addressesLoaded;
    if (!this.addresses[chainId]) return null;

    // Handle nested paths
    const parts = contractName.split(".");
    let current: any = this.addresses[chainId];

    for (const part of parts) {
      if (!current[part]) {
        console.log(`Part ${part} not found in ${stringifyBigInt(current)}`);
        return null;
      }
      current = current[part];
    }

    return current;
  }

  async getAllDeployments(
    chainId: number
  ): Promise<{ [contractName: string]: DeploymentInfo }> {
    return this.addresses[chainId] || {};
  }

  async verifyDeployment(
    chainId: number,
    contractName: string,
    address: string
  ): Promise<boolean> {
    const deployment = await this.getDeployment(chainId, contractName);
    return (
      !!deployment && deployment.address.toLowerCase() === address.toLowerCase()
    );
  }
}

export default AddressManager;
