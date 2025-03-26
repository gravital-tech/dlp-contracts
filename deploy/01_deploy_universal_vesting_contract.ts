// deploy/01_deploy_universal_vesting_contract.ts
import { HardhatRuntimeEnvironment } from "hardhat/types";
import { deployUUPSWithManager } from "../utils/deployUtils";
import { DeployFunction } from "hardhat-deploy/types";

const deployUniversalVestingContract: DeployFunction = async function (
  hre: HardhatRuntimeEnvironment
) {
  const { deployments, getNamedAccounts } = hre;

  const universalVestingContract = await deployUUPSWithManager(
    hre,
    "UniversalVestingContract",
    []
  );
};

deployUniversalVestingContract.tags = ["UniversalVestingContract"];

export default deployUniversalVestingContract;
