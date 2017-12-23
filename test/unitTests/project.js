const Project = artifacts.require('Project')
const TokenRegistry = artifacts.require('TokenRegistry')
const ReputationRegistry = artifacts.require('ReputationRegistry')
// const ProjectRegistry = artifacts.require('ProjectRegistry')
// const DistributeToken = artifacts.require('DistributeToken')
const evmIncreaseTime = require('../utils/evmIncreaseTime')
const Promise = require('bluebird')
web3.eth = Promise.promisifyAll(web3.eth)
const assertThrown = require('../utils/AssertThrown')

contract('Project', function (accounts) {
  let TR, RR, P, spoofedP
  let projectCost = web3.toWei(1, 'ether')
  let proposeProportion = 20
  let stakingPeriod = 10000000000

  // let spoofedRRaddress = accounts[8]
  let spoofedTRaddress = accounts[7]
  let spoofedPRaddress = accounts[4]
  // let proposer = accounts[1]
  let tokens = 10000
  let staker = accounts[2]
  let staker2 = accounts[5]
  let nonStaker = accounts[3]
  // let totalTokenSupply
  // let totalFreeSupply
  before(async function () {
    TR = await TokenRegistry.deployed()
    RR = await ReputationRegistry.deployed()
    P = await Project.new(projectCost, proposeProportion, stakingPeriod, RR.address, TR.address, {from: spoofedPRaddress})
    spoofedP = await Project.new(projectCost, proposeProportion, stakingPeriod, RR.address, spoofedTRaddress, {from: spoofedPRaddress})
  })

  it('stakes tokens', async () => {
    await spoofedP.stakeTokens(staker, tokens, web3.toWei(0.5, 'ether'), {from: spoofedTRaddress})
    let tokenBalance = await spoofedP.stakedTokenBalances(staker)
    let totalTokenBalance = await spoofedP.totalTokensStaked.call()
    let weiBal = await spoofedP.weiBal.call()
    assert.equal(tokenBalance, tokens, "doesn't stake tokens to correctly")
    assert.equal(totalTokenBalance, tokens, "doesn't update total token supply correctly")
    assert.equal(weiBal, web3.toWei(0.5, 'ether'), "doesn't update balance correctly")
  })

  it('returns a bool for an address whether they are a project staker', async () => {
    let trueVal = await spoofedP.isStaker(staker)
    let falseVal = await spoofedP.isStaker(nonStaker)
    assert.isTrue(trueVal, 'returns non-staker as staker')
    assert.isNotTrue(falseVal, 'returns staker as non-staker')
  })

  it('returns the proportional weight on an address staking ', async () => {
    let val = await spoofedP.calculateWeightOfAddress(staker)
    assert.equal(val.toNumber(), 100, 'doesn\'t return the correct weight')
    await spoofedP.stakeTokens(staker2, tokens, web3.toWei(0.5, 'ether'), {from: spoofedTRaddress})
    let val1 = await spoofedP.calculateWeightOfAddress(staker)
    let val2 = await spoofedP.calculateWeightOfAddress(staker2)
    assert.equal(val1.toNumber(), 50, 'doesn\'t return the correct weight after more staking1')
    assert.equal(val2.toNumber(), 50, 'doesn\'t return the correct weight after more staking2')
    await spoofedP.unstakeTokens(staker2, tokens, {from: spoofedTRaddress})
  })

  it('unstakes tokens', async () => {
    await spoofedP.unstakeTokens(staker, tokens, {from: spoofedTRaddress})
    let tokenBalance = await spoofedP.stakedTokenBalances.call(staker)
    let totalTokenBalance = await spoofedP.totalTokensStaked.call()
    let weiBal = await spoofedP.weiBal.call()
    assert.equal(tokenBalance, 0, "doesn't unstake tokens to correctly")
    assert.equal(totalTokenBalance, 0, "doesn't update total token supply correctly")
    assert.equal(weiBal, 0, "doesn't update balance correctly")
  })

  it('returns the correct bool for a staker who has unstaked', async () => {
    let falseVal = await spoofedP.isStaker(staker)
    assert.isNotTrue(falseVal, 'returns staker as non-staker')
  })

  it('sets TotalValidateAffirmative', async () => {
    await spoofedP.setTotalValidateAffirmative(10, {from: spoofedPRaddress})
    let tVA = await spoofedP.totalValidateAffirmative.call()
    assert.equal(tVA, 10, "doesn't update totalValidateAffirmative correctly")
  })

  it('sets TotalValidateNegative', async () => {
    await spoofedP.setTotalValidateNegative(20, {from: spoofedPRaddress})
    let tVN = await spoofedP.totalValidateNegative.call()
    assert.equal(tVN, 20, "doesn't update totalValidateNegative correctly")
  })

  it('clears Stake', async () => {
    await spoofedP.clearStake({from: spoofedPRaddress})
    let tokenStakeVal = await spoofedP.totalTokensStaked.call()
    let tokenRepVal = await spoofedP.totalReputationStaked.call()
    assert.equal(tokenStakeVal.toNumber(), 0, "doesn't clear tokenStake correctly")
    assert.equal(tokenRepVal.toNumber(), 0, "doesn't clear reputationStake correctly")
  })

  it('returns if a project is staked or not', async () => {
    let notStaked = await spoofedP.isStaked()
    await spoofedP.stakeTokens(staker, tokens, web3.toWei(1, 'ether'), {from: spoofedTRaddress})
    let staked = await spoofedP.isStaked()
    assert.isTrue(staked, "doesn't return staked state correctly")
    assert.isNotTrue(notStaked, "doesn't return unstaked state correctly")
  })

  it('sets project state', async () => {
    let nexD = Date.now() + (7 * 25 * 60 * 60)
    await spoofedP.setState(2, nexD, {from: spoofedPRaddress})
    let state = await spoofedP.state.call()
    let nextDeadline = await spoofedP.nextDeadline.call()
    assert.equal(state, 2, "doesn't update state correctly")
    assert.equal(nextDeadline, nexD, "doesn't update nextDeadline correctly")
  })

  it('returns false if time is not up', async () => {
    let val = await spoofedP.timesUp()
    assert.isNotTrue(val, 'returns timesUp true when should be false')
  })

  it('sets ValidateReward', async () => {
    await spoofedP.setValidateReward(true, {from: spoofedPRaddress})
    let affirmValidateReward = await spoofedP.validateReward.call()
    assert.equal(affirmValidateReward, 10, "doesn't set affirmValidateReward correctly")
    await spoofedP.setValidateReward(false, {from: spoofedPRaddress})
    let negativeValidateReward = await spoofedP.validateReward.call()
    assert.equal(negativeValidateReward, 20, "doesn't set negativeValidateReward correctly")
  })

  it('sets ValidateFlag', async () => {
    await spoofedP.setValidateFlag(true, {from: spoofedPRaddress})
    let affirmValidate = await spoofedP.validateFlag.call()
    assert.isTrue(affirmValidate, "doesn't set affirmValidate correctly")
    await spoofedP.setValidateFlag(false, {from: spoofedPRaddress})
    let negativeValidate = await spoofedP.validateFlag.call()
    assert.isNotTrue(negativeValidate, "doesn't set negativeValidate correctly")
  })
  
  it('only allows the TokenRegistry to call stakeTokens', async () => {
    let errorThrown = false
    try {
      await P.stakeTokens(staker, tokens, web3.toWei(0.5, 'ether'))
    } catch (e) {
      errorThrown = true
    }
    assertThrown(errorThrown, 'An error should have been thrown')
  })

  it('only allows the TokenRegistry to call unstakeTokens', async () => {
    let errorThrown = false
    try {
      await P.unstakeTokens(staker, tokens)
    } catch (e) {
      errorThrown = true
    }
    assertThrown(errorThrown, 'An error should have been thrown')
  })

  it('only allows the projectRegistry to call setTotalValidateAffirmative', async () => {
    let errorThrown = false
    try {
      await P.setTotalValidateAffirmative(10)
    } catch (e) {
      errorThrown = true
    }
    assertThrown(errorThrown, 'An error should have been thrown')
  })

  it('only allows the projectRegistry to call setTotalValidateNegative', async () => {
    let errorThrown = false
    try {
      await P.setTotalValidateNegative(20)
    } catch (e) {
      errorThrown = true
    }
    assertThrown(errorThrown, 'An error should have been thrown')
  })

  it('only allows the projectRegistry to call clearStake', async () => {
    let errorThrown = false
    try {
      await P.clearStake()
    } catch (e) {
      errorThrown = true
    }
    assertThrown(errorThrown, 'An error should have been thrown')
  })

  it('only allows the projectRegistry to call setState', async () => {
    let errorThrown = false
    try {
      await P.setState(2, (7 * 25 * 60 * 60))
    } catch (e) {
      errorThrown = true
    }
    assertThrown(errorThrown, 'An error should have been thrown')
  })

  it('only allows the projectRegistry to call setValidateReward', async () => {
    let errorThrown = false
    try {
      await P.setValidateReward(true)
    } catch (e) {
      errorThrown = true
    }
    assertThrown(errorThrown, 'An error should have been thrown')
  })

  it('only allows the projectRegistry to call setValidateFlag', async () => {
    let errorThrown = false
    try {
      await P.setValidateFlag(true)
    } catch (e) {
      errorThrown = true
    }
    assertThrown(errorThrown, 'An error should have been thrown')
  })

  // it('returns true if time is up', async () => {
  //   await evmIncreaseTime(300000000000)
  //   let val = await spoofedP.timesUp()
  //   console.log('second', val)
  //   assert.isTrue(val, 'returns timesUp false when should be true')
  // })
  // it('only allows Token Registry to stake tokens', async function () {
  //
  // })
})