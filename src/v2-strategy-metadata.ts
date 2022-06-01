import * as core from '@actions/core';
import * as ethers from 'ethers';
import * as fs from 'fs';
import * as path from 'path';
import xMore from './abi/contracts/governance/xMore.sol/xMore.json';
import addresses from './addresses.json';
import xMoreData from './xmore-data.json';
import MoreToken from './abi/contracts/governance/MoreToken.sol/MoreToken.json';
import IsolatedLending from './abi/contracts/IsolatedLending.sol/IsolatedLending.json';
import StableLending from './abi/contracts/StableLending.sol/StableLending.json';
import StrategyViewer from './abi/contracts/StrategyViewer.sol/StrategyViewer.json';
import StrategyRegistry from './abi/contracts/StrategyRegistry.sol/StrategyRegistry.json';
import IStrategy from './abi/interfaces/IStrategy.sol/IStrategy.json';
import {Interface} from 'ethers/lib/utils';

async function run(): Promise<void> {
  try {
    core.debug('v2-strategy-metadata start:' + new Date().toTimeString());

    const provider = new ethers.providers.JsonRpcProvider(
      'https://api.avax.network/ext/bc/C/rpc'
    );
    const curAddresses = addresses['43114'];

    const token2Strat = {
      ['0x2b2C81e08f1Af8835a78Bb2A90AE924ACE0eA4bE']:
        curAddresses.YieldYakStrategy2,
      ['0xB31f66AA3C1e785363F0875A1B74E27b85FD66c7']:
        curAddresses.YieldYakAVAXStrategy2
      // ['0x60781C2586D68229fde47564546784ab3fACA982']: curAddresses.YieldYakStrategy,
      // ['0x59414b3089ce2AF0010e7523Dea7E2b35d776ec7']: curAddresses.YieldYakStrategy,
      // ['0x6e84a6216ea6dacc71ee8e6b0a5b7322eebc0fdd']: curAddresses.YieldYakStrategy,
      // ['0xd586e7f844cea2f87f50152665bcbc2c279d8d70']: curAddresses.YieldYakStrategy,
      // ['0x8729438EB15e2C8B576fCc6AeCdA6A148776C0F5']: curAddresses.YieldYakStrategy,
      // ['0xA7D7079b0FEaD91F3e65f86E8915Cb59c1a4C664']: curAddresses.YieldYakStrategy,
      // ['0xA389f9430876455C36478DeEa9769B7Ca4E3DDB1']: curAddresses.YieldYakStrategy,
      // ['0xeD8CBD9F0cE3C6986b22002F03c6475CEb7a6256']: curAddresses.YieldYakStrategy,
      // ['0x454E67025631C065d3cFAD6d71E6892f74487a15']:
      //   curAddresses.TraderJoeMasterChefStrategy,
      // ['0x2148D1B21Faa7eb251789a51B404fc063cA6AAd6']:
      //   curAddresses.SimpleHoldingStrategy,
      // ['0xCDFD91eEa657cc2701117fe9711C9a4F61FEED23']:
      //   curAddresses.MultiTraderJoeMasterChef3Strategy,
    };

    // const masterChef2Tokens = [
    //   '0x57319d41f71e81f3c65f2a47ca4e001ebafd4f33',
    //   '0xa389f9430876455c36478deea9769b7ca4e3ddb1',
    //   '0xed8cbd9f0ce3c6986b22002f03c6475ceb7a6256',
    // ].map(getAddress);

    const tokens = Object.keys(token2Strat);
    // tokens.push('0xB31f66AA3C1e785363F0875A1B74E27b85FD66c7');
    const strats = Object.values(token2Strat);
    // strats.push(curAddresses.LiquidYieldStrategy);

    // tokens.push('0x454E67025631C065d3cFAD6d71E6892f74487a15');
    // strats.push(curAddresses.YieldYakStrategy);
    // tokens.push('0x6e84a6216eA6dACC71eE8E6b0a5B7322EEbC0fDd');
    // strats.push(curAddresses.sJoeStrategy);

    const stratViewer = new ethers.Contract(
      curAddresses.StrategyViewer2,
      new Interface(StrategyViewer.abi),
      provider
    );
    const normalResults = await stratViewer.viewMetadata(
      curAddresses.StableLending2,
      tokens,
      strats
    );

    //query the strategy metadata for each token
    const stratMeta = [...normalResults].map((obj) => {
      return {
        debtCeiling: obj.debtCeiling.toString(),
        totalDebt: obj.totalDebt.toString(),
        stabilityFee: obj.stabilityFee.toString(),
        mintingFee: obj.mintingFee.toString(),
        strategy: obj.strategy,
        token: obj.token,
        APF: obj.APF.toString(),
        totalCollateral: obj.totalCollateral.toString(),
        borrowablePer10k: obj.borrowablePer10k.toString(),
        valuePer1e18: obj.valuePer1e18.toString(),
        strategyName: obj.strategyName,
        tvl: obj.tvl.toString(),
        harvestBalance2Tally: obj.harvestBalance2Tally.toString(),
        yieldType: obj.yieldType,
        underlyingStrategy: obj.underlyingStrategy
      };
    });

    const p = path.join(__dirname, './v2-strategy-metadata.json');
    await fs.promises.writeFile(p, JSON.stringify(stratMeta, null, 2));

    core.debug('v2-strategy-metadata finish:' + new Date().toTimeString());
  } catch (error) {
    if (error instanceof Error) core.setFailed(error.message);
  }
}

run();
