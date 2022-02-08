import * as core from '@actions/core';
import * as ethers from 'ethers';
import {parseEther} from 'ethers/lib/utils';
import * as fs from 'fs';
import * as path from 'path';
import addresses from './addresses.json';
import MoreToken from './abi/contracts/governance/MoreToken.sol/MoreToken.json';

async function run(): Promise<void> {
  try {
    core.debug('more-circulating-supply start:' + new Date().toTimeString());

    const chainId = 43114;

    const provider = new ethers.providers.JsonRpcProvider(
      'https://api.avax.network/ext/bc/C/rpc'
    );
    const circulatingBlacklist = [
      addresses[chainId].CurvePoolRewards,
      addresses[chainId].VestingLaunchReward,
      '0xcb2fb8db0e80adf47720d48e1ae9315e7d128808',
      '0xba8983fdde65354c1330e38d042c7d2f784ca3de',
      '0xc2Ee73EF5FF77c37dEBa2593EC80e5d4B655735E'
    ];

    const blacklistContracts = await Promise.all(
      circulatingBlacklist.map(async (item) => {
        return await new ethers.Contract(
          addresses[chainId].MoreToken,
          MoreToken.abi,
          provider
        ).balanceOf(item);
      })
    );

    const balances = blacklistContracts.reduce((agg, curr) => agg.add(curr));

    const circulatingSupply = ethers.utils.formatEther(
      parseEther('1000000000').sub(balances).toString()
    );

    const p = path.join(__dirname, './more-circulating-supply');
    await fs.promises.writeFile(p, circulatingSupply.toString());

    core.debug('more-circulating-supply finish:' + new Date().toTimeString());
  } catch (error) {
    if (error instanceof Error) core.setFailed(error.message);
  }
}

run();
