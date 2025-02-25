import * as core from '@actions/core';
import * as ethers from 'ethers';
import * as fs from 'fs';
import * as path from 'path';
import dotenv from 'dotenv';
dotenv.config();

import addresses from './addresses.json';

import StableLending from './abi/contracts/StableLending.sol/StableLending.json';
import NFTContract from './abi/contracts/NFTContract.sol/NFTContract.json';
import prevPositions from './v2-updated-positions.json';
import currentPositions from './nft-snapshot.json';

type NFTSnapshotFile = {
  tstamp: number;
  positions: Record<string, Record<string, number>>;
  eligible: Record<string, Record<string, boolean>>;
  signatures: Record<string, Record<string, string>>;
};

// * CRITERIA FOR ELIGIBILITY PER EPOCH
// * 1. The position must have a cumulative debt of at least 100
// * 2.
// ***
// export function serializeMintData(data: MintData): SerializedMintData {
//   return {
//     ...data,
//     ...{ price: data.price.toHexString(), timeout: data.timeout.toHexString() },
//   };
// }

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

const tiers = [
  {
    name: 'tier1',
    minDebt: 100,
    epoch: 1,
    threshold: 100 * 7 * 24 * 60 * 60 * 1000
  },
  {
    name: 'tier2',
    minDebt: 200,
    epoch: 2,
    threshold: 200 * 14 * 24 * 60 * 60 * 1000
  }
];

const privateKey = process.env.PRIVATE_KEY || '';

console.log('length', privateKey.length);

const signer = privateKey
  ? new ethers.Wallet(privateKey, provider)
  : ethers.Wallet.createRandom();

async function run(): Promise<void> {
  try {
    core.debug(new Date().toTimeString());
    console.log('Running nft-snapshot.ts', signer.address);
    core.debug(signer.address);
    const newTstamp = Date.now();
    const updatedPositions = {
      ...(await getUpdatedPositions(
        prevPositions.tstamp,
        addresses['43114'].StableLending
      )),
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

    const stableLendingContract = new ethers.Contract(
      addresses['43114'].StableLending,
      StableLending.abi,
      provider
    );

    const stableLending2Contract = new ethers.Contract(
      addresses['43114'].StableLending2,
      StableLending.abi,
      provider
    );

    const nftContract = new ethers.Contract(
      addresses['43114'].NFTContract,
      NFTContract.abi,
      provider
    );

    // TODO: After deploy the contract, we need to uncomment this
    // get current epoch
    const contractEpoch = await nftContract.currentEpoch();

    const currentEpoch = contractEpoch ?? 0;
    const tier = tiers[0];

    // sum up the debt for each owner
    const values = Object.values(jointPositions);
    let mapPositionsDebt: Record<string, number> = {};
    for (let index = 0; index < values.length; index++) {
      const element = values[index];
      const position =
        element.trancheContract === addresses['43114'].StableLending
          ? await stableLendingContract.viewPositionMetadata(element.trancheId)
          : await stableLending2Contract.viewPositionMetadata(
              element.trancheId
            );

      const debt = parseFloat(ethers.utils.formatEther(position.debt));
      if (mapPositionsDebt[element.owner]) {
        mapPositionsDebt[element.owner] +=
          debt * (newTstamp - currentPositions.tstamp);
        // mapPositionsDebt[element.owner] += debt;
      } else {
        mapPositionsDebt[element.owner] = debt;
      }
    }

    // go through the positions and check if they are eligible , debt > 100
    const testAddress = '0xc4c93d09d45df1ce52053fdc0befcc49b01884ea';
    const eligible = Object.fromEntries(
      Object.entries(mapPositionsDebt).map(([key, value]) => {
        if (key === testAddress) {
          return [key, true];
        }
        return [key, value > tier.minDebt];
      })
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
    const owner = signer;

    const domain = {
      name: 'MMNFT',
      version: '1',
      chainId: 43114,
      verifyingContract: nftContract.address
    };

    const types = {
      MintData: [
        {name: 'minter', type: 'address'},
        {name: 'epoch', type: 'uint256'}
      ]
    };

    // generate the signed message for each eligible position
    const signatures = Object.fromEntries(
      await Promise.all(
        Object.entries(eligible).map(async ([address, value]) => [
          address,
          await owner._signTypedData(domain, types, {
            minter: address,
            epoch: currentEpoch
          })
        ])
      )
    );

    // add the new positions to the current positions
    let eligibleSignatures: Record<string, Record<string, string>> = {
      ...currentPositions.signatures,
      ...{
        [currentEpoch]: signatures
      }
    };

    // remove the signatures from eligibleSignatures if the position is not eligible
    Object.entries(eligibleSignatures).forEach(([epoch, signatures]) => {
      Object.entries(signatures).forEach(([address, signature]) => {
        if (!eligible[address]) {
          delete eligibleSignatures[epoch][address];
        }
      });
    });

    const payload: NFTSnapshotFile = {
      tstamp: newTstamp,
      positions: {
        ...currentPositions.positions,
        ...{
          [currentEpoch]: mapPositionsDebt
        }
      },
      eligible: {
        ...currentPositions.eligible,
        ...{
          [currentEpoch]: eligible
        }
      },
      signatures: eligibleSignatures
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
