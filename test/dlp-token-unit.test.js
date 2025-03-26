const { expect } = require("chai");
const { ethers } = require("hardhat");
const { loadFixture } = require("@nomicfoundation/hardhat-network-helpers");
const { keccak256, toUtf8Bytes } = require("ethers");
const tokenFixtures = require("./utils/fixtures-token");
const { deployUUPSProxyFixture } = require("./utils/fixtures");
const { getLinearVestingAmount } = require("./utils/vestingMath");

describe("DLPToken Unit Tests", function () {

    describe("Initialization and Configuration", function () {
        it("Should initialize with correct parameters", async function () {
            const { dlpToken, vestingContract, signers } = await loadFixture(tokenFixtures.deployDLPTokenFixture);

            expect(await dlpToken.name()).to.equal("DLPToken");
            expect(await dlpToken.symbol()).to.equal("DLP");
            expect(await dlpToken.minterAddress()).to.equal(signers.minter.address);
            expect(await dlpToken.vestingContract()).to.equal(vestingContract.target);
            expect(await dlpToken.isVestingActive()).to.be.true;
            expect(await dlpToken.hasRole(await dlpToken.DEFAULT_ADMIN_ROLE(), signers.admin.address)).to.be.true;
        });

        it("Should have zero initial supply", async function () {
            const { dlpToken } = await loadFixture(tokenFixtures.deployDLPTokenFixture);
            expect(await dlpToken.totalSupply()).to.equal(0);
        });

        it("Should have 18 decimals", async function () {
            const { dlpToken } = await loadFixture(tokenFixtures.deployDLPTokenFixture);
            expect(await dlpToken.decimals()).to.equal(18);
        });
    });

    describe("Minting Functionality", function () {
        it("Should allow minter to mint tokens", async function () {
            const { dlpToken, signers } = await loadFixture(tokenFixtures.deployWithTokensFixture);
            expect(await dlpToken.balanceOf(signers.user1.address)).to.equal(ethers.parseEther("1000"));
        });

        it("Should allow minting to multiple addresses", async function () {
            const { dlpToken, signers } = await loadFixture(tokenFixtures.deployDLPTokenFixture);

            await dlpToken.connect(signers.minter).mint(signers.user1.address, ethers.parseEther("100"));
            await dlpToken.connect(signers.minter).mint(signers.user2.address, ethers.parseEther("200"));
            await dlpToken.connect(signers.minter).mint(signers.user3.address, ethers.parseEther("300"));

            expect(await dlpToken.balanceOf(signers.user1.address)).to.equal(ethers.parseEther("100"));
            expect(await dlpToken.balanceOf(signers.user2.address)).to.equal(ethers.parseEther("200"));
            expect(await dlpToken.balanceOf(signers.user3.address)).to.equal(ethers.parseEther("300"));
            expect(await dlpToken.totalSupply()).to.equal(ethers.parseEther("600"));
        });

        it("Should allow minting zero tokens (no-op)", async function () {
            const { dlpToken, signers } = await loadFixture(tokenFixtures.deployDLPTokenFixture);

            await dlpToken.connect(signers.minter).mint(signers.user1.address, 0);

            expect(await dlpToken.balanceOf(signers.user1.address)).to.equal(ethers.parseEther("0"));
            expect(await dlpToken.totalSupply()).to.equal(ethers.parseEther("0"));
        });

        it("Should revert if non-minter tries to mint tokens", async function () {
            const { dlpToken, signers } = await loadFixture(tokenFixtures.deployDLPTokenFixture);
            const mintAmount = ethers.parseEther("100");
            await expect(
                dlpToken.connect(signers.user1).mint(signers.user1.address, mintAmount)
            ).to.be.revertedWith("DLPToken: Only minter can call this function");
        });

        it("Should not allow minting to the zero address", async function () {
            const { dlpToken, signers } = await loadFixture(tokenFixtures.deployDLPTokenFixture);

            const mintAmount = ethers.parseEther("100");
            await expect(
                dlpToken.connect(signers.minter).mint(ethers.ZeroAddress, mintAmount)
            ).to.be.reverted;
        });

        it("Should update total supply after minting", async function () {
            const { dlpToken } = await loadFixture(tokenFixtures.deployWithTokensFixture);

            expect(await dlpToken.totalSupply()).to.equal(ethers.parseEther("1000"));
        });

        it("Should emit Transfer event when minting", async function () {
            const { dlpToken, signers } = await loadFixture(tokenFixtures.deployDLPTokenFixture);

            const mintAmount = ethers.parseEther("100");

            await expect(dlpToken.connect(signers.minter).mint(signers.user1.address, mintAmount))
                .to.emit(dlpToken, "Transfer")
                .withArgs(ethers.ZeroAddress, signers.user1.address, mintAmount);
        });

        it("Should allow changing of minterAddress by admin", async function () {
            const { dlpToken, signers } = await loadFixture(tokenFixtures.deployDLPTokenFixture);

            await dlpToken.connect(signers.admin).setMinter(signers.user1.address);
            expect(await dlpToken.minterAddress()).to.equal(signers.user1.address);
        });

        it("Should revert on non-admin changing minterAddress", async function () {
            const { dlpToken, signers } = await loadFixture(tokenFixtures.deployDLPTokenFixture);

            await expect(
                dlpToken.connect(signers.user1).setMinter(signers.user2.address)
            ).to.be.revertedWithCustomError(dlpToken, "AccessControlUnauthorizedAccount");
        });
    });

    describe("Burning Functionality", function () {
        it("Should allow token holder to burn their own tokens", async function () {
            const { dlpToken, signers } = await loadFixture(tokenFixtures.deployWithTokensFixture);

            const initialBalance = await dlpToken.balanceOf(signers.user1.address);
            const initialSupply = await dlpToken.totalSupply();
            const burnAmount = ethers.parseEther("300");

            await dlpToken.connect(signers.user1).burn(burnAmount);

            expect(await dlpToken.balanceOf(signers.user1.address)).to.equal(initialBalance - burnAmount);
            expect(await dlpToken.totalSupply()).to.equal(initialSupply - burnAmount);
        });

        it("Should emit Transfer event when burning", async function () {
            const { dlpToken, signers } = await loadFixture(tokenFixtures.deployWithTokensFixture);

            await expect(dlpToken.connect(signers.user1).burn(ethers.parseEther("300")))
                .to.emit(dlpToken, "Transfer")
                .withArgs(signers.user1.address, ethers.ZeroAddress, ethers.parseEther("300"));
        });

        it("Should allow burning the entire balance", async function () {
            const { dlpToken, signers } = await loadFixture(tokenFixtures.deployWithTokensFixture);
            const fullBalance = await dlpToken.balanceOf(signers.user1.address);

            await expect(dlpToken.connect(signers.user1).burn(fullBalance)).to.not.be.reverted;

            expect(await dlpToken.balanceOf(signers.user1.address)).to.equal(0);
        });

        it("Should revert if burning more than balance", async function () {
            const { dlpToken, signers } = await loadFixture(tokenFixtures.deployWithTokensFixture);
            const balance = await dlpToken.balanceOf(signers.user1.address);
            const burnAmount = balance + ethers.toBigInt(1);

            await expect(
                dlpToken.connect(signers.user1).burn(burnAmount)
            ).to.be.reverted;
        });

        it("Should allow users to burnFrom with allowance", async function () {
            const { dlpToken, signers } = await loadFixture(tokenFixtures.deployWithTokensFixture);

            const burnAmount = ethers.parseEther("200");

            // Approve user2 to burn tokens on behalf of user1
            await dlpToken.connect(signers.user1).approve(signers.user2.address, burnAmount);

            const initialBalance = await dlpToken.balanceOf(signers.user1.address);
            const initialSupply = await dlpToken.totalSupply();

            // User2 burns tokens on behalf of user1
            await dlpToken.connect(signers.user2).burnFrom(signers.user1.address, burnAmount);

            expect(await dlpToken.balanceOf(signers.user1.address)).to.equal(initialBalance - burnAmount);
            expect(await dlpToken.totalSupply()).to.equal(initialSupply - burnAmount);
            expect(await dlpToken.allowance(signers.user1.address, signers.user2.address)).to.equal(0);
        });

        it("Should revert burnFrom if allowance is insufficient", async function () {
            const { dlpToken, signers } = await loadFixture(tokenFixtures.deployWithTokensFixture);
            const allowance = ethers.parseEther("100");
            const burnAmount = ethers.parseEther("200");

            // Approve user2 to burn some tokens on behalf of user1
            await dlpToken.connect(signers.user1).approve(signers.user2.address, allowance);

            // User2 tries to burn more than allowed
            await expect(
                dlpToken.connect(signers.user2).burnFrom(signers.user1.address, burnAmount)
            ).to.be.reverted;
        });
    });

    describe("Transfer Functionality", function () {
        it("Should have vesting enabled by default", async function () {
            const { dlpToken } = await loadFixture(tokenFixtures.deployDLPTokenFixture);
            expect(await dlpToken.isVestingActive()).to.be.true;
        });

        it("Should not allow transfer if vesting contract is not specified", async function () {
            const { dlpToken, signers } = await loadFixture(tokenFixtures.deployDLPTokenFixture);

            // Set vesting contract to zero address
            await dlpToken.setVestingContract(ethers.ZeroAddress);

            // Ensure transaction reverts
            const transferAmount = ethers.parseEther("300");

            await expect(dlpToken.connect(signers.user1).transfer(signers.user2.address, transferAmount)).to.be.revertedWithCustomError(dlpToken, "VestingNotConfigured");
        })

        it("Should call isTransferAllowed when vesting is active", async function () {
            const { dlpToken, mockVesting, signers } = await loadFixture(tokenFixtures.deployWithMockVestingFixture);

            // Configure mock to return false for isTransferAllowed
            await mockVesting.setAllow(false);

            // Ensure vesting is active
            expect(await dlpToken.isVestingActive()).to.be.true;

            // Initiate a transfer
            await expect(dlpToken.connect(signers.user1).transfer(signers.user2.address, ethers.parseEther("1"))).to.be.revertedWithCustomError(dlpToken, "TokensNotVested");

        });

        it("Should not call isTransferAllowed when vesting is inactive", async function () {
            const { dlpToken, mockVesting, signers } = await loadFixture(tokenFixtures.deployWithMockVestingFixture);

            await dlpToken.connect(signers.admin).setVestingActive(false);
            await mockVesting.setAllow(true);

            // Ensure vesting is active
            expect(await dlpToken.isVestingActive()).to.be.false;

            // Mint tokens to user1
            await dlpToken.connect(signers.minter).mint(signers.user1.address, ethers.parseEther("1000"));

            // Initiate a transfer
            await expect(dlpToken.connect(signers.user1).transfer(signers.user2.address, ethers.parseEther("1"))).to.not.be.reverted;

        });

        it("Should allow transfer with vesting inactive", async function () {
            const { dlpToken, signers } = await loadFixture(tokenFixtures.deployWithTokensFixture);

            await dlpToken.setVestingActive(false);
            const transferAmount = ethers.parseEther("300");

            await dlpToken.connect(signers.user1).transfer(signers.user2.address, transferAmount);

            expect(await dlpToken.balanceOf(signers.user1.address)).to.equal(ethers.parseEther("700"));
            expect(await dlpToken.balanceOf(signers.user2.address)).to.equal(transferAmount);
        });

        it("Should emit Transfer event on transfer", async function () {
            const { dlpToken, signers } = await loadFixture(tokenFixtures.deployWithTokensFixture);
            await dlpToken.setVestingActive(false);
            const transferAmount = ethers.parseEther("300");

            await expect(dlpToken.connect(signers.user1).transfer(signers.user2.address, transferAmount))
                .to.emit(dlpToken, "Transfer")
                .withArgs(signers.user1.address, signers.user2.address, transferAmount);
        });

        it("Should allow transferFrom with sufficient allowance and vesting inactive", async function () {
            const { dlpToken, signers } = await loadFixture(tokenFixtures.deployWithTokensFixture);

            await dlpToken.setVestingActive(false);
            const transferAmount = ethers.parseEther("300");

            // Approve user2 to transfer tokens on behalf of user1
            await dlpToken.connect(signers.user1).approve(signers.user2.address, transferAmount);

            // User2 transfers tokens from user1 to user3
            await dlpToken.connect(signers.user2).transferFrom(
                signers.user1.address,
                signers.user3.address,
                transferAmount
            );

            expect(await dlpToken.balanceOf(signers.user1.address)).to.equal(ethers.parseEther("700"));
            expect(await dlpToken.balanceOf(signers.user3.address)).to.equal(transferAmount);
            expect(await dlpToken.allowance(signers.user1.address, signers.user2.address)).to.equal(0);
        });

        it("Should revert transferFrom with insufficient allowance", async function () {
            const { dlpToken, signers } = await loadFixture(tokenFixtures.deployWithTokensFixture);
            await dlpToken.setVestingActive(false);
            const allowance = ethers.parseEther("100");
            const transferAmount = ethers.parseEther("300");

            // Approve user2 to transfer some tokens on behalf of user1
            await dlpToken.connect(signers.user1).approve(signers.user2.address, allowance);

            // User2 tries to transfer more than allowed
            await expect(
                dlpToken.connect(signers.user2).transferFrom(signers.user1.address, signers.user3.address, transferAmount)
            ).to.be.reverted;
        });

        it("Should update allowance correctly after transferFrom with infinite approval", async function () {
            const { dlpToken, signers } = await loadFixture(tokenFixtures.deployWithTokensFixture);
            await dlpToken.setVestingActive(false);
            const maxUint256 = ethers.MaxUint256;
            const transferAmount = ethers.parseEther("300");

            // Approve user2 to transfer unlimited tokens on behalf of user1
            await dlpToken.connect(signers.user1).approve(signers.user2.address, maxUint256);

            // User2 transfers tokens from user1 to user3
            await dlpToken.connect(signers.user2).transferFrom(signers.user1.address, signers.user3.address, transferAmount);

            // Check that allowance remains unlimited
            expect(await dlpToken.allowance(signers.user1.address, signers.user2.address)).to.equal(maxUint256);
        });

        it("Should approve and change allowance correctly", async function () {
            const { dlpToken, signers } = await loadFixture(tokenFixtures.deployWithTokensFixture);

            const initialAllowance = ethers.parseEther("100");
            const newAllowance = ethers.parseEther("150");

            // Set initial allowance
            await dlpToken.connect(signers.user1).approve(signers.user2.address, initialAllowance);
            expect(await dlpToken.allowance(signers.user1.address, signers.user2.address)).to.equal(initialAllowance);

            // Change to a higher allowance
            await dlpToken.connect(signers.user1).approve(signers.user2.address, newAllowance);
            expect(await dlpToken.allowance(signers.user1.address, signers.user2.address)).to.equal(newAllowance);

            // Change to a lower allowance
            const lowerAllowance = ethers.parseEther("50");
            await dlpToken.connect(signers.user1).approve(signers.user2.address, lowerAllowance);
            expect(await dlpToken.allowance(signers.user1.address, signers.user2.address)).to.equal(lowerAllowance);
        });

        it("Should manage allowances correctly", async function () {
            const { dlpToken, signers } = await loadFixture(tokenFixtures.deployWithTokensFixture);

            const initialAllowance = ethers.parseEther("100");

            // Set initial allowance
            await dlpToken.connect(signers.user1).approve(signers.user2.address, initialAllowance);
            expect(await dlpToken.allowance(signers.user1.address, signers.user2.address)).to.equal(initialAllowance);

            // Zero out allowance
            await dlpToken.connect(signers.user1).approve(signers.user2.address, 0);
            expect(await dlpToken.allowance(signers.user1.address, signers.user2.address)).to.equal(0);

            // Set it to a non-zero value again
            await dlpToken.connect(signers.user1).approve(signers.user2.address, initialAllowance);
            expect(await dlpToken.allowance(signers.user1.address, signers.user2.address)).to.equal(initialAllowance);
        });

    });

    describe("Transfer Vesting Enforcement", function () {
        it("Should allow transfer if vesting is not active", async function () {
            const { dlpToken, mockVesting, signers } = await loadFixture(tokenFixtures.deployWithMockVestingFixture);

            await dlpToken.setVestingActive(false);
            await mockVesting.setAllow(true);

            // Mint tokens to user1
            await dlpToken.connect(signers.minter).mint(signers.user1.address, ethers.parseEther("1000"));

            await expect(
                dlpToken.connect(signers.user1).transfer(signers.user2.address, ethers.parseEther("1000"))
            ).to.not.be.reverted;

            expect(await dlpToken.balanceOf(signers.user2.address)).to.equal(ethers.parseEther("1000"));
        });

        it("Should not call vestingContract.recordTransfer when vesting is inactive", async function () {
            const { dlpToken, vestingContract, signers } = await loadFixture(tokenFixtures.deployWithTokensFixture);

            await dlpToken.setVestingActive(false);
            const transferAmount = ethers.parseEther("100");

            const tx = await dlpToken.connect(signers.user1).transfer(signers.user2.address, transferAmount);
            const receipt = await tx.wait();

            const transferRecordedEvent = receipt.logs.find(
                log => log.address === vestingContract.target && log.fragment?.name === "TransferRecorded"
            );

            expect(transferRecordedEvent).to.be.undefined;
        });

        it("Should allow transfer if vesting conditions are met", async function () {
            const { dlpToken, mockVesting, signers } = await loadFixture(tokenFixtures.deployWithMockVestingFixture);

            const transferAmount = ethers.parseEther("100");

            await expect(
                dlpToken.connect(signers.user1).transfer(signers.user2.address, transferAmount)
            ).to.not.be.reverted;

            expect(await dlpToken.balanceOf(signers.user2.address)).to.equal(transferAmount);
        });

        it("Should revert transfer if vesting conditions are not met", async function () {
            const { dlpToken, mockVesting, signers } = await loadFixture(tokenFixtures.deployWithMockVestingFixture);

            // Mock vestingContract.isTransferAllowed to return false
            await mockVesting.setAllow(false);

            // Mint tokens to user1
            await dlpToken.connect(signers.minter).mint(signers.user1.address, ethers.parseEther("1000"));

            await expect(
                dlpToken.connect(signers.user1).transfer(signers.user2.address, ethers.parseEther("500"))
            ).to.be.revertedWithCustomError(dlpToken, "TokensNotVested");
        });

        it("Should call vestingContract.recordTransfer on successful transfer with vesting active", async function () {
            const { dlpToken, signers } = await loadFixture(tokenFixtures.deployWithTokensFixture);

            // Mock vestingContract.isTransferAllowed to return true
            const MockVestingContract = await ethers.getContractFactory("MockVestingContract");
            const mockVesting = await MockVestingContract.deploy();
            await mockVesting.waitForDeployment();
            await dlpToken.setVestingContract(mockVesting.target);

            const transferAmount = ethers.parseEther("100");

            const tx = await dlpToken.connect(signers.user1).transfer(signers.user2.address, transferAmount);
            const receipt = await tx.wait();

            // Get the event signature hash for TransferRecorded
            const transferRecordedEventSignature = ethers.keccak256(ethers.toUtf8Bytes("TransferRecorded(address,address,uint256)"));

            // Check if the event was emitted
            const transferRecordedEvent = receipt.logs.find(
                log => log.address === mockVesting.target && log.topics[0] === transferRecordedEventSignature
            );

            expect(transferRecordedEvent).to.exist;
        });

        it("Should handle transfers to and from empty addresses properly", async function () {
            const { dlpToken, signers } = await loadFixture(tokenFixtures.deployWithTokensFixture);
            // This test ensures that the contract correctly handles transfers involving the zero address

            // Minting (transfer from zero address) should work even with vesting active
            const mintAmount = ethers.parseEther("100");

            await expect(
                dlpToken.connect(signers.minter).mint(signers.user1.address, mintAmount)
            ).to.not.be.reverted;

            // Direct transfer to zero address should revert (ERC20 standard behavior)
            await expect(
                dlpToken.connect(signers.user1).transfer(ethers.ZeroAddress, ethers.parseEther("50"))
            ).to.be.reverted;

            // Burning (transfer to zero address) should work even with vesting active
            await expect(
                dlpToken.connect(signers.user1).burn(ethers.parseEther("50"))
            ).to.not.be.reverted;
        });

    });

    describe("Admin Functions", function () {
        describe("setMinter", function () {
            it("Should allow DEFAULT_ADMIN_ROLE to set a new minter address", async function () {
                const { dlpToken, signers } = await loadFixture(tokenFixtures.deployWithTokensFixture);

                await dlpToken.connect(signers.admin).setMinter(signers.user1.address);
                expect(await dlpToken.minterAddress()).to.equal(signers.user1.address);

                // Verify the new minter can mint
                await dlpToken.connect(signers.user1).mint(signers.user2.address, ethers.parseEther("100"));
                expect(await dlpToken.balanceOf(signers.user2.address)).to.equal(ethers.parseEther("100"));

                // Verify the old minter cannot mint
                await expect(
                    dlpToken.connect(signers.minter).mint(signers.user2.address, ethers.parseEther("100"))
                ).to.be.revertedWith("DLPToken: Only minter can call this function");
            });

            it("Should allow setting minter to zero address (effectively disabling minting)", async function () {
                const { dlpToken, signers } = await loadFixture(tokenFixtures.deployWithTokensFixture);

                await dlpToken.connect(signers.admin).setMinter(ethers.ZeroAddress);
                expect(await dlpToken.minterAddress()).to.equal(ethers.ZeroAddress);

                // Verify no one can mint now
                await expect(
                    dlpToken.connect(signers.minter).mint(signers.user2.address, ethers.parseEther("100"))
                ).to.be.revertedWith("DLPToken: Only minter can call this function");

                await expect(
                    dlpToken.connect(signers.admin).mint(signers.user2.address, ethers.parseEther("100"))
                ).to.be.revertedWith("DLPToken: Only minter can call this function");
            });

            it("Should revert if non-admin tries to set minter address", async function () {
                const { dlpToken, signers } = await loadFixture(tokenFixtures.deployWithTokensFixture);

                await expect(
                    dlpToken.connect(signers.user1).setMinter(signers.user2.address)
                ).to.be.revertedWithCustomError(dlpToken, "AccessControlUnauthorizedAccount");
            });
        });

        describe("setVestingActive", function () {
            it("Should allow DEFAULT_ADMIN_ROLE to set vesting active status", async function () {
                const { dlpToken, signers } = await loadFixture(tokenFixtures.deployWithTokensFixture);

                await dlpToken.connect(signers.admin).setVestingActive(false);
                expect(await dlpToken.isVestingActive()).to.be.false;

                await dlpToken.connect(signers.admin).setVestingActive(true);
                expect(await dlpToken.isVestingActive()).to.be.true;
            });

            it("Should emit VestingActiveUpdated event with correct parameter", async function () {
                const { dlpToken, signers } = await loadFixture(tokenFixtures.deployWithTokensFixture);

                await expect(dlpToken.connect(signers.admin).setVestingActive(false))
                    .to.emit(dlpToken, "VestingActiveUpdated")
                    .withArgs(false);

                await expect(dlpToken.connect(signers.admin).setVestingActive(true))
                    .to.emit(dlpToken, "VestingActiveUpdated")
                    .withArgs(true);
            });

            it("Should not emit event if vesting active status is unchanged", async function () {
                const { dlpToken, signers } = await loadFixture(tokenFixtures.deployWithTokensFixture);

                // First set to false
                await dlpToken.connect(signers.admin).setVestingActive(false);

                // Then set to false again - should not emit event
                const tx = await dlpToken.connect(signers.admin).setVestingActive(false);
                const receipt = await tx.wait();

                // Check if VestingActiveUpdated was emitted
                const vestingActiveUpdatedEvent = receipt.logs.find(
                    log => log.address === dlpToken.target && log.fragment?.name === "VestingActiveUpdated"
                );

                // Expect no event since status is unchanged
                expect(vestingActiveUpdatedEvent).to.be.undefined;
            });

            it("Should revert if non-admin tries to set vesting active status", async function () {
                const { dlpToken, signers } = await loadFixture(tokenFixtures.deployWithTokensFixture);

                await expect(
                    dlpToken.connect(signers.user1).setVestingActive(false)
                ).to.be.revertedWithCustomError(dlpToken, "AccessControlUnauthorizedAccount");
            });
        });

        describe("setVestingContract", function () {
            it("Should allow DEFAULT_ADMIN_ROLE to set a new vesting contract address", async function () {
                const { dlpToken, vestingContract, signers } = await loadFixture(tokenFixtures.deployDLPTokenFixture);

                await dlpToken.connect(signers.admin).setVestingContract(vestingContract.target);
                expect(await dlpToken.vestingContract()).to.equal(vestingContract.target);
            });

            it("Should allow setting vesting contract to zero address (emergency option)", async function () {
                const { dlpToken, signers } = await loadFixture(tokenFixtures.deployDLPTokenFixture);

                await dlpToken.connect(signers.admin).setVestingContract(ethers.ZeroAddress);
                expect(await dlpToken.vestingContract()).to.equal(ethers.ZeroAddress);

                // Note: This would likely break functionality requiring the vesting contract,
                // but could be an emergency option or used in migration scenarios
            });

            it("Should revert if non-admin tries to set vesting contract address", async function () {
                const { dlpToken, vestingContract, signers } = await loadFixture(tokenFixtures.deployDLPTokenFixture);

                await expect(
                    dlpToken.connect(signers.user1).setVestingContract(vestingContract.target)
                ).to.be.revertedWithCustomError(dlpToken, "AccessControlUnauthorizedAccount");
            });
        });

        describe("Multiple admin actions", function () {
            it("Should handle a sequence of administrative actions correctly", async function () {
                const { dlpToken, mockVesting, signers } = await loadFixture(tokenFixtures.deployWithMockVestingFixture);

                // Initial state
                expect(await dlpToken.minterAddress()).to.equal(signers.minter.address);
                expect(await dlpToken.isVestingActive()).to.be.true;
                expect(await dlpToken.vestingContract()).to.equal(mockVesting.target);

                // Change minter to user1
                await dlpToken.connect(signers.admin).setMinter(signers.user1.address);
                expect(await dlpToken.minterAddress()).to.equal(signers.user1.address);

                // Mint with new minter
                await dlpToken.connect(signers.user1).mint(signers.user2.address, ethers.parseEther("100"));
                expect(await dlpToken.balanceOf(signers.user2.address)).to.equal(ethers.parseEther("100"));

                // Disable vesting
                await dlpToken.connect(signers.admin).setVestingActive(false);
                expect(await dlpToken.isVestingActive()).to.be.false;
                await mockVesting.setAllow(false);

                // Transfer should now work without vesting check
                await dlpToken.connect(signers.user2).transfer(signers.user3.address, ethers.parseEther("50"));
                expect(await dlpToken.balanceOf(signers.user3.address)).to.equal(ethers.parseEther("50"));

                // Set vesting active again
                await dlpToken.connect(signers.admin).setVestingActive(true);
                await mockVesting.setAllow(false); // Allow transfer

                // Transfer should still revert (vesting check fails)
                await expect(dlpToken.connect(signers.user2).transfer(signers.user3.address, ethers.parseEther("50"))).to.be.reverted;

                // Disable transfer check and transaction should not revert
                await mockVesting.setAllow(true);
                await dlpToken.connect(signers.user2).transfer(signers.user3.address, ethers.parseEther("50"));

                // Set vesting back to inactive
                await dlpToken.connect(signers.admin).setVestingActive(false);

                // Deploy and set new vesting contract
                const { proxy: newVestingContract } = await deployUUPSProxyFixture(
                    "UniversalVesting",
                    [],
                    { initializer: 'initialize' }
                );

                await newVestingContract.waitForDeployment();
                await dlpToken.connect(signers.admin).setVestingContract(newVestingContract.target);
                expect(await dlpToken.vestingContract()).to.equal(newVestingContract.target);

                // Ensure vesting is still active (should be carried over from previous state)
                expect(await dlpToken.isVestingActive()).to.be.false;
            });
        });
    });



    describe("Edge Cases and Security", function () {
        it("Should handle zero value transfers correctly", async function () {
            const { dlpToken, mockVesting, signers } = await loadFixture(tokenFixtures.deployWithMockVestingFixture);

            // Mint tokens to user1
            await dlpToken.connect(signers.minter).mint(signers.user1.address, ethers.parseEther("1000"));
            const initialBalance = await dlpToken.balanceOf(signers.user1.address);

            // Disable vesting check
            await mockVesting.setAllow(true);

            // Zero value transfers should work even with vesting active
            await expect(
                dlpToken.connect(signers.user1).transfer(signers.user2.address, 0)
            ).to.not.be.reverted;

            expect(await dlpToken.balanceOf(signers.user1.address)).to.equal(initialBalance);
            expect(await dlpToken.balanceOf(signers.user2.address)).to.equal(0);
        });

        it("Should prevent approval to the zero address", async function () {
            const { dlpToken, signers } = await loadFixture(tokenFixtures.deployWithTokensFixture);

            await expect(
                dlpToken.connect(signers.user1).approve(ethers.ZeroAddress, ethers.parseEther("100"))
            ).to.be.reverted;
        });

        it("Should handle self-transfers correctly", async function () {
            const { dlpToken, signers } = await loadFixture(tokenFixtures.deployWithTokensFixture);

            // Self-transfers should work
            await dlpToken.setVestingActive(false); // Disable vesting for this test

            const initialBalance = await dlpToken.balanceOf(signers.user1.address);
            await dlpToken.connect(signers.user1).transfer(signers.user1.address, ethers.parseEther("100"));

            // Balance should remain unchanged
            expect(await dlpToken.balanceOf(signers.user1.address)).to.equal(initialBalance);
        });
    });

    describe("ERC20 Standard Compliance", function () {
        it("Should implement the ERC20 interface correctly", async function () {
            const { dlpToken } = await loadFixture(tokenFixtures.deployDLPTokenFixture);

            // Check standard ERC20 functions
            expect(typeof dlpToken.name).to.equal('function');
            expect(typeof dlpToken.symbol).to.equal('function');
            expect(typeof dlpToken.decimals).to.equal('function');
            expect(typeof dlpToken.totalSupply).to.equal('function');
            expect(typeof dlpToken.balanceOf).to.equal('function');
            expect(typeof dlpToken.transfer).to.equal('function');
            expect(typeof dlpToken.allowance).to.equal('function');
            expect(typeof dlpToken.approve).to.equal('function');
            expect(typeof dlpToken.transferFrom).to.equal('function');
        });

        it("Should implement ERC20 events correctly", async function () {
            const { dlpToken, signers } = await loadFixture(tokenFixtures.deployWithTokensFixture);

            // Check Transfer event
            await dlpToken.setVestingActive(false); // Disable vesting for this test

            const transferTx = await dlpToken.connect(signers.user1).transfer(signers.user2.address, ethers.parseEther("100"));
            const transferReceipt = await transferTx.wait();

            const transferEventSignature = ethers.keccak256(ethers.toUtf8Bytes("Transfer(address,address,uint256)"));
            const transferEvent = transferReceipt.logs.find(
                log => log.address === dlpToken.target && log.topics[0] === transferEventSignature
            );

            expect(transferEvent).to.exist;

            // Check Approval event
            const approveTx = await dlpToken.connect(signers.user1).approve(signers.user2.address, ethers.parseEther("100"));
            const approveReceipt = await approveTx.wait();

            const approvalEventSignature = ethers.keccak256(ethers.toUtf8Bytes("Approval(address,address,uint256)"));
            const approvalEvent = approveReceipt.logs.find(
                log => log.address === dlpToken.target && log.topics[0] === approvalEventSignature
            );

            expect(approvalEvent).to.exist;
        });
    });
});