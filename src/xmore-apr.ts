import * as core from '@actions/core';
import * as ethers from 'ethers';
import * as fs from 'fs';
import * as path from 'path';
import xMore from './abi/contracts/governance/xMore.sol/xMore.json';
import addresses from './addresses.json';
import xMoreData from './xmore-data.json';
import MoreToken from './abi/contracts/governance/MoreToken.sol/MoreToken.json';

async function run(): Promise<void> {
  try {
    core.debug('xmore-apr start:' + new Date().toTimeString());

    const chainId = 43114;
    const provider = new ethers.providers.JsonRpcProvider(
      'https://api.avax.network/ext/bc/C/rpc'
    );
    const totalSupply = await new ethers.Contract(
      addresses[chainId].xMore,
      xMore.abi,
      provider
    ).totalSupply();

    const balance = parseFloat(
      ethers.utils.formatEther(
        await new ethers.Contract(
          addresses[chainId].MoreToken,
          MoreToken.abi,
          provider
        ).balanceOf(addresses[chainId].xMore)
      )
    );

    const supply = parseFloat(ethers.utils.formatEther(totalSupply));

    const currentRatio = supply === 0 ? 1 : balance / supply;

    const cachedRatio = xMoreData.currentRatio;

    let finalAPR = xMoreData.cachedAPR;

    let timestamp = xMoreData.timestamp;
    console.log('ratios', currentRatio, cachedRatio);
    if (
      currentRatio > cachedRatio + 0.001 ||
      cachedRatio - 0.001 > currentRatio
    ) {
      const diff = currentRatio - cachedRatio;
      const currentAPR =
        ((100 * diff) / currentRatio) *
        ((365 * 24 * 60 * 60 * 1000) / (Date.now() - xMoreData.timestamp));
      finalAPR = (xMoreData.cachedAPR + currentAPR) / 2;
      timestamp = Date.now();
    }

    console.log('finalAPR', finalAPR);

    const p = path.join(__dirname, './xmore-data.json');
    await fs.promises.writeFile(
      p,
      JSON.stringify(
        {
          timestamp,
          totalSupply: supply,
          moreBalance: balance,
          cachedAPR: finalAPR,
          currentRatio: currentRatio
        },
        null,
        2
      )
    );

    core.debug('xmore-apr finish:' + new Date().toTimeString());
  } catch (error) {
    if (error instanceof Error) core.setFailed(error.message);
  }
}

run();
