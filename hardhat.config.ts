import { HardhatUserConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-toolbox";
import "@openzeppelin/hardhat-upgrades";
import "hardhat-deploy";
import "@typechain/hardhat";
import "solidity-docgen";

const config: HardhatUserConfig = {
  solidity: {
    version: "0.8.26", // Or your desired Solidity version
    settings: {
      optimizer: {
        enabled: true,
        runs: 200,
      },
    },
  },
  networks: {
    hardhat: {
      chainId: 31337, // Chain ID for Hardhat network
    },
  },
  paths: {
    deploy: "deploy",
    deployments: "deployments",
    sources: "contracts",
    tests: "test",
    cache: "cache",
    artifacts: "artifacts",
  },
  typechain: {
    outDir: "typechain-types", // Output directory for Typechain type definitions
    target: "ethers-v6", // Target library for Typechain (Ethers v6)
    alwaysGenerateOverloads: false, // should overloads with full signatures like deposit(uint256):(uint256) be generated, when others are present
    externalArtifacts: ["artifacts/*.json"], // optional array of glob patterns with external artifacts
    dontOverrideCompile: false, // defaults to false
  },
  mocha: {
    timeout: 120000, // Increased timeout for tests if needed
  },
  namedAccounts: {
    deployer: {
      default: 0, // First account as deployer
    },
  },
  docgen: {
    outputDir: "./docs/contracts",
    pages: "items", // Create one page per contract
    templates: "./docs/templates",
    collapseNewlines: true,
    exclude: ["node_modules"],
  },
};

export default config;
