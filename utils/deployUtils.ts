import { ethers, upgrades } from "hardhat";
import { HardhatRuntimeEnvironment } from "hardhat/types";
import AddressManager, { DeploymentInfo } from "../utils/addressManager";
import { DeployOptions } from "hardhat-deploy/types";
import { BaseContract, TransactionResponse } from "ethers";

// Helper function to deploy a standard contract
export async function deployStandard(
  hre: HardhatRuntimeEnvironment,
  contractName: string,
  constructorArgs: any[] = []
): Promise<BaseContract> {
  // Return Contract
  const { getNamedAccounts, network } = hre;
  const addressManager = AddressManager.getInstance();
  const { deployer } = await getNamedAccounts();
  const chainId = Number((await ethers.provider.getNetwork()).chainId);

  console.log(`Deploying ${contractName}...`);
  const Contract = await hre.ethers.getContractFactory(contractName);
  const contract = await Contract.deploy(...constructorArgs);

  await contract.waitForDeployment();
  const address = await contract.getAddress();
  console.log(`${contractName} deployed to:`, address);

  // Get transaction hash and block number
  const tx = contract.deploymentTransaction();
  if (!tx)
    throw new Error(`Deployment transaction not found for ${contractName}`);
  const receipt = await tx.wait();
  if (!receipt) throw new Error(`No receipt for ${contractName}`);

  const deploymentInfo: DeploymentInfo = {
    address: address,
    contractType: "Standard",
    deployedBy: deployer,
    network: network.name,
    timestamp: Date.now(), // Redundant, but useful for quick checks
    transactionHash: receipt.hash,
    blockNumber: receipt.blockNumber,
    constructorArgs,
  };

  await addressManager.addDeployment(chainId, contractName, deploymentInfo);
  return contract;
}
export async function deployUUPSWithManager(
  hre: HardhatRuntimeEnvironment,
  contractName: string,
  initArgs: any[],
  options: Partial<DeployOptions> = {} //For options
): Promise<BaseContract> {
  const { getNamedAccounts, network } = hre;
  const { deployer } = await getNamedAccounts();
  const addressManager = AddressManager.getInstance(); // Use getInstance() method here
  const chainId = Number((await ethers.provider.getNetwork()).chainId); // Get actual chainId

  const Contract = await hre.ethers.getContractFactory(contractName);

  console.log(`Deploying ${contractName} (UUPS)...`);
  const proxy = await upgrades.deployProxy(Contract, initArgs, {
    initializer: "initialize",
    kind: "uups",
    ...options,
  });

  await proxy.waitForDeployment();
  const proxyAddress = await proxy.getAddress();
  const implementationAddress = await upgrades.erc1967.getImplementationAddress(
    proxyAddress
  );

  console.log(`${contractName} UUPS proxy deployed to ${proxyAddress}`);
  console.log(
    `${contractName} Implementation deployed to ${implementationAddress}`
  );

  // Get transaction hash and block number
  const tx = proxy.deploymentTransaction();
  if (!tx)
    throw new Error(`Deployment transaction not found for ${contractName}`);
  const receipt = await tx.wait();
  if (!receipt) throw new Error(`No receipt for ${contractName} deployment`);

  const deploymentInfo: DeploymentInfo = {
    address: proxyAddress,
    contractType: "UUPS Proxy",
    implementation: implementationAddress,
    deployedBy: deployer,
    network: network.name,
    timestamp: Date.now(),
    transactionHash: receipt.hash,
    blockNumber: receipt.blockNumber,
    initArgs,
  };

  await addressManager.addDeployment(chainId, contractName, deploymentInfo);

  return proxy;
}

export async function deployBeacon(
  hre: HardhatRuntimeEnvironment,
  contractName: string,
  constructorArgs: any[] = []
): Promise<BaseContract> {
  // Return Contract, not DeployResult
  const { getNamedAccounts, network } = hre;
  const { deployer } = await getNamedAccounts();
  const addressManager = AddressManager.getInstance(); // Use getInstance() method here
  const chainId = Number((await ethers.provider.getNetwork()).chainId);
  const deployerSigner = await ethers.getSigner(deployer);

  console.log(`Deploying ${contractName} Beacon...`);
  const Contract = await ethers.getContractFactory(contractName);

  const beacon = await upgrades.deployBeacon(Contract, {
    constructorArgs: constructorArgs,
  });

  await beacon.waitForDeployment();
  const beaconAddress = await beacon.getAddress();

  const implAddress = await upgrades.beacon.getImplementationAddress(
    beaconAddress
  );

  console.log(`${contractName} Beacon deployed to ${beaconAddress}`);
  console.log(`${contractName} Impl deployed to ${implAddress}`);

  // --- Get Implementation Deployment Transaction ---
  let receipt;
  let tx: TransactionResponse | undefined; // Use TransactionResponse type

  // Go directly to the provider lookup
  let blockNumber = await hre.ethers.provider.getBlockNumber();
  while (!receipt && blockNumber > 0) {
    const block = await hre.ethers.provider.getBlock(blockNumber, true); // true to get full tx objects
    if (block) {
      for (const transaction of block.transactions) {
        // transaction is TransactionResponse
        let fullTx: TransactionResponse | null;
        //Get the full transaction details.
        if (typeof transaction === "string") {
          fullTx = await hre.ethers.provider.getTransaction(transaction);
          if (!fullTx) continue; // Skip if transaction not found
        } else {
          fullTx = transaction;
        }
        //Check if the transaction is to null
        if (fullTx.to === null) {
          //Get the receipt
          let tempReceipt = await hre.ethers.provider.getTransactionReceipt(
            fullTx.hash
          );
          //Check that the receipt created a contract, and that address matches the implementation address.
          if (
            tempReceipt &&
            tempReceipt.contractAddress &&
            tempReceipt.contractAddress.toLowerCase() ===
              implAddress.toLowerCase()
          ) {
            receipt = tempReceipt;
            tx = fullTx;
            break;
          }
        }
      }
      blockNumber--;
    }
  }

  if (!receipt || !tx) {
    // Check for both receipt and tx
    throw new Error(
      `Deployment transaction not found for ${contractName} implementation at ${implAddress}`
    );
  }
  const deploymentInfo: DeploymentInfo = {
    address: beaconAddress,
    contractType: "Beacon",
    deployedBy: deployer,
    network: network.name,
    timestamp: Date.now(),
    transactionHash: receipt.hash,
    blockNumber: receipt.blockNumber,
    implementation: implAddress,
  };
  await addressManager.addDeployment(
    chainId,
    `beacons.${contractName}`,
    deploymentInfo
  );

  return beacon;
}
