import { ethers } from "hardhat";
import { keccak256, toUtf8Bytes } from "ethers";
import { DeploymentInfo } from "./addressManager";
import fs from "fs/promises";
import path from "path";

const Roles = {
  VESTING_CREATOR: keccak256(toUtf8Bytes("VESTING_CREATOR_ROLE")),
  GOVERNANCE: keccak256(toUtf8Bytes("GOVERNANCE_ROLE")),
  FACTORY: keccak256(toUtf8Bytes("FACTORY_ROLE")),
};

class RoleManager {
  private static instance: RoleManager;
  private rolesFilePath: string;

  private constructor() {
    this.rolesFilePath = path.join(__dirname, "../deployments/roles.json");
  }

  public static getInstance(): RoleManager {
    if (!RoleManager.instance) {
      RoleManager.instance = new RoleManager();
    }
    return RoleManager.instance;
  }

  private async saveRoles(rolesData: any): Promise<void> {
    try {
      const dir = path.dirname(this.rolesFilePath);
      await fs.mkdir(dir, { recursive: true });
      await fs.writeFile(
        this.rolesFilePath,
        JSON.stringify(rolesData, null, 2)
      );
    } catch (error) {
      console.error("Failed to save roles:", error);
      throw error;
    }
  }

  public async grantRoles(
    deployments: { [contractName: string]: DeploymentInfo },
    roles: any[]
  ) {
    const rolesData: any = {};

    for (const [contractName, deploymentInfo] of Object.entries(deployments)) {
      if (contractName == "beacons") {
        continue;
      }

      const contract = await ethers.getContractAt(
        contractName,
        deploymentInfo.address
      );

      console.log(
        `Granting roles on ${contractName} at ${deploymentInfo.address}`
      );
      for (const { role, address } of roles) {
        try {
          await contract.grantRole(role, address);

          if (!rolesData[contractName]) {
            rolesData[contractName] = [];
          }
          rolesData[contractName].push({ role, address });
        } catch (error) {
          console.warn(
            `  Failed to grant role ${role} to ${address} on ${contractName}:`,
            error
          );
        }
      }
    }

    await this.saveRoles(rolesData);
  }
}

export { RoleManager, Roles };
