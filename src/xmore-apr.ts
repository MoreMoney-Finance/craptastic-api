import * as core from '@actions/core';
import * as ethers from 'ethers';
import * as fs from 'fs';
import * as path from 'path';
import xMore from './abi/contracts/governance/xMore.sol/xMore.json';
import addresses from './addresses.json';
import xMoreData from './xmore-data.json';

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
    ).totalSupply([]);

    const supply = ethers.BigNumber.from(totalSupply).toNumber();
    const balance = 1;

    const currentRatio = supply === 0 ? 1 : balance / supply;

    const cachedRatio =
      xMoreData.totalSupply === 0
        ? 1
        : xMoreData.moreBalance / xMoreData.totalSupply;

    let finalAPR = 0;

    if (currentRatio !== cachedRatio) {
      const diff = currentRatio - cachedRatio;
      const currentAPR =
        ((100 * diff) / currentRatio) *
        ((365 * 24 * 60 * 60 * 1000) / (Date.now() - xMoreData.timestamp));
      finalAPR = (xMoreData.cachedAPR + currentAPR) / 2;
    } else {
      finalAPR = xMoreData.cachedAPR;
    }

    console.log('finalAPR', finalAPR);

    const p = path.join(__dirname, './xmore-data.json');
    await fs.promises.writeFile(p, JSON.stringify({
      "timestamp": Date.now(),
      "totalSupply": supply,
      "moreBalance": 1,
      "cachedAPR": finalAPR
    }, null, 2)); 

    core.debug('xmore-apr finish:' + new Date().toTimeString());
  } catch (error) {
    if (error instanceof Error) core.setFailed(error.message);
  }
}

run();
