// deploy/02_deploy_dlp_token.ts
import { HardhatRuntimeEnvironment } from "hardhat/types";
import { deployUUPSWithManager } from "../utils/deployUtils";
import { DeployFunction } from "hardhat-deploy/types";
import AddressManager from "../utils/addressManager";

const deployDLPToken: DeployFunction = async function (
  hre: HardhatRuntimeEnvironment
) {
  const addressManager = AddressManager.getInstance();
  const { getNamedAccounts } = hre;
  const chainId = Number((await hre.ethers.provider.getNetwork()).chainId);
  const { deployer } = await getNamedAccounts();

  const vestingContractDeployment = await addressManager.getDeployment(
    chainId,
    "UniversalVestingContract"
  );
  if (!vestingContractDeployment) {
    throw new Error("UniversalVestingContract address not found");
  }

  const dlpTokenDeployment = await deployUUPSWithManager(hre, "DLPToken", [
    "Dispersion Launch Protocol Token",
    "DLP",
    deployer,
    vestingContractDeployment.address,
  ]);

  // Register the token in the vesting contract
  const vestingContract = await hre.ethers.getContractAt(
    "UniversalVestingContract",
    vestingContractDeployment.address
  );

  await vestingContract.registerToken(
    dlpTokenDeployment.getAddress(),
    100n,
    500n,
    100000000n
  );

  console.log(
    `DLPToken registered in vesting contract at address: ${vestingContractDeployment.address}`
  );
};
deployDLPToken.tags = ["DLPToken"];
deployDLPToken.dependencies = ["UniversalVestingContract"]; // Deploy Vesting Contract first

export default deployDLPToken;
