import * as core from '@actions/core';
import * as ethers from 'ethers';
import * as fs from 'fs';
import * as path from 'path';

import addresses from './addresses.json';

import StableLending from './abi/contracts/StableLending.sol/StableLending.json';
import prevPositions from './v2-updated-positions.json';
import currentPositions from './cumulative-debt-positions.json';

async function run(): Promise<void> {
  try {
    core.debug(new Date().toTimeString());

    const newTstamp = Date.now();
    const updatedPositions = {
      ...(await getUpdatedPositions(
        prevPositions.tstamp,
        addresses['43114'].StableLending2
      ))
    };
    const jointPositions = Object.fromEntries(
      Object.values({...prevPositions.positions, ...updatedPositions})
        .filter((pos: any) => pos.debt > 1)
        .map((pos: any) => [pos.trancheId, pos])
    );

    const newPositions = {
      tstamp: newTstamp,
      positions: jointPositions
    };

    const previousPositionsMap = currentPositions?.positions?.reduce(function (
      map: any,
      obj: any
    ) {
      map[obj.trancheId] = obj;
      return map;
    },
    {});

    const mapPositionsDebt = Object.values(newPositions.positions)
      .map((pos: any) => {
        return {
          ...pos,
          cumulativeDebt:
            previousPositionsMap[pos.trancheId]?.cumulativeDebt ??
            pos.cumulativeDebt
        };
      })
      .map((pos) => {
        // If the position already exists AND the current debt is lower
        // than what we recorded in the JSON record, query the NFT metadata
        // from our API to see if this NFT has a tier and if so, do SOMETHING to demote it.
        const demote = previousPositionsMap[pos.trancheId]?.debt > pos.debt;
        return {
          ...pos,
          cumulativeDebt: demote ? 0 : pos.cumulativeDebt + pos.debt
        };
      });
    const payload = {
      tstamp: newTstamp,
      positions: mapPositionsDebt
    };
    const p = path.join(__dirname, './cumulative-debt-positions.json');
    await fs.promises.writeFile(p, JSON.stringify(payload, null, 2));

    core.setOutput('time', new Date().toTimeString());
  } catch (error) {
    if (error instanceof Error) core.setFailed(error.message);
  }
}

const TWELVE_HOURS_SECONDS = 43200;
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
      trancheContract: string;
    }
  >
> {
  const endPeriod = 1 + Math.round(Date.now() / 1000 / TWELVE_HOURS_SECONDS);
  const startPeriod = Math.floor(timeStart / 1000 / TWELVE_HOURS_SECONDS);
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
    owner: ethers.utils.getAddress(pos.owner),
    trancheContract
  }));

  return Object.fromEntries(parsed.map((pos) => [pos.trancheId, pos]));
}

run();
