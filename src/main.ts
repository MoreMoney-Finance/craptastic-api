import * as core from '@actions/core';
import * as ethers from 'ethers';
import * as fs from 'fs';
import * as path from 'path';

import addresses from './addresses.json';

import StableLending from './abi/contracts/StableLending.sol/StableLending.json';
import prevPositions from './updated-positions.json';

async function run(): Promise<void> {
  try {
    core.debug(new Date().toTimeString());

    const newTstamp = Date.now();
    const updatedPositions = {
      ...(await getUpdatedPositions(
        prevPositions.tstamp,
        addresses['43114'].StableLending
      )),
      ...(await getUpdatedPositions(
        prevPositions.tstamp,
        addresses['43114'].IsolatedLending
      ))
    };
    const jointPositions = Object.fromEntries(
      Object.values({...prevPositions.positions, ...updatedPositions})
        .filter((pos) => pos.debt > 1)
        .map((pos) => [pos.trancheId, pos])
    );

    const newPositions = {
      tstamp: newTstamp,
      positions: jointPositions
    };

    const p = path.join(__dirname, './updated-positions.json');
    await fs.promises.writeFile(p, JSON.stringify(newPositions, null, 2));

    core.setOutput('time', new Date().toTimeString());
  } catch (error) {
    if (error instanceof Error) core.setFailed(error.message);
  }
}

const ONE_WEEK_SECONDS = 60 * 60 * 24 * 7;
async function getUpdatedPositions(
  timeStart: number,
  trancheContract: string
): Promise<
  Record<
    string,
    {
      trancheId: number;
      strategy: string;
      collateral: string;
      debt: number;
      token: string;
      collateralValue: number;
      borrowablePer10k: number;
      owner: string;
    }
  >
> {
  const endPeriod = 1 + Math.round(Date.now() / 1000 / ONE_WEEK_SECONDS);
  const startPeriod = Math.floor(timeStart / 1000 / ONE_WEEK_SECONDS);
  console.log('endPeriod', endPeriod);
  console.log('startPeriod', startPeriod);

  const timeSteps = Array(endPeriod - startPeriod)
    .fill(startPeriod)
    .map((x, i) => x + i);
  const provider = new ethers.providers.JsonRpcProvider(
    'https://api.avax.network/ext/bc/C/rpc'
  );
  const lendingContract = new ethers.Contract(
    trancheContract,
    StableLending.abi,
    provider
  );

  const results = (
    await Promise.all(
      timeSteps.map(async (step) =>
        lendingContract.viewPositionsByTrackingPeriod(step)
      )
    )
  ).flat();

  const parsed = results.map((pos) => ({
    trancheId: pos.trancheId.toNumber(),
    strategy: pos.strategy,
    collateral: pos.collateral.toString(),
    debt: parseFloat(ethers.utils.formatEther(pos.debt)),
    token: ethers.utils.getAddress(pos.token),
    collateralValue: parseFloat(ethers.utils.formatEther(pos.collateralValue)),
    borrowablePer10k: pos.borrowablePer10k.toNumber(),
    owner: ethers.utils.getAddress(pos.owner)
  }));

  return Object.fromEntries(parsed.map((pos) => [pos.trancheId, pos]));
}

run();
