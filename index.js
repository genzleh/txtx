const { ChainId, Fetcher, WETH, Route, Trade, TokenAmount, TradeType, Percent } = require("@uniswap/sdk");
const { erc20Abi } = require('./abi/ERC20_abi.json');
const ethers = require('ethers');
require('dotenv').config();

// Uniswap 
const uniswap_router_abi = require('./abi/Uniswap_RouterV2.json');
const chainId = ChainId.MAINNET;

const dai_address = process.env.DAI;
const uniswapV2_router_address = process.env.UNISWAPV2_ROUTER;

// Hex function (helper function)
function toHex(currencyAmount) {
    return `0x${currencyAmount.raw.toString(16)}`
};

const init = async () => {
    // create an object to represent the DAI token in uniswap
    const dai = await Fetcher.fetchTokenData(chainId, dai_address);
    const weth = WETH[chainId];

    const pair = await Fetcher.fetchPairData(dai, weth);
    // route to buy DAI with WETH
    const route = new Route([pair], weth);

    console.log(`Mid price, ${route.midPrice.toSignificant(6)} DAI for 1 WETH`);

    const trade = new Trade(route, new TokenAmount(weth, '1000000000000000000'), TradeType.EXACT_INPUT);

    let exec_price = trade.executionPrice.toSignificant(6);

    console.log(`Execution price, ${exec_price} DAI for 1 WETH`);
    console.log(`Next mid price, ${trade.nextMidPrice.toSignificant(6)} DAI for 1 WETH\n`);

    // set details to make a tx

    const slippageTolerance = new Percent('50', '10000');

    // buy DAI with WETH
    // calculate the minimum amount ot DAI
    const amountOutMin = toHex(trade.minimumAmountOut(slippageTolerance));
    const path = [weth.address, dai.address];
    
    // recipient this address has to be checksum
    const to = process.env.ADDRESS;
    
    // date is in miliseconds so / 1000 to get seconds and add 20 minutes
    const deadline = Math.floor(Date.now() / 1000) + 60 * 20;
    
    // get the amount specified on the trade
    const value = toHex(trade.inputAmount);

    // connect to the blockchain

    const provider = new ethers.providers.JsonRpcProvider();
    const signer = new ethers.Wallet(process.env.PRIVATE_KEY);
    const account = signer.connect(provider);
    
    // Mainnet contract for Uniswap and DAI  

    const uniswap = new ethers.Contract(
        uniswapV2_router_address,
        uniswap_router_abi, 
        account
    )

    const DAI = new ethers.Contract(
        dai_address,
        erc20Abi,
        provider
    )
    let eth_balance_before = await provider.getBalance(process.env.ADDRESS)/1e18;
    let dai_balance_before = await DAI.balanceOf(process.env.ADDRESS)/1e18;

    console.log('Balances before BUY: ')
    console.log(`ETH: ${eth_balance_before.toString()}`);
    console.log(`DAI: ${dai_balance_before.toString()} \n`);

    // make a tx

    // target price => amount of DAI for 1 WETH
    const target = 1910;

    if (exec_price <= target) {
        const tx = await uniswap.swapExactETHForTokens(
            amountOutMin,
            path,
            to,
            deadline,
            { value, gasPrice: 27e9 }
        );
        console.log(`Transaction hash: ${tx.hash} \n`);
            
        const receipt = await tx.wait();
        console.log(`Transaction was mined in block ${ receipt.blockNumber }`);

        let eth_balance_after = await provider.getBalance(process.env.ADDRESS)/1e18;
        let dai_balance_after = await DAI.balanceOf(process.env.ADDRESS)/1e18;
        console.log(`ETH balance after is: ${eth_balance_after.toString()}`);
        console.log(`DAI balance after is: ${dai_balance_after.toString()} \n`);

        // stop if the order is executed 
        clearInterval(priceMonitor);
    }
}

const POLLING_INTERVAL = 10000;
priceMonitor = setInterval(
    async () => {
        await init() 
    }, 
        POLLING_INTERVAL
)