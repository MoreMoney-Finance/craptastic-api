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
    core.debug('strategy-metadata start:' + new Date().toTimeString());

    const provider = new ethers.providers.JsonRpcProvider(
      'https://api.avax.network/ext/bc/C/rpc'
    );
    const curAddresses = addresses['43114'];

    const stratRegistry = new ethers.Contract(
      curAddresses.StrategyRegistry,
      StrategyRegistry.abi,
      provider
    );

    const stratViewer = new ethers.Contract(
      curAddresses.StrategyViewer,
      new Interface(StrategyViewer.abi),
      provider
    );

    //get all enabled strategies
    const enabledStrategies = await stratRegistry.allEnabledStrategies();

    //get all approved tokens for each strategy
    const approvedTokens = await Promise.all(
      enabledStrategies.map((address: any) => {
        const contract = new ethers.Contract(address, IStrategy.abi, provider);
        return contract.viewAllApprovedTokens();
      })
    );

    //for each token, set the strategy as value
    let token2Strat2: Record<string, string> = {};
    for (let i = 0; i < enabledStrategies.length; i++) {
      const strategy = enabledStrategies[i];
      const tokens = approvedTokens[i];
      for (let j = 0; j < tokens.length; j++) {
        if (token2Strat2[tokens[j]] == undefined) {
          token2Strat2[tokens[j]] = strategy;
        }
      }
    }

    //separate the tokens from the strategies
    const tokens = Object.keys(token2Strat2);
    const strats = Object.values(token2Strat2);

    const noHarvestBalanceResults =
      await stratViewer.viewMetadataNoHarvestBalance(
        curAddresses.StableLending,
        curAddresses.OracleRegistry,
        curAddresses.Stablecoin,
        tokens,
        strats
      );

    //query the strategy metadata for each token
    const stratMeta = [...noHarvestBalanceResults].map((obj) => {
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

    const p = path.join(__dirname, './strategy-metadata.json');
    await fs.promises.writeFile(p, JSON.stringify(stratMeta, null, 2));

    core.debug('strategy-metadata finish:' + new Date().toTimeString());
  } catch (error) {
    if (error instanceof Error) core.setFailed(error.message);
  }
}

run();
