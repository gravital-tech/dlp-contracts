import { ethers } from "hardhat";
import { HardhatRuntimeEnvironment } from "hardhat/types";

export async function fundDeployer(hre: HardhatRuntimeEnvironment) {
  const { getNamedAccounts } = hre;
  const { deployer } = await getNamedAccounts();
  const chainId = Number((await ethers.provider.getNetwork()).chainId);

  if (chainId === 1987) {
    const provider = new ethers.JsonRpcProvider(
      "https://virtual.mainnet.rpc.tenderly.co/d9a3ffa3-f0e9-4848-94d9-5fd55656a3a2"
    );
    const EXPLORER_BASE_URL =
      "https://virtual.mainnet.rpc.tenderly.co/e0a1bbc9-16e8-482f-b649-3855fbfbb5a4";

    try {
      const tx = await provider.send("tenderly_setBalance", [
        [deployer],
        "0x8AC7230489E80000", // 10 ETH in wei
      ]);

      console.log(`${EXPLORER_BASE_URL}/tx/${tx.hash}`);
    } catch (error) {
      console.error("Failed to fund deployer:", error);
      process.exitCode = 1;
    }
  } else {
    console.log(`Funding not supported for chainId ${chainId}`);
  }
}
