// Test file: test/PricingLibrary.test.js

const { expect } = require("chai");
const { ethers } = require("hardhat");

// Convert decimal to BigNumber with 18 decimals
function toBN(value) {
    return ethers.parseUnits(value.toString(), 18);
}

// Format BigNumber to decimal for readability
function fromBN(bn) {
    return ethers.formatUnits(bn, 18);
}

// Helper for creating config objects
function createConfig(
    initialPrice,
    totalSupply,
    remainingSupply,
    alphaParameter,
    premiumIntensityK,
    betaParameter
) {
    return {
        initialPrice,
        totalSupply,
        remainingSupply,
        alphaParameter,
        premiumIntensityK,
        betaParameter,
    };
}

// Base configuration for tests
function getBaseConfig() {
    const initialPrice = toBN(0.0001); // 0.0001 ETH per token
    const totalSupply = toBN(10000000); // 10M tokens
    return createConfig(
        initialPrice,
        totalSupply,
        totalSupply / 2n, // remaining = total
        -1, // alpha = -1
        10, // k = 10
        toBN(50)  // beta = 50%
    );
}

describe("PricingLibrary", function () {
    let PricingLibrary;
    let pricingLib;
    let TestPricingLibrary; // Test wrapper contract
    let testLib;
    let owner;

    beforeEach(async function () {
        [owner] = await ethers.getSigners();

        // Deploy the pricing library
        PricingLibrary = await ethers.getContractFactory("PricingMath");
        pricingLib = await PricingLibrary.deploy();
        await pricingLib.waitForDeployment();

        // Deploy test wrapper contract to expose library functions
        TestPricingLibrary = await ethers.getContractFactory("TestPricingLibrary");
        testLib = await TestPricingLibrary.deploy();
        await testLib.waitForDeployment();
    });

    describe("Base Price Calculation", function () {
        it("should return initial price when remaining supply equals total supply", async function () {
            const initialPrice = toBN(0.0001); // 0.0001 ETH per token
            const totalSupply = toBN(10000000); // 10M tokens

            const config = createConfig(
                initialPrice,
                totalSupply,
                totalSupply, // remaining = total
                -1, // alpha = -1
                10, // k = 10
                toBN(70)  // beta = 70%
            );

            const basePrice = await testLib.calculateBasePrice(config);

            // Should equal initial price
            expect(basePrice).to.equal(initialPrice); // 0.1% tolerance
        });

        it("should increase price correctly with negative alpha when supply decreases", async function () {
            const initialPrice = toBN(0.0001);
            const totalSupply = toBN(10000000);
            const halfSupply = totalSupply / 2n;

            const config = createConfig(
                initialPrice,
                totalSupply,
                halfSupply, // 50% remaining
                -1, // alpha = -1
                10,
                toBN(70)
            );

            const basePrice = await testLib.calculateBasePrice(config);

            // With alpha = -1 and 50% remaining, price should double
            expect(basePrice).to.equal(initialPrice * 2n);
        });

        it("should handle alpha = -2 correctly", async function () {
            const initialPrice = toBN(0.0001);
            const totalSupply = toBN(10000000);
            const halfSupply = totalSupply / 2n;

            const config = createConfig(
                initialPrice,
                totalSupply,
                halfSupply, // 50% remaining
                -2, // alpha = -2
                10,
                toBN(70)
            );

            const basePrice = await testLib.calculateBasePrice(config);

            // With alpha = -2 and 50% remaining, price should quadruple
            expect(basePrice).to.equal(initialPrice * 4n);
        });

        it("should handle very low remaining supply correctly", async function () {
            const initialPrice = toBN(0.0001);
            const totalSupply = toBN(10000000);
            const lowSupply = totalSupply / 100n; // 1% remaining

            const config = createConfig(
                initialPrice,
                totalSupply,
                lowSupply,
                -1,
                10,
                toBN(70)
            );

            const basePrice = await testLib.calculateBasePrice(config);

            // With alpha = -1 and 1% remaining, price should be 100x initial
            expect(basePrice).to.equal(initialPrice * 100n);
        });

        it("should revert when remaining supply is zero", async function () {
            const config = createConfig(
                toBN(0.0001),
                toBN(10000000),
                toBN(0), // 0 remaining
                -1,
                10,
                toBN(70)
            );

            await expect(testLib.calculateBasePrice(config)).to.be.reverted;
        });

        it("should handle positive alpha correctly", async function () {
            const initialPrice = toBN(0.0001);
            const totalSupply = toBN(10000000);
            const halfSupply = totalSupply / 2n;

            const config = createConfig(
                initialPrice,
                totalSupply,
                halfSupply,
                1, // positive alpha = 1
                10,
                toBN(70)
            );

            const basePrice = await testLib.calculateBasePrice(config);

            // With alpha = 1 and 50% remaining, price should be half
            expect(basePrice).to.be.closeTo(
                initialPrice / 2n,
                initialPrice / 2n / 100n // Allow 1% error
            );
        });
    });

    describe("Premium Calculation", function () {
        it("should handle a 0 k value", async function () {
            const config = {
                ...getBaseConfig(),
                premiumIntensityK: 0n,
            };

            const premium = await testLib.calculatePremium(config, 100000);

            expect(premium).to.equal(toBN(1));
        })

        it("should return 1.0 when amount is zero", async function () {
            const config = createConfig(
                toBN(0.0001),
                toBN(10000000),
                toBN(5000000),
                -1,
                10,
                toBN(70)
            );

            const premium = await testLib.calculatePremium(config, 0);

            // 1.0 represented as 1e18
            expect(premium).to.equal(toBN(1));
        });

        it("should return 1.0 when amount is negligible", async function () {
            const totalSupply = toBN(10000000);
            const initialPrice = toBN(0.0001);

            const config = createConfig(
                initialPrice,
                totalSupply,
                toBN(5000000),
                -1,
                10,
                toBN(70)
            );

            const premium = await testLib.calculatePremium(config, 100000);

            expect(premium).to.equal(toBN(1));

            // Test when all supply availalbe
            const config2 = createConfig(
                initialPrice,
                totalSupply,
                totalSupply,
                -1,
                10,
                toBN(70)
            );

            const premium2 = await testLib.calculatePremium(config, 100000);

            expect(premium2).to.equal(toBN(1));
        });

        it("should calculate correct premium for 1% purchase", async function () {
            const totalSupply = toBN(10000000);
            const config = createConfig(
                toBN(0.0001),
                totalSupply,
                totalSupply, // Full supply remaining
                -1,
                10, // k = 10
                toBN(70) // beta = 70%
            );

            // Purchase 1% of effective supply
            const purchaseAmount = totalSupply / 100n;

            const premium = await testLib.calculatePremium(config, purchaseAmount);

            // For 1% with k=10, premium should be approximately 1.105 (exp(0.1) ≈ 1.105)
            expect(premium).to.be.closeTo(
                toBN(1.105),
                toBN(0.01) // Allow small error
            );
        });

        it("should calculate correct premium for 5% purchase", async function () {
            const totalSupply = toBN(10000000);
            const config = createConfig(
                toBN(0.0001),
                totalSupply,
                totalSupply,
                -1,
                10,
                toBN(70)
            );

            // Purchase 5% of effective supply
            const purchaseAmount = totalSupply / 20n;

            const premium = await testLib.calculatePremium(config, purchaseAmount);

            // For 5% with k=10, premium should be approximately 1.65 (exp(0.5) ≈ 1.65)
            expect(premium).to.be.closeTo(
                toBN(1.65),
                toBN(0.05) // Allow small error due to approx
            );
        });

        it("should calculate correct premium for 10% purchase", async function () {
            const totalSupply = toBN(10000000);
            const config = createConfig(
                toBN(0.0001),
                totalSupply,
                totalSupply,
                -1,
                10,
                toBN(70)
            );

            // Purchase 10% of effective supply
            const purchaseAmount = totalSupply / 10n;

            const premium = await testLib.calculatePremium(config, purchaseAmount);

            // For 10% with k=10, premium should be approximately 2.72 (exp(1) ≈ 2.72)
            expect(premium).to.be.closeTo(
                toBN(2.72),
                toBN(0.1) // Allow error due to approx
            );
        });

        it("should calculate higher premium with higher k value", async function () {
            const totalSupply = toBN(10000000);
            const config1 = createConfig(
                toBN(0.0001),
                totalSupply,
                totalSupply,
                -1,
                10, // k = 10
                toBN(70)
            );

            const config2 = createConfig(
                toBN(0.0001),
                totalSupply,
                totalSupply,
                -1,
                15, // k = 15 (higher)
                toBN(70)
            );

            const purchaseAmount = totalSupply / 20n;

            const premium1 = await testLib.calculatePremium(config1, purchaseAmount);
            const premium2 = await testLib.calculatePremium(config2, purchaseAmount);

            // Higher k should result in higher premium
            expect(premium2).to.be.gt(premium1);
        });

        it("should calculate premium based on effective supply with beta parameter", async function () {
            const totalSupply = toBN(10000000);
            const halfSupply = totalSupply / 2n;

            // With beta = 100, only remaining supply matters
            const config1 = createConfig(
                toBN(0.0001),
                totalSupply,
                halfSupply, // 50% remaining
                -1,
                10,
                toBN(100) // beta = 100%
            );

            // With beta = 0, only total supply matters
            const config2 = createConfig(
                toBN(0.0001),
                totalSupply,
                halfSupply, // 50% remaining
                -1,
                10,
                0 // beta = 0%
            );

            // 5% of total supply
            const purchaseAmount = totalSupply / 20n;

            const premium1 = await testLib.calculatePremium(config1, purchaseAmount);
            const premium2 = await testLib.calculatePremium(config2, purchaseAmount);

            expect(premium1).to.be.gt(premium2);
        });

        it("should increase premium as remaining supply decreases", async function () {
            const totalSupply = toBN(10000000);
            const halfSupply = totalSupply / 2n;
            const quarterSupply = totalSupply / 4n;

            // With beta = 100, only remaining supply matters
            const config1 = createConfig(
                toBN(0.0001),
                totalSupply,
                halfSupply, // 50% remaining
                -1,
                10,
                toBN(50) // beta = 100%
            );

            const config2 = createConfig(
                toBN(0.0001),
                totalSupply,
                quarterSupply,
                -1,
                10,
                toBN(50) // beta = 100%
            );


            // 1% of total supply
            const purchaseAmount = totalSupply / 100n;

            const premium1 = await testLib.calculatePremium(config1, purchaseAmount);
            const premium2 = await testLib.calculatePremium(config2, purchaseAmount);

            expect(premium1).to.be.lt(premium2);
        });

        it("should increase premium as purchase size increases", async function () {
            const totalSupply = toBN(10000000);
            const halfSupply = totalSupply / 2n;
            const quarterSupply = totalSupply / 4n;

            const config1 = createConfig(
                toBN(0.0001),
                totalSupply,
                halfSupply, // 50% remaining
                -1,
                10,
                toBN(50)
            );

            const config2 = createConfig(
                toBN(0.0001),
                totalSupply,
                quarterSupply,
                -1,
                10,
                toBN(50)
            );

            const config3 = createConfig(
                toBN(0.0001),
                totalSupply,
                halfSupply, // 50% remaining
                -1,
                10,
                toBN(0)
            );

            const config4 = createConfig(
                toBN(0.0001),
                totalSupply,
                quarterSupply,
                -1,
                10,
                toBN(0)
            );

            const config5 = createConfig(
                toBN(0.0001),
                totalSupply,
                halfSupply, // 50% remaining
                -1,
                10,
                toBN(100)
            );

            const config6 = createConfig(
                toBN(0.0001),
                totalSupply,
                quarterSupply,
                -1,
                10,
                toBN(1000)
            );

            // 1% of total supply
            const purchaseAmount = totalSupply / 100n;

            const premium1 = await testLib.calculatePremium(config1, purchaseAmount);
            const premium2 = await testLib.calculatePremium(config2, purchaseAmount * 2n);
            const premium3 = await testLib.calculatePremium(config3, purchaseAmount);
            const premium4 = await testLib.calculatePremium(config4, purchaseAmount * 2n);
            const premium5 = await testLib.calculatePremium(config5, purchaseAmount);
            const premium6 = await testLib.calculatePremium(config5, purchaseAmount * 2n);

            expect(premium1).to.be.lt(premium2);
            expect(premium3).to.be.lt(premium4);
            expect(premium5).to.be.lt(premium6);
        });
    });

    describe("Total Cost Calculation", function () {
        it("should calculate correct total cost for a purchase", async function () {
            const initialPrice = toBN(0.0001);
            const totalSupply = toBN(10000000);
            const config = createConfig(
                initialPrice,
                totalSupply,
                totalSupply,
                -1,
                10,
                toBN(70)
            );

            // Purchase 1% of supply
            const purchaseAmount = totalSupply / 100n;

            const result = await testLib.calculateTotalCost(config, purchaseAmount);

            // Parse results
            const basePrice = result[0];
            const premium = result[1];
            const baseCost = result[2];
            const finalCost = result[3];

            // Verify base cost calculation
            const expectedBaseCost = basePrice * purchaseAmount / toBN(1);
            expect(baseCost).to.be.closeTo(
                expectedBaseCost,
                expectedBaseCost / 1000n // Allow small error
            );

            // Verify final cost includes premium
            const expectedFinalCost = baseCost * premium / toBN(1);
            expect(finalCost).to.be.closeTo(
                expectedFinalCost,
                expectedFinalCost / 1000n // Allow small error
            );

            // Verify final cost is greater than base cost
            expect(finalCost).to.be.gt(baseCost);
        });

        it("should return zero cost when amount is zero", async function () {
            const config = createConfig(
                toBN(0.0001),
                toBN(10000000),
                toBN(10000000),
                -1,
                10,
                toBN(70)
            );

            const result = await testLib.calculateTotalCost(config, 0);

            // Final cost should be zero
            expect(result[3]).to.equal(0);
        });
    });

    describe("Exponential Approximation", function () {
        it("should calculate e^1 accurately", async function () {
            const result = await testLib.exponentialApprox(toBN(1));

            // e^1 ≈ 2.718
            expect(result).to.be.closeTo(
                toBN(2.718),
                toBN(0.01) // Allow small error
            );
        });

        it("should calculate e^0 as 1", async function () {
            const result = await testLib.exponentialApprox(toBN(0));

            // e^0 = 1
            expect(result).to.be.closeTo(
                toBN(1),
                toBN(0.001) // Allow tiny error
            );
        });

        it("should handle large inputs safely", async function () {
            // Test with a large value that won't cause overflow
            const result = await testLib.exponentialApprox(toBN(10));

            // e^10 ≈ 22026
            expect(result).to.be.gt(toBN(20000));
            expect(result).to.be.lt(toBN(25000));
        });
    });


    // Additional tests to add to the test file

    describe("Whitepaper Examples", function () {
        it("should match whitepaper examples for premium calculations", async function () {
            const totalSupply = toBN(10000000);
            const config = createConfig(
                toBN(0.0001),
                totalSupply,
                totalSupply,
                -1,
                10,
                toBN(70)
            );

            // Example 1: 1% purchase (6,500 tokens)
            const purchase1 = totalSupply / 100n;
            const premium1 = await testLib.calculatePremium(config, purchase1);

            expect(premium1).to.be.closeTo(toBN(1.105), toBN(0.01));

            // Example 2: 5% purchase (32,500 tokens)
            const purchase2 = totalSupply / 20n; // updated from multiplication to division for 5%
            const premium2 = await testLib.calculatePremium(config, purchase2);
            expect(premium2).to.be.closeTo(toBN("1.649"), toBN(0.02));

            // Example 3: 10% purchase (65,000 tokens)
            const purchase3 = totalSupply / 10n; // updated from multiplication to division for 10%
            const premium3 = await testLib.calculatePremium(config, purchase3);
            expect(premium3).to.be.closeTo(toBN("2.718"), toBN(0.05));

            // Example 4: 20% purchase (130,000 tokens)
            const purchase4 = totalSupply / 5n; // updated from multiplication to division for 20%
            const premium4 = await testLib.calculatePremium(config, purchase4);
            expect(premium4).to.be.closeTo(toBN("7.03"), toBN(0.5));
        });

        it("should demonstrate premium effectiveness for large purchases", async function () {
            const totalSupply = toBN(10000000);
            const config = createConfig(
                toBN(0.0001),
                totalSupply,
                totalSupply,
                -1,
                10,
                toBN(50)
            );

            // 10% purchase
            const purchase1 = totalSupply / 10n;
            const premium1 = await testLib.calculatePremium(config, purchase1);

            // 20% purchase
            const purchase2 = totalSupply / 5n;
            const premium2 = await testLib.calculatePremium(config, purchase2);

            // 30% purchase
            const purchase3 = totalSupply * 30n / 100n;
            const premium3 = await testLib.calculatePremium(config, purchase3);

            // Verify exponential growth
            expect(premium2 * 100000n / premium1).to.be.gt(2n * 100000n); // More than 2x increase
            expect(premium3 * 100000n / premium2).to.be.gt(2n * 100000n); // More than 2x increase again
        });
    });

    describe("Parameter Sensitivity", function () {
        it("should demonstrate effect of different alpha values", async function () {
            const initialPrice = toBN(0.0001);
            const totalSupply = toBN(10000000);
            const halfSupply = totalSupply / 2n;

            // Alpha = -0.5
            const config1 = createConfig(
                initialPrice,
                totalSupply,
                halfSupply,
                -1, // α = -1
                10,
                toBN(70)
            );

            // Alpha = -1
            const config2 = createConfig(
                initialPrice,
                totalSupply,
                halfSupply,
                -2, // α = -2
                10,
                toBN(70)
            );

            // Alpha = -2
            const config3 = createConfig(
                initialPrice,
                totalSupply,
                halfSupply,
                -3, // α = -3
                10,
                toBN(70)
            );

            const price1 = await testLib.calculateBasePrice(config1);
            const price2 = await testLib.calculateBasePrice(config2);
            const price3 = await testLib.calculateBasePrice(config3);

            // Verify steeper alpha causes more aggressive price increases
            expect(price2).to.be.gt(price1);
            expect(price3).to.be.gt(price2);

            // Specific expectations based on power function
            // α = -1: price should double (2x) when supply halves
            expect(price1).to.be.closeTo(initialPrice * 2n, initialPrice / 50n);

            // α = -2: price should quadruple (4x) when supply halves
            expect(price2).to.be.closeTo(initialPrice * 4n, initialPrice / 25n);

            // α = -3: price should increase by 8x when supply halves
            expect(price3).to.be.closeTo(initialPrice * 8n, initialPrice * 8n / 100n);
        });

        it("should demonstrate effect of different beta values", async function () {
            const totalSupply = toBN(10000000);
            const halfSupply = totalSupply / 2n;
            const purchaseAmount = totalSupply / 10n; // 10% of total

            // Beta = 0 (only total supply matters)
            const configBeta0 = createConfig(
                toBN(0.0001),
                totalSupply,
                halfSupply,
                -1,
                10,
                0
            );

            // Beta = 50 (balanced)
            const configBeta50 = createConfig(
                toBN(0.0001),
                totalSupply,
                halfSupply,
                -1,
                10,
                toBN(50)
            );

            // Beta = 100 (only remaining supply matters)
            const configBeta100 = createConfig(
                toBN(0.0001),
                totalSupply,
                halfSupply,
                -1,
                10,
                toBN(100)
            );

            const premium0 = await testLib.calculatePremium(configBeta0, purchaseAmount);
            const premium50 = await testLib.calculatePremium(configBeta50, purchaseAmount);
            const premium100 = await testLib.calculatePremium(configBeta100, purchaseAmount);

            // With beta = 0, the 10% purchase is relative to total supply
            // With beta = 100, the 10% purchase is relative to remaining supply (half)
            // so it's actually 20% of remaining

            // Premium should increase as beta increases in this scenario
            expect(premium50).to.be.gt(premium0);
            expect(premium100).to.be.gt(premium50);

            // With beta = 100, should be close to premium for 20% purchase of total supply
            const twentyPercentPurchase = totalSupply / 5n;
            const premium20ofTotal = await testLib.calculatePremium(configBeta0, twentyPercentPurchase);

            expect(premium100).to.be.closeTo(premium20ofTotal, premium20ofTotal / 10n);
        });

        it("should demonstrate effect of different k values", async function () {
            const totalSupply = toBN(10000000);
            const purchaseAmount = totalSupply / 20n; // 5% purchase for consistency

            // k = 5 (lower intensity)
            const configK5 = createConfig(
                toBN(0.0001),
                totalSupply,
                totalSupply,
                -1,
                5,
                toBN(70)
            );

            // k = 10 (medium intensity)
            const configK10 = createConfig(
                toBN(0.0001),
                totalSupply,
                totalSupply,
                -1,
                10,
                toBN(70)
            );

            // k = 15 (higher intensity)
            const configK15 = createConfig(
                toBN(0.0001),
                totalSupply,
                totalSupply,
                -1,
                15,
                toBN(70)
            );

            const premiumK5 = await testLib.calculatePremium(configK5, purchaseAmount);
            const premiumK10 = await testLib.calculatePremium(configK10, purchaseAmount);
            const premiumK15 = await testLib.calculatePremium(configK15, purchaseAmount);

            // Premium should increase with k
            expect(premiumK10).to.be.gt(premiumK5);
            expect(premiumK15).to.be.gt(premiumK10);

            // Theoretical values based on exp(k*0.05):
            // k=5: exp(0.25) ≈ 1.28
            // k=10: exp(0.5) ≈ 1.65
            // k=15: exp(0.75) ≈ 2.12

            expect(premiumK5).to.be.closeTo(toBN("1.28"), toBN(0.03));
            expect(premiumK10).to.be.closeTo(toBN("1.65"), toBN(0.05));
            expect(premiumK15).to.be.closeTo(toBN("2.12"), toBN(0.07));
        });
    });

    describe("Mathematical Edge Cases", function () {
        it("should handle zero remaining supply correctly", async function () {
            const config = createConfig(
                toBN(0.0001),
                toBN(10000000),
                toBN(0), // Zero remaining
                -1,
                10,
                70
            );

            await expect(testLib.calculateBasePrice(config)).to.be.reverted;
            await expect(testLib.calculateTotalCost(config, toBN(100))).to.be.reverted;
        });

        it("should handle very large purchases correctly", async function () {
            const totalSupply = toBN(10000000);
            const config = createConfig(
                toBN(0.0001),
                totalSupply,
                totalSupply,
                -1,
                10,
                70
            );

            // Attempt to purchase 50% of total supply
            const largeAmount = totalSupply / 2n;

            const premium = await testLib.calculatePremium(config, largeAmount);
            console.log(`Premium for 50% purchase: ${fromBN(premium)}`);

            // Should be a very large premium
            expect(premium).to.be.gt(toBN(100)); // Premium > 100x

            // Calculate total cost
            const result = await testLib.calculateTotalCost(config, largeAmount);
            const finalCost = result[3];

            // Ensure cost is proportionally high
            expect(finalCost).to.be.gt(toBN(0.0001) * 10000000n / 2n * 50n); // Much higher (50x) than base cost
        });

        it("should handle large alpha correctly", async function () {
            const config = {
                ...getBaseConfig(),
                alphaParameter: -100,
            };

            const price = await testLib.calculateBasePrice(config);

            expect(price).to.be.gt(0n);

            // Should revert on large exponent (overflow)
            const config2 = {
                ...getBaseConfig(),
                alphaParameter: -1000,
            };

            await expect(testLib.calculateBasePrice(config2)).to.be.reverted;
        })
    });

    describe("Token Quantity Calculations", async function () {
        it("returns 0 tokens for 0 currency amount", async function () {
            const config = getBaseConfig();
            const currencyAmount = toBN("0");
            const amount = await testLib.calculateTokensForCurrency(config, currencyAmount);
            expect(amount).to.equal(0);
        });

        it("returns 0 tokens when currency is insufficient for one token", async function () {
            const config = getBaseConfig();
            const [, , , costForOne] = await testLib.calculateTotalCost(config, 5000n);
            const currencyAmount = costForOne - 1n; // Just below cost of 1 smallest unit
            const amount = await testLib.calculateTokensForCurrency(config, currencyAmount);
            expect(amount).to.equal(0);
        });

        it("returns correct tokens for exact cost of one token", async function () {
            const config = getBaseConfig();
            const amountToBuy = toBN("1"); // 1 whole token
            const [, , , exactCost] = await testLib.calculateTotalCost(config, amountToBuy);
            const amount = await testLib.calculateTokensForCurrency(config, exactCost);
            const costReturned = (await testLib.calculateTotalCost(config, amount))[3];
            const costNext = (await testLib.calculateTotalCost(config, amount + 1n))[3];
            expect(costReturned).to.be.lte(exactCost);
            expect(costNext).to.be.gt(exactCost);
        });

        it("returns correct tokens for exact cost of multiple tokens", async function () {
            const config = getBaseConfig();
            const amountToBuy = toBN("100"); // 100 whole tokens
            const [, , , exactCost] = await testLib.calculateTotalCost(config, amountToBuy);
            const amount = await testLib.calculateTokensForCurrency(config, exactCost);
            expect(amount).to.be.approximately(amountToBuy, 5000n);
        });

        it("returns maximum tokens where finalCost <= currencyAmount", async function () {
            const config = getBaseConfig();
            const testCurrencyAmounts = [
                toBN(100),
                toBN("1"), // 1 ether
                toBN("10"), // 10 ether
                toBN("100"), // 100 ether
            ];

            for (const currencyAmount of testCurrencyAmounts) {
                const amount = await testLib.calculateTokensForCurrency(config, currencyAmount);
                const [, , , finalCost] = await testLib.calculateTotalCost(config, amount);
                expect(finalCost).to.be.lte(currencyAmount);

                if (amount < config.remainingSupply) {
                    const [, , , finalCostNext] = await testLib.calculateTotalCost(config, amount + 1n);
                    expect(finalCostNext).to.be.gt(currencyAmount);
                }
            }
        });

        it("returns remaining supply when currency amount is excessive", async function () {
            const config = getBaseConfig();
            const currencyAmount = toBN("1000000"); // 1M ether, more than enough
            const amount = await testLib.calculateTokensForCurrency(config, currencyAmount);
            expect(amount).to.equal(config.remainingSupply);
        });

        it("handles beta = 0 (premium based on total supply)", async function () {
            const config = {
                ...getBaseConfig(),
                betaParameter: 0n,
            };
            const currencyAmount = toBN(1);
            const amount = await testLib.calculateTokensForCurrency(config, currencyAmount);
            const [, , , finalCost] = await testLib.calculateTotalCost(config, amount);
            expect(finalCost).to.be.lte(currencyAmount);
            if (amount < config.remainingSupply) {
                const [, , , finalCostNext] = await testLib.calculateTotalCost(config, amount + 1n);
                expect(finalCostNext).to.be.gt(currencyAmount);
            }
        });

        it("handles beta = 100% (premium based on remaining supply)", async function () {
            const config = {
                ...getBaseConfig(),
                betaParameter: toBN(100),
            };
            const currencyAmount = toBN(1);
            const amount = await testLib.calculateTokensForCurrency(config, currencyAmount);
            const [, , , finalCost] = await testLib.calculateTotalCost(config, amount);
            expect(finalCost).to.be.lte(currencyAmount);
            if (amount < config.remainingSupply) {
                const [, , , finalCostNext] = await testLib.calculateTotalCost(config, amount + 1n);
                expect(finalCostNext).to.be.gt(currencyAmount);
            }
        });

        it("handles high premium intensity", async function () {
            const config = {
                ...getBaseConfig(),
                premiumIntensityK: 250, // High premium effect
            };
            const currencyAmount = toBN(10);
            const amount = await testLib.calculateTokensForCurrency(config, currencyAmount);
            const [, , , finalCost] = await testLib.calculateTotalCost(config, amount);
            expect(finalCost).to.be.lte(currencyAmount);
            if (amount < config.remainingSupply) {
                const [, , , finalCostNext] = await testLib.calculateTotalCost(config, amount + 1n);
                expect(finalCostNext).to.be.gt(currencyAmount);
            }

            const config2 = {
                ...getBaseConfig(),
                premiumIntensityK: 1000,
            };

            await expect(testLib.calculateTokensForCurrency(config2, currencyAmount)).to.be.reverted
        });
    })
});