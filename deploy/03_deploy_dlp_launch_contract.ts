// deploy/03_deploy_dlp_launch_contract.ts
import { HardhatRuntimeEnvironment } from "hardhat/types";
import { deployUUPSWithManager } from "../utils/deployUtils";
import { DeployFunction } from "hardhat-deploy/types";
import { ethers, upgrades } from "hardhat";
import AddressManager from "../utils/addressManager";
import { RoleManager, Roles } from "../utils/roleManager";
import { DLPToken, UniversalVestingContract } from "../typechain-types";

const deployDLPLaunchContract: DeployFunction = async function (
  hre: HardhatRuntimeEnvironment
) {
  const addressManager = AddressManager.getInstance();
  const roleManager = RoleManager.getInstance();
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

  const tokenContractDeployment = await addressManager.getDeployment(
    chainId,
    "DLPToken"
  );
  if (!tokenContractDeployment) {
    throw new Error("DLPToken address not found");
  }

  const dlpLaunchContract = await deployUUPSWithManager(
    hre,
    "DLPLaunchContract",
    [tokenContractDeployment.address, vestingContractDeployment.address]
  );

  const launchContractAddress = await dlpLaunchContract.getAddress();

  // Set Vesting Creator Role in UniversalVestingContract (Grant DLPLaunchContract the role)
  const roles = [
    {
      role: Roles.VESTING_CREATOR,
      address: launchContractAddress,
    },
  ];
  await roleManager.grantRoles(
    { UniversalVestingContract: vestingContractDeployment },
    roles
  );

  // Set DLPLaunchContract as Minter in DLPToken
  const dlpTokenInstance = await ethers.getContractAt(
    "DLPToken",
    tokenContractDeployment.address
  );

  await dlpTokenInstance.setMinter(launchContractAddress); // Use DLPLaunchContract address from deployProxy output
  console.log("Set DLPLaunchContract as Minter in DLPToken");
};

deployDLPLaunchContract.tags = ["DLPLaunchContract"];
deployDLPLaunchContract.dependencies = ["DLPToken", "UniversalVestingContract"]; // Deploy DLPToken and VestingContract first

export default deployDLPLaunchContract;
