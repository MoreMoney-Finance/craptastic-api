import * as core from '@actions/core';
import * as ethers from 'ethers';
import * as fs from 'fs';
import * as path from 'path';
import axios from 'axios';

async function run(): Promise<void> {
  try {
    core.debug('yield-monitor start:' + new Date().toTimeString());

	const apiResponse = await axios.get('https://app.yieldmonitor.io/api/symbol/getFarmsForDex?partner=tj&amp;dexName[]=traderJoeV3&amp;dexName[]=traderjoe&page=1&order=liquidity&orderMethod=desc');

    const p = path.join(__dirname, './yield-monitor.json');
    await fs.promises.writeFile(p, JSON.stringify(apiResponse.data, null, 2));

    core.debug('yield-monitor finish:' + new Date().toTimeString());
  } catch (error) {
    if (error instanceof Error) core.setFailed(error.message);
  }
}

run();