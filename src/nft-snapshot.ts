import * as core from '@actions/core';
import * as ethers from 'ethers';
import * as fs from 'fs';
import * as path from 'path';
import dotenv from 'dotenv';
dotenv.config();

import addresses from './addresses.json';

import StableLending from './abi/contracts/StableLending.sol/StableLending.json';
import prevPositions from './v2-updated-positions.json';
import currentPositions from './nft-snapshot.json';

type NFTSnapshotFile = {
  tstamp: number;
  positions: Record<string, Record<string, number>>;
  eligible: Record<string, boolean>;
  signatures: Record<string, string>;
};

// * CRITERIA FOR ELIGIBILITY PER EPOCH
// * 1. The position must have a cumulative debt of at least 100
// ***

type PositionsType = Record<
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
>;

const provider = new ethers.providers.JsonRpcProvider(
  'https://api.avax.network/ext/bc/C/rpc'
);
const privateKey = process.env.PRIVATE_KEY || '';
const signer = privateKey
  ? new ethers.Wallet(privateKey, provider)
  : ethers.Wallet.createRandom();

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
    const jointPositions: PositionsType = Object.fromEntries(
      Object.values({...prevPositions.positions, ...updatedPositions})
        .filter((pos: any) => pos.debt > 1)
        .map((pos: any) => [pos.trancheId, pos])
    );

    const lendingContract = new ethers.Contract(
      addresses['43114'].StableLending2,
      StableLending.abi,
      provider
    );
    const values = Object.values(jointPositions);
    let mapPositionsDebt: Record<string, number> = {};
    for (let index = 0; index < values.length; index++) {
      const element = values[index];
      const position = await lendingContract.viewPositionMetadata(
        element.trancheId
      );
      const debt = parseFloat(ethers.utils.formatEther(position.debt));
      if (mapPositionsDebt[element.owner]) {
        mapPositionsDebt[element.owner] += debt;
      } else {
        mapPositionsDebt[element.owner] = debt;
      }
    }

    const epoch = (await provider.getBlock(await provider.getBlockNumber()))
      .timestamp;

    // go through the positions and check if they are eligible , debt > 100

    const eligible = Object.fromEntries(
      Object.entries(mapPositionsDebt).map(([key, value]) => [key, value > 100])
    );

    // generate the signed message for each eligible position
    // const signatures = Object.fromEntries(
    //   await Promise.all(
    //     Object.entries(eligible).map(([key, value]) => [
    //       key,
    //       signer.signMessage(key)
    //     ])
    //   )
    // );

    const signatures = Object.fromEntries(
      await Promise.all(
        Object.entries(eligible).map(async ([key, value]) => [
          key,
          await signer.signMessage(key + ',' + epoch)
        ])
      )
    );

    const payload: NFTSnapshotFile = {
      tstamp: newTstamp,
      positions: {
        ...currentPositions.positions,
        ...{
          [epoch]: mapPositionsDebt
        }
      },
      eligible: eligible,
      signatures: signatures
    };
    const p = path.join(__dirname, './nft-snapshot.json');
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
): Promise<PositionsType> {
  const endPeriod = 1 + Math.round(Date.now() / 1000 / TWELVE_HOURS_SECONDS);
  const startPeriod = Math.floor(timeStart / 1000 / TWELVE_HOURS_SECONDS);
  console.log('endPeriod', endPeriod);
  console.log('startPeriod', startPeriod);

  const lendingContract = new ethers.Contract(
    trancheContract,
    StableLending.abi,
    provider
  );

  const timeSteps = Array(endPeriod - startPeriod)
    .fill(startPeriod)
    .map((x, i) => x + i);

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
