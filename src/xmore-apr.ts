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
    const signer = new ethers.VoidSigner(
      '0x0000000000000000000000000000000000000000',
      provider
    );

    const xMoreAddr = '0xaecf69a09369db3556177484298d6348c7cf9a7f';
    const deployerAddr = '0xc74401498312326ce31a23494ecbac1449bd7235';
    const dailyReward = ethers.utils.parseUnits('3330', 18);

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
    function erc20(address: string) {
      return new ethers.Contract(
        address,
        [
          'function balanceOf(address account) public view returns (uint256)',
          'function totalSupply() public view returns (uint256)'
        ],
        signer
      );
    }

    const moreContract = erc20('0xd9d90f882cddd6063959a9d837b05cb748718a05');

    function toNum(bigNum: ethers.BigNumber, decimals: number = 18) {
      return Number(ethers.utils.formatUnits(bigNum, decimals));
    }

    let timestamp = xMoreData.timestamp;

    async function calculateCurrentApr(
      moreContract: ethers.Contract,
      dailyReward: ethers.BigNumber,
      xMoreAddr: string,
      deployerAddr: string
    ) {
      const moreBalance = (await moreContract.balanceOf(
        xMoreAddr
      )) as ethers.BigNumber;
      const buybackBalance = (await moreContract.balanceOf(
        deployerAddr
      )) as ethers.BigNumber;
      const buybackNextReward = buybackBalance.div(100);
      const nextTotalReward = dailyReward.add(buybackNextReward);
      const yearTotalReward = nextTotalReward.mul(365);
      return toNum(yearTotalReward) / toNum(moreBalance);
    }
    const finalAPR = (
      (await calculateCurrentApr(
        moreContract,
        dailyReward,
        xMoreAddr,
        deployerAddr
      )) * 100
    ).toFixed(2);
    // let finalAPR = xMoreData.cachedAPR;

    // if (
    //   currentRatio > cachedRatio + 0.001 ||
    //   cachedRatio - 0.001 > currentRatio
    // ) {
    //   const diff = currentRatio - cachedRatio;
    //   const currentAPR =
    //     ((100 * diff) / currentRatio) *
    //     ((365 * 24 * 60 * 60 * 1000) / (Date.now() - xMoreData.timestamp));
    //   finalAPR = (xMoreData.cachedAPR + currentAPR) / 2;
    //   timestamp = Date.now();
    // }

    console.log('ratios', currentRatio, cachedRatio);
    console.log('finalAPR', finalAPR);

    const p = path.join(__dirname, './xmore-data.json');
    await fs.promises.writeFile(
      p,
      JSON.stringify(
        {
          timestamp,
          totalSupply: supply,
          moreBalance: balance,
          cachedAPR: parseFloat(finalAPR),
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
