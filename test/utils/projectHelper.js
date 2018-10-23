/* global artifacts web3 assert */

const TokenRegistry = artifacts.require('TokenRegistry')
const ReputationRegistry = artifacts.require('ReputationRegistry')
const DistributeToken = artifacts.require('DistributeToken')
const ProjectRegistry = artifacts.require('ProjectRegistry')
const ProjectLibrary = artifacts.require('ProjectLibrary')
const PLCRVoting = artifacts.require('PLCRVoting')
const Project = artifacts.require('Project')
const Task = artifacts.require('Task')

const evmIncreaseTime = require('./evmIncreaseTime')
const keccakHashes = require('../utils/keccakHashes')
const ethers = require('ethers')

module.exports = function projectHelper (accounts) {
  let obj = {}
  obj.user = {}
  obj.variables = {}
  obj.contracts = {}
  obj.utils = {}
  obj.project = {}
  obj.task = {}
  obj.spoofed = {}
  obj.returnProject = {}

  obj.user.tokenProposer = accounts[1]
  obj.user.repProposer = accounts[2]
  obj.user.notProposer = accounts[3]

  obj.user.tokenStaker1 = accounts[1]
  obj.user.tokenStaker2 = accounts[2]
  obj.user.repStaker1 = accounts[3]
  obj.user.repStaker2 = accounts[4]
  obj.user.notStaker = accounts[5]

  obj.user.worker1 = accounts[1]
  obj.user.worker2 = accounts[2]
  obj.user.notWorker = accounts[7]

  obj.user.validator1 = accounts[1]
  obj.user.validator2 = accounts[2]
  obj.user.validator3 = accounts[3]
  obj.user.notValidator = accounts[4]

  obj.user.repYesVoter = accounts[1]
  obj.user.repNoVoter = accounts[2]
  obj.user.tokenYesVoter = accounts[3]
  obj.user.tokenNoVoter = accounts[4]
  obj.user.cheekyYesVoter = accounts[5]
  obj.user.cheekyNoVoter = accounts[6]
  obj.user.notVoter = accounts[7]

  obj.user.notProject = accounts[1]

  // these will only be used in unit tests
  obj.spoofed.spoofedDTAddress = accounts[1]
  obj.spoofed.spoofedTRAddress = accounts[2]
  obj.spoofed.spoofedRRAddress = accounts[3]
  obj.spoofed.spoofedPRAddress = accounts[4]
  obj.spoofed.anyAddress = accounts[5]
  obj.spoofed.spoofedPLCRVotingAddress = accounts[6]

  obj.variables.weiToReturn = 10000000000000000000

  // mutable minting details for each user
  obj.variables.tokensToMint = 10000
  obj.variables.tokensToBurn = 100

  // immutable registration reputation amount
  obj.variables.registeredRep = 10000

  // mutable project details
  obj.variables.now = Math.floor(new Date().getTime() / 1000) // in seconds
  obj.variables.stakingPeriod = obj.variables.now + 604800 // one week from now

  obj.variables.expiredStakingPeriod = 10 // January 1st, 1970
  obj.variables.projectCost = parseInt(web3.toWei(0.1, 'ether'))
  obj.variables.ipfsHash = 'ipfsHashlalalalalalalalalalalalalalalalalalala' // length === 46
  obj.variables.incorrectIpfsHash = 'whyiseveryspokeleadawhiteman' // length != 46

  // immutable project details
  obj.variables.proposerTypeToken = 1
  obj.variables.proposerTypeRep = 2

  // immutable project details
  obj.variables.proposeProportion = 20
  obj.variables.proposeReward = 100

  // validating details
  obj.variables.valTrueOnly = 0
  obj.variables.valFalseOnly = 1
  obj.variables.valTrueMore = 2
  obj.variables.valFalseMore = 3
  obj.variables.valNeither = 4

  // voting details
  obj.variables.secretSalt = 10000
  obj.variables.voteYes = 1
  obj.variables.voteNo = 0

  obj.variables.voteAmountLess = 2
  obj.variables.voteAmount = 3
  obj.variables.voteAmountMore = 4

  obj.variables.voteNeither = 0
  obj.variables.voteTrueOnly = 1
  obj.variables.voteFalseOnly = 2
  obj.variables.voteTrueMore = 3
  obj.variables.voteFalseMore = 4

  // set up contracts
  obj.contracts.setContracts = async function () {
    obj.contracts.TR = await TokenRegistry.deployed()
    obj.contracts.RR = await ReputationRegistry.deployed()
    obj.contracts.DT = await DistributeToken.deployed()
    obj.contracts.PR = await ProjectRegistry.deployed()
    obj.contracts.PL = await ProjectLibrary.deployed()
    obj.contracts.PLCR = await PLCRVoting.deployed()
  }

  obj.contracts.setContract = function (type, contract) {
    obj.contracts[type] = contract
  }

  // mint & register functions
  obj.utils.mint = async function (details) {
    let _DT, _numTokens
    details.DT === undefined
      ? _DT = obj.contracts.DT
      : _DT = details.DT
    details.numTokens === undefined
      ? _numTokens = obj.variables.tokensToMint
      : _numTokens = details.numTokens
    let mintingCost = await obj.utils.get({fn: _DT.weiRequired, params: _numTokens})
    await _DT.mint(_numTokens, {from: details.user, value: mintingCost})
  }

  obj.utils.mintIfNecessary = async function (details) {
    let _DT, _numTokens
    details.DT === undefined
      ? _DT = obj.contracts.DT
      : _DT = details.DT
    details.numTokens === undefined
      ? _numTokens = obj.variables.tokensToMint
      : _numTokens = details.numTokens
    let bal = await obj.utils.get({fn: _DT.balances, params: details.user})
    if (_numTokens > bal) {
      await obj.utils.mint({DT: _DT, user: details.user, numTokens: _numTokens - bal})
    }
  }

  obj.utils.sell = async function (details) {
    let _numTokens, _DT
    details.DT === undefined
      ? _DT = obj.contracts.DT
      : _DT = details.DT
    details.numTokens === undefined
      ? _numTokens = await obj.utils.get({fn: _DT.balances, params: details.user, bn: false})
      : _numTokens = details.numTokens
    await _DT.sell(_numTokens, {from: details.user})
  }

  obj.utils.register = async function (details) {
    let _RR
    details.RR === undefined
      ? _RR = obj.contracts.RR
      : _RR = details.RR
    let user = await obj.utils.get({fn: _RR.users, params: details.user})
    let bal = user[0]
    let registered = user[1]
    if (bal.toNumber() === 0 && !registered) {
      await _RR.register({from: details.user})
    }
  }

  // general getters
  obj.utils.get = async function (details) {
    let returnVal
    details.params !== undefined
      ? returnVal = await details.fn(details.params)
      : returnVal = await details.fn()
    if (details.position !== undefined) {
      returnVal = returnVal[details.position]
    }
    return details.bn === false
      ? returnVal.toNumber()
      : returnVal
  }

  obj.project.get = async function (details) {
    let returnVal
    details.params !== undefined
      ? returnVal = await Project.at(details.projAddr)[details.fn](details.params)
      : returnVal = await Project.at(details.projAddr)[details.fn]()
    return details.bn === false
      ? returnVal.toNumber()
      : returnVal
  }

  obj.task.get = async function (details) {
    let taskAddr, returnVal
    details.taskAddr !== undefined
      ? taskAddr = details.taskAddr
      : taskAddr = await obj.project.get({projAddr: details.projAddr, fn: 'tasks', params: details.index})
    details.params !== undefined
      ? returnVal = await Task.at(taskAddr)[details.fn](details.params)
      : returnVal = await Task.at(taskAddr)[details.fn]()
    return details.bn === false
      ? returnVal.toNumber()
      : returnVal
  }

  // obj.utils.getRepHolders = async function () {
  //   let repHolders = await obj.contracts.RR.totalUsers()
  //   return repHolders.toNumber()
  // }
  //
  // obj.utils.getTokenBalance = async function (_user) {
  //   let bal = await obj.contracts.DT.balances(_user)
  //   return bal.toNumber()
  // }
  //
  // obj.utils.getRepBalance = async function (_user, _unadulterated) {
  //   let bal = await obj.contracts.RR.users(_user)
  //   return _unadulterated
  //     ? bal[0]
  //     : bal[0].toNumber()
  // }
  //
  // obj.utils.getTotalTokens = async function (_altDT) {
  //   let total
  //   if (_altDT !== undefined) {
  //     let DT = await DistributeToken.at(_altDT)
  //     total = await DT.totalSupply()
  //   } else {
  //     total = await obj.contracts.DT.totalSupply()
  //   }
  //   return total.toNumber()
  // }
  //
  // obj.utils.getTotalRep = async function () {
  //   let total = await obj.contracts.RR.totalSupply()
  //   return total.toNumber()
  // }
  //
  // obj.utils.getWeiPoolBal = async function (_unadulterated) {
  //   let weiBal = await obj.contracts.DT.weiBal()
  //   return _unadulterated
  //     ? weiBal
  //     : weiBal.toNumber()
  // }
  //
  // obj.utils.getCurrentPrice = async function (_unadulterated, _altDT) {
  //   let currPrice
  //   if (_altDT !== undefined) {
  //     let DT = await DistributeToken.at(_altDT)
  //     currPrice = DT.currentPrice()
  //   } else {
  //     currPrice = await obj.contracts.DT.currentPrice()
  //   }
  //   return _unadulterated
  //     ? currPrice
  //     : currPrice.toNumber()
  // }
  // obj.utils.getBaseCost = async function () {
  //   let baseCost = await obj.contracts.DT.baseCost()
  //   return baseCost.toNumber()
  // }
  //
  // obj.utils.getWeiRequired = async function (_tokens) {
  //   let weiReq = await obj.contracts.DT.weiRequired(_tokens)
  //   return weiReq.toNumber()
  // }

  obj.utils.calculateWeiRequired = async function (details) {
    let _DT
    details.DT === undefined
      ? _DT = obj.contracts.DT
      : _DT = details.DT
    let targPrice = await obj.utils.calculateTargetPrice({DT: _DT, tokens: details.tokens})
    return targPrice.times(details.tokens).toNumber()
  }

  obj.utils.calculateTargetPrice = async function (details) {
    let currPrice = await obj.utils.get({fn: details.DT.currentPrice})
    let totalSupply = await obj.utils.get({fn: details.DT.totalSupply, bn: false})
    let newSupply = totalSupply + details.tokens
    let weiReq = currPrice.times(1000 + Math.round(details.tokens * 1000 / newSupply)) // emulate Divison.percent() precision of 3
    return weiReq.div(1000)
  }

  obj.utils.calculateBurnPrice = async function (details) {
    let _DT
    details.DT === undefined
      ? _DT = obj.contracts.DT
      : _DT = details.DT
    let currPrice = await obj.utils.get({fn: _DT.currentPrice})
    return currPrice.times(details.tokens).toNumber()
  }

  // obj.utils.getRewardWeighting = async function (_index) {
  //   return (_index >= 0 && _index < 5)
  //     ? obj.contracts.PR.validationRewardWeightings(_index)
  //     : null
  // }
  //
  // obj.project.getState = async function (_projAddr) {
  //   let PROJ = await Project.at(_projAddr)
  //   let state = await PROJ.state()
  //   return state.toNumber()
  // }
  //
  // obj.project.getWeiCost = async function (_projAddr, _unadulterated) {
  //   let PROJ = await Project.at(_projAddr)
  //   let weiCost = await PROJ.weiCost()
  //   return _unadulterated
  //     ? weiCost
  //     : weiCost.toNumber()
  // }
  //
  // obj.project.getProposedWeiCost = async function (_projAddr, _unadulterated) {
  //   let PROJ = await Project.at(_projAddr)
  //   let weiCost = await PROJ.proposedCost()
  //   return _unadulterated
  //     ? weiCost
  //     : weiCost.toNumber()
  // }
  //
  // obj.project.getWeiBal = async function (_projAddr, _unadulterated) {
  //   let PROJ = await Project.at(_projAddr)
  //   let weiBal = await PROJ.weiBal()
  //   return _unadulterated
  //     ? weiBal
  //     : weiBal.toNumber()
  // }

  obj.project.calculateWeiRemaining = async function (details) {
    let weiCost = await obj.project.get({projAddr: details.projAddr, fn: 'weiCost'})
    let weiBal = await obj.project.get({projAddr: details.projAddr, fn: 'weiBal'})
    return weiCost.minus(weiBal)
  }

  // obj.project.getRepCost = async function (_projAddr, _unadulterated) {
  //   let PROJ = await Project.at(_projAddr)
  //   let repCost = await PROJ.reputationCost()
  //   return _unadulterated
  //     ? repCost
  //     : repCost.toNumber()
  // }
  //
  // obj.project.getValidationReward = async function (_projAddr, _unadulterated) {
  //   let PROJ = await Project.at(_projAddr)
  //   let validationReward = await PROJ.validationReward()
  //   return _unadulterated
  //     ? validationReward
  //     : validationReward.toNumber()
  // }
  //
  // obj.project.getOriginatorReward = async function (_projAddr, _unadulterated) {
  //   let PROJ = await Project.at(_projAddr)
  //   let originatorReward = await PROJ.originatorReward()
  //   return _unadulterated
  //     ? originatorReward
  //     : originatorReward.toNumber()
  // }

  obj.project.calculateRequiredTokens = async function (details) {
    let _DT
    details.DT === undefined
      ? _DT = obj.contracts.DT
      : _DT = details.DT
    let weiRemaining = await obj.project.calculateWeiRemaining({projAddr: details.projAddr})
    let currPrice = await obj.utils.get({fn: _DT.currentPrice})
    let requiredTokens = Math.ceil(weiRemaining.div(currPrice))
    return parseInt(requiredTokens)
  }

  // obj.project.getRequiredReputation = async function (_projAddr) {
  //   let PROJ = await Project.at(_projAddr)
  //   let requiredRep = await PROJ.reputationCost()
  //   return requiredRep.toNumber()
  // }
  //
  // obj.project.getStakedTokens = async function (_projAddr) {
  //   let PROJ = await Project.at(_projAddr)
  //   let stakedTokens = await PROJ.tokensStaked()
  //   return stakedTokens.toNumber()
  // }
  //
  // obj.project.getStakedRep = async function (_projAddr) {
  //   let PROJ = await Project.at(_projAddr)
  //   let stakedRep = await PROJ.reputationStaked()
  //   return stakedRep.toNumber()
  // }
  //
  // obj.project.getUserStakedTokens = async function (_user, _projAddr) {
  //   let PROJ = await Project.at(_projAddr)
  //   let stakedTokens = await PROJ.tokenBalances(_user)
  //   return stakedTokens.toNumber()
  // }
  //
  // obj.project.getUserStakedRep = async function (_user, _projAddr) {
  //   let PROJ = await Project.at(_projAddr)
  //   let stakedRep = await PROJ.reputationBalances(_user)
  //   return stakedRep.toNumber()
  // }
  //
  // obj.project.getProposerStake = async function (_projAddr) {
  //   let PROJ = await Project.at(_projAddr)
  //   let propStake = await PROJ.proposerStake()
  //   return propStake.toNumber()
  // }
  //
  // obj.project.getProposerType = async function (_projAddr) {
  //   let PROJ = await Project.at(_projAddr)
  //   let propStake = await PROJ.proposerType()
  //   return propStake.toNumber()
  // }
  //
  // obj.project.getNextDeadline = async function (_projAddr) {
  //   let PROJ = await Project.at(_projAddr)
  //   let nextDeadline = await PROJ.nextDeadline()
  //   return nextDeadline.toNumber()
  // }
  //
  // obj.project.getStakedStatePeriod = async function (_projAddr) {
  //   let PROJ = await Project.at(_projAddr)
  //   let stakedStatePeriod = await PROJ.stakedStatePeriod()
  //   return stakedStatePeriod.toNumber()
  // }
  //
  // obj.project.getProposer = async function (_projAddr) {
  //   let PROJ = await Project.at(_projAddr)
  //   let proposer = await PROJ.proposer()
  //   return proposer
  // }

  obj.project.calculateWeightOfAddress = async function (details) {
    let stakedRep = await obj.project.get({projAddr: details.projAddr, fn: 'reputationBalances', params: details.user})
    let totalRep = await obj.project.get({projAddr: details.projAddr, fn: 'reputationStaked'})
    let repWeighting = Math.round(stakedRep * 100 / totalRep) // emulate Divison.percent() precision of 2

    let stakedTokens = await obj.project.get({projAddr: details.projAddr, fn: 'tokenBalances', params: details.user})
    let totalTokens = await obj.project.get({projAddr: details.projAddr, fn: 'tokensStaked'})
    let tokenWeighting = Math.round(stakedTokens * 100 / totalTokens) // emulate Divison.percent() precision of 2

    return Math.floor((repWeighting + tokenWeighting) / 2)
  }

  // obj.project.getTasks = async function (_projAddr, _index) {
  //   let PROJ = await Project.at(_projAddr)
  //   let task = await PROJ.tasks(_index)
  //   return task
  // }
  //
  // obj.project.getHashListSubmitted = async function (_projAddr) {
  //   let PROJ = await Project.at(_projAddr)
  //   let submitted = await PROJ.hashListSubmitted()
  //   return submitted
  // }

  obj.project.calculateWeiVal = async function (details) {
    let weiCost = await obj.project.get({projAddr: details.projAddr, fn: 'proposedCost'})
    let weiVal = Math.floor((weiCost.times(details.weighting).div(100)))
    return weiVal
  }

  obj.project.calculateRepVal = async function (details) {
    let repCost = await obj.project.get({projAddr: details.projAddr, fn: 'reputationCost'})
    let repVal = Math.floor((repCost.times(details.weighting).div(100)))
    return repVal
  }

  // obj.project.getTaskCount = async function (_projAddr) {
  //   let PROJ = await Project.at(_projAddr)
  //   let taskCount = await PROJ.getTaskCount()
  //   return taskCount
  // }
  //
  // obj.project.getPassAmount = async function (_projAddr) {
  //   let PROJ = await Project.at(_projAddr)
  //   let passAmount = await PROJ.passAmount()
  //   return passAmount
  // }
  //
  // obj.task.getTaskHash = async function (_taskAddr) {
  //   let TASK = await Task.at(_taskAddr)
  //   let taskHash = await TASK.taskHash()
  //   return taskHash
  // }
  //
  // obj.task.getPRAddress = async function (_taskAddr) {
  //   let TASK = await Task.at(_taskAddr)
  //   let PRAddress = await TASK.projectRegistryAddress()
  //   return PRAddress
  // }
  //
  // obj.task.getTRAddress = async function (_taskAddr) {
  //   let TASK = await Task.at(_taskAddr)
  //   let TRAddress = await TASK.tokenRegistryAddress()
  //   return TRAddress
  // }
  //
  // obj.task.getRRAddress = async function (_taskAddr) {
  //   let TASK = await Task.at(_taskAddr)
  //   let RRAddress = await TASK.reputationRegistryAddress()
  //   return RRAddress
  // }
  //
  // obj.task.getWeighting = async function (_projAddr, _index, _unadulterated) {
  //   let taskAddr = await obj.project.getTasks(_projAddr, _index)
  //   let TASK = await Task.at(taskAddr)
  //   let weighting = await TASK.weighting()
  //   return _unadulterated
  //     ? weighting
  //     : weighting.toNumber()
  // }
  //
  // obj.task.getWeiReward = async function (_projAddr, _index, _unadulterated) {
  //   let taskAddr = await obj.project.getTasks(_projAddr, _index)
  //   let TASK = await Task.at(taskAddr)
  //   let weiReward = await TASK.weiReward()
  //   return _unadulterated
  //     ? weiReward
  //     : weiReward.toNumber()
  // }
  //
  // obj.task.getRepReward = async function (_projAddr, _index) {
  //   let taskAddr = await obj.project.getTasks(_projAddr, _index)
  //   let TASK = await Task.at(taskAddr)
  //   let repReward = await TASK.reputationReward()
  //   return repReward.toNumber()
  // }
  //
  // obj.task.getComplete = async function (_projAddr, _index) {
  //   let taskAddr = await obj.project.getTasks(_projAddr, _index)
  //   let TASK = await Task.at(taskAddr)
  //   let complete = await TASK.complete()
  //   return complete
  // }
  //
  // obj.task.getClaimer = async function (_projAddr, _index) {
  //   let taskAddr = await obj.project.getTasks(_projAddr, _index)
  //   let TASK = await Task.at(taskAddr)
  //   let claimer = await TASK.claimer()
  //   return claimer
  // }
  //
  // obj.task.getValidationEntryFee = async function (_projAddr, _index) {
  //   let taskAddr = await obj.project.getTasks(_projAddr, _index)
  //   let TASK = await Task.at(taskAddr)
  //   let validationEntryFee = await TASK.validationEntryFee()
  //   return validationEntryFee.toNumber()
  // }
  //
  // obj.task.getValDetails = async function (_projAddr, _index, _user) {
  //   let taskAddr = await obj.project.getTasks(_projAddr, _index)
  //   let TASK = await Task.at(taskAddr)
  //   // struct elements: status, index, initialized
  //   let valBal = await TASK.validators(_user)
  //   return valBal
  // }
  //
  // obj.task.getValidationIndex = async function (_projAddr, _index, _bool) {
  //   let taskAddr = await obj.project.getTasks(_projAddr, _index)
  //   let TASK = await Task.at(taskAddr)
  //   let index
  //   _bool
  //     ? index = await TASK.affirmativeIndex()
  //     : index = await TASK.negativeIndex()
  //   return index.toNumber()
  // }
  //
  // obj.task.getValidatorAtIndex = async function (_projAddr, _taskIndex, _valIndex, _bool) {
  //   let taskAddr = await obj.project.getTasks(_projAddr, _taskIndex)
  //   let TASK = await Task.at(taskAddr)
  //   let valAtIndex
  //   _bool
  //     ? valAtIndex = await TASK.affirmativeValidators(_valIndex)
  //     : valAtIndex = await TASK.negativeValidators(_valIndex)
  //   return valAtIndex
  // }
  //
  // obj.task.getClaimable = async function (_projAddr, _index) {
  //   let taskAddr = await obj.project.getTasks(_projAddr, _index)
  //   let TASK = await Task.at(taskAddr)
  //   let claimable = await TASK.claimable()
  //   return claimable
  // }
  //
  // obj.task.getClaimableByRep = async function (_projAddr, _index) {
  //   let taskAddr = await obj.project.getTasks(_projAddr, _index)
  //   let TASK = await Task.at(taskAddr)
  //   let claimable = await TASK.claimableByRep()
  //   return claimable
  // }
  //
  // obj.task.getPollNonce = async function (_projAddr, _index) {
  //   let taskAddr = await obj.project.getTasks(_projAddr, _index)
  //   let TASK = await Task.at(taskAddr)
  //   let poll = await TASK.pollId()
  //   return poll.toNumber()
  // }
  //
  // obj.task.getPollMap = async function (_projAddr, _index) {
  //   let pollNonce = await obj.task.getPollNonce(_projAddr, _index)
  //   let pollMap = await obj.contracts.PLCR.pollMap(pollNonce)
  //   let pollMapNumber = []
  //   for (let i = 0; i < pollMap.length; i++) {
  //     pollMapNumber[i] = pollMap[i].toNumber()
  //   }
  //   return pollMapNumber
  // }
  //
  // obj.task.getPollEnded = async function (_projAddr, _index) {
  //   let pollId = await obj.task.getPollNonce(_projAddr, _index)
  //   let pollEnded = await obj.contracts.PLCR.pollEnded(pollId)
  //   return pollEnded
  // }

  // project return functions
  // return project (address) proposed by token holder
  obj.returnProject.proposed_T = async function (_cost, _stakingPeriod, _ipfsHash, _DT, _TR, _RR) {
    if (_DT === undefined) {
      _DT = obj.contracts.DT
    }
    if (_TR === undefined) {
      _TR = obj.contracts.TR
    }
    if (_RR === undefined) {
      _RR = obj.contracts.RR
    }

    // seed the system with tokens and rep
    await obj.utils.mintIfNecessary({user: obj.user.tokenProposer, DT: _DT})
    await obj.utils.register({user: obj.user.repProposer, RR: _RR})

    // ensure proposer has enough tokens
    let weiBal = await obj.utils.get({fn: _DT.weiBal, bn: false})
    let totalTokens = await obj.utils.get({fn: _DT.totalSupply, bn: false})
    let proposerTokenCost = Math.floor((_cost / weiBal / obj.variables.proposeProportion) * totalTokens)
    await obj.utils.mintIfNecessary({user: obj.user.tokenProposer, numTokens: proposerTokenCost, DT: _DT})

    // propose project
    let tx = await _TR.proposeProject(_cost, _stakingPeriod, _ipfsHash, {from: obj.user.tokenProposer})
    return tx.receipt.logs[0].address // return project address
  }

  // return project (address) proposed by reputation holder
  obj.returnProject.proposed_R = async function (_cost, _stakingPeriod, _ipfsHash, _DT, _RR) {
    if (_DT === undefined) {
      _DT = obj.contracts.DT
    }
    if (_RR === undefined) {
      _RR = obj.contracts.RR
    }
    // seed the system with tokens and rep
    await obj.utils.mintIfNecessary({user: obj.user.tokenProposer, DT: _DT})
    await obj.utils.register({user: obj.user.repProposer, RR: _RR})

    // propose project
    let tx = await _RR.proposeProject(_cost, _stakingPeriod, _ipfsHash, {from: obj.user.repProposer})
    return tx.receipt.logs[0].address // return project address
  }

  // return expired projects (addresses) proposed by token holder and reputation holder
  // moves ganache forward 1 week
  obj.returnProject.expired = async function (_cost, _stakingPeriod, _ipfsHash, _numSets, _DT, _TR, _RR, _PR) {
    if (_DT === undefined) {
      _DT = obj.contracts.DT
    }
    if (_TR === undefined) {
      _TR = obj.contracts.TR
    }
    if (_RR === undefined) {
      _RR = obj.contracts.RR
    }
    if (_PR === undefined) {
      _PR = obj.contracts.PR
    }
    // make array of projects
    let projArray = []

    for (let i = 0; i < _numSets; i++) {
      // get proposed projects
      let temp1 = await obj.returnProject.proposed_T(_cost, _stakingPeriod, _ipfsHash, _DT, _TR, _RR)
      let temp2 = await obj.returnProject.proposed_R(_cost, _stakingPeriod, _ipfsHash, _DT, _RR)
      projArray.push([temp1, temp2])
    }

    for (let i = 0; i < _numSets; i++) {
      for (let j = 0; j < 2; j++) {
        // get tokens required to fully stake the project and stake half of them
        await obj.utils.mintIfNecessary({user: obj.user.tokenStaker1, numTokens: 5000, DT: _DT})

        let requiredTokens = await obj.project.calculateRequiredTokens({DT: _DT, projAddr: projArray[i][j]})
        let tokensToStake = Math.floor(requiredTokens / 2)

        let tsBal = await obj.utils.get({fn: _DT.balances, params: obj.user.tokenStaker1, bn: false})

        assert.isAtLeast(tsBal, tokensToStake, 'tokenStaker1 doesn\'t have enough tokens to stake')

        // stake
        await _TR.stakeTokens(projArray[i][j], tokensToStake, {from: obj.user.tokenStaker1})

        // register reputation stakers
        await obj.utils.register({user: obj.user.repStaker1, RR: _RR})

        // get reputation required to fully stake the project and stake half of it
        let requiredRep = await obj.project.get({projAddr: projArray[i][j], fn: 'reputationCost'})
        let repToStake = Math.floor(requiredRep / 2)

        // assert that repStaker1 has the reputation to stake
        let rsBal = await obj.utils.get({fn: _RR.users, params: obj.user.repStaker1, bn: false, position: 0})
        assert.isAtLeast(rsBal, repToStake, 'repStaker1 doesn\'t have enough rep to stake')

        // stake
        await _RR.stakeReputation(projArray[i][j], repToStake, {from: obj.user.repStaker1})
      }
    }

    // increase time 1 week + 1 ms to make sure that checkStaked() doesn't bug out
    await evmIncreaseTime(2 * 604801)

    for (let i = 0; i < _numSets; i++) {
      // call checkStaked on projects and do checks
      await _PR.checkStaked(projArray[i][0])
      await _PR.checkStaked(projArray[i][1])

      // check that the project is in state 8
      let stateT = await obj.project.get({projAddr: projArray[i][0], fn: 'state'})
      let stateR = await obj.project.get({projAddr: projArray[i][1], fn: 'state'})
      assert.equal(stateT, 8, 'project is not in expired state')
      assert.equal(stateR, 8, 'project is not in expired state')
    }

    return projArray
  }
  // return staked project (address) proposed by token holder
  obj.returnProject.staked_T = async function (_cost, _stakingPeriod, _ipfsHash, _DT, _TR, _RR, _PR) {
    if (_DT === undefined) {
      _DT = obj.contracts.DT
    }
    if (_TR === undefined) {
      _TR = obj.contracts.TR
    }
    if (_RR === undefined) {
      _RR = obj.contracts.RR
    }
    if (_PR === undefined) {
      _PR = obj.contracts.PR
    }
    // get proposed project
    let _projAddr = await obj.returnProject.proposed_T(_cost, _stakingPeriod, _ipfsHash, _DT, _TR, _RR)

    // stake tokens & reputation
    await obj.returnProject.stakeTokens(_projAddr, _DT, _TR)
    await obj.returnProject.stakeReputation(_projAddr, _RR)

    // check that the project is in state 2
    let state = await obj.project.get({projAddr: _projAddr, fn: 'state'})
    assert.equal(state, 2, 'project is not in staked state')
    return _projAddr
  }

  // return staked project (address) proposed by reputation holder
  obj.returnProject.staked_R = async function (_cost, _stakingPeriod, _ipfsHash, _DT, _TR, _RR, _PR) {
    if (_DT === undefined) {
      _DT = obj.contracts.DT
    }
    if (_TR === undefined) {
      _TR = obj.contracts.TR
    }
    if (_RR === undefined) {
      _RR = obj.contracts.RR
    }
    if (_PR === undefined) {
      _PR = obj.contracts.PR
    }

    // get proposed project
    let _projAddr = await obj.returnProject.proposed_R(_cost, _stakingPeriod, _ipfsHash, _DT, _RR)

    // stake tokens & reputation
    await obj.returnProject.stakeTokens(_projAddr, _DT, _TR)
    await obj.returnProject.stakeReputation(_projAddr, _RR)

    // check that the project is in state 2
    let state = await obj.project.get({projAddr: _projAddr, fn: 'state'})
    assert.equal(state, 2, 'project is not in staked state')
    return _projAddr
  }

  // return active projects (addresses) proposed by token holder and reputation holder
  // moves ganache forward 1 week
  obj.returnProject.active = async function (_cost, _stakingPeriod, _ipfsHash, _numSets, _tasks, _DT, _TR, _RR, _PR) {
    if (_DT === undefined) {
      _DT = obj.contracts.DT
    }
    if (_TR === undefined) {
      _TR = obj.contracts.TR
    }
    if (_RR === undefined) {
      _RR = obj.contracts.RR
    }
    if (_PR === undefined) {
      _PR = obj.contracts.PR
    }

    // make array of projects
    let projArray = []

    for (let i = 0; i < _numSets; i++) {
      // get staked projects
      let temp1 = await obj.returnProject.staked_T(_cost, _stakingPeriod, _ipfsHash, _DT, _TR, _RR, _PR)
      let temp2 = await obj.returnProject.staked_R(_cost, _stakingPeriod, _ipfsHash, _DT, _TR, _RR, _PR)
      projArray.push([temp1, temp2])

      // add task hashes to both projects by at least 50% of the stakers
      for (let j = 0; j < 2; j++) {
        await _PR.addTaskHash(projArray[i][j], keccakHashes.hashTasksArray(_tasks), {from: obj.user.tokenStaker1})
        await _PR.addTaskHash(projArray[i][j], keccakHashes.hashTasksArray(_tasks), {from: obj.user.tokenStaker2})
        await _PR.addTaskHash(projArray[i][j], keccakHashes.hashTasksArray(_tasks), {from: obj.user.repStaker1})
        await _PR.addTaskHash(projArray[i][j], keccakHashes.hashTasksArray(_tasks), {from: obj.user.repStaker2})
      }
    }

    // increase time 1 week + 1 ms to make sure that checkActive() doesn't bug out
    await evmIncreaseTime(604801)

    for (let i = 0; i < _numSets; i++) {
      // call checkActive on projects and do checks
      await _PR.checkActive(projArray[i][0])
      await _PR.checkActive(projArray[i][1])

      // check that the project is in state 3
      let stateT = await obj.project.get({projAddr: projArray[i][0], fn: 'state'})
      let stateR = await obj.project.get({projAddr: projArray[i][1], fn: 'state'})
      assert.equal(stateT, 3, 'project is not in active state')
      assert.equal(stateR, 3, 'project is not in active state')
    }

    return projArray
  }

  // return validating projects (addresses) proposed by token holder and reputation holder
  // takes a list of tasks and a _numComplete integer parameter of how many tasks should be marked complete
  // moves ganache forward 3 weeks
  obj.returnProject.validating = async function (_cost, _stakingPeriod, _ipfsHash, _tasks, _numComplete, _DT, _TR, _RR, _PR) {
    if (_DT === undefined) {
      _DT = obj.contracts.DT
    }
    if (_TR === undefined) {
      _TR = obj.contracts.TR
    }
    if (_RR === undefined) {
      _RR = obj.contracts.RR
    }
    if (_PR === undefined) {
      _PR = obj.contracts.PR
    }

    // get array of active projects
    // moves ganache forward 1 week
    let projArray = await obj.returnProject.active(_cost, _stakingPeriod, _ipfsHash, 1, _tasks, _DT, _TR, _RR, _PR)

    // register workers
    await obj.utils.register({user: obj.user.worker1, RR: _RR})
    await obj.utils.register({user: obj.user.worker2, RR: _RR})

    // make worker array
    let workerArray = [obj.user.worker1, obj.user.worker2]

    await _PR.submitHashList(projArray[0][0], keccakHashes.hashTasks(_tasks), {from: obj.user.repStaker1})
    await _PR.submitHashList(projArray[0][1], keccakHashes.hashTasks(_tasks), {from: obj.user.repStaker1})
    for (let j = 0; j < _numComplete; j++) {
      // get description and weighting of task with index j
      let description = _tasks[j].description
      let weighting = _tasks[j].weighting

      // claim task j
      await _RR.claimTask(projArray[0][0], j, description, weighting, {from: workerArray[j % 2]})
      await _RR.claimTask(projArray[0][1], j, description, weighting, {from: workerArray[j % 2]})

      // mark task j complete
      await _PR.submitTaskComplete(projArray[0][0], j, {from: workerArray[j % 2]})
      await _PR.submitTaskComplete(projArray[0][1], j, {from: workerArray[j % 2]})
    }
    // increase time 2 weeks + 1 ms to make sure that checkValidating() doesn't bug out
    await evmIncreaseTime(2 * 604801)

    // call check validate for each project
    await _PR.checkValidate(projArray[0][0])
    await _PR.checkValidate(projArray[0][1])

    // assert that project is in state 4
    let stateT = await obj.project.get({projAddr: projArray[0][0], fn: 'state'})
    let stateR = await obj.project.get({projAddr: projArray[0][1], fn: 'state'})
    assert.equal(stateT, 4, 'project T not in validating state')
    assert.equal(stateR, 4, 'project R not in validating state')

    return projArray
  }

  // return voting projects (addresses) proposed by token holder and reputation holder
  // takes a list of tasks and a _valType array parameter of how validated type
  // incomplete tasks are at the end
  // 0: validate true only
  // 1: validate false only
  // 2: validate both (true > false)
  // 3: validate both (false > true)
  // 4: validate neither
  // moves ganache forward 4 weeks
  obj.returnProject.voting = async function (_cost, _stakingPeriod, _ipfsHash, _tasks, _numComplete, _valType, _DT, _TR, _RR, _PR) {
    if (_DT === undefined) {
      _DT = obj.contracts.DT
    }
    if (_TR === undefined) {
      _TR = obj.contracts.TR
    }
    if (_RR === undefined) {
      _RR = obj.contracts.RR
    }
    if (_PR === undefined) {
      _PR = obj.contracts.PR
    }

    // get array of validating projects
    let projArray = await obj.returnProject.validating(_cost, _stakingPeriod, _ipfsHash, _tasks, _numComplete, _DT, _TR, _RR, _PR)

    for (let j = 0; j < _numComplete; j++) {
      let validationEntryFee1 = parseInt(await obj.task.get({projAddr: projArray[0][0], index: j, fn: 'validationEntryFee'}))
      let validationEntryFee2 = parseInt(await obj.task.get({projAddr: projArray[0][1], index: j, fn: 'validationEntryFee'}))
      let totalValEntryFee = validationEntryFee1 + validationEntryFee2
      await obj.utils.mintIfNecessary({user: obj.user.validator1, numTokens: totalValEntryFee, DT: _DT})
      await obj.utils.mintIfNecessary({user: obj.user.validator2, numTokens: totalValEntryFee, DT: _DT})
      await obj.utils.mintIfNecessary({user: obj.user.validator3, numTokens: totalValEntryFee, DT: _DT})

      if (_valType[j] === obj.variables.valTrueOnly) {
        await _TR.validateTask(projArray[0][0], j, true, {from: obj.user.validator1})
        await _TR.validateTask(projArray[0][1], j, true, {from: obj.user.validator1})
      } else if (_valType[j] === obj.variables.valFalseOnly) {
        await _TR.validateTask(projArray[0][0], j, false, {from: obj.user.validator1})
        await _TR.validateTask(projArray[0][1], j, false, {from: obj.user.validator1})
      } else if (_valType[j] === obj.variables.valTrueMore) {
        await _TR.validateTask(projArray[0][0], j, true, {from: obj.user.validator1})
        await _TR.validateTask(projArray[0][1], j, true, {from: obj.user.validator1})
        await _TR.validateTask(projArray[0][0], j, false, {from: obj.user.validator2})
        await _TR.validateTask(projArray[0][1], j, false, {from: obj.user.validator2})
        await _TR.validateTask(projArray[0][0], j, true, {from: obj.user.validator3})
        await _TR.validateTask(projArray[0][1], j, true, {from: obj.user.validator3})
      } else if (_valType[j] === obj.variables.valFalseMore) {
        await _TR.validateTask(projArray[0][0], j, true, {from: obj.user.validator1})
        await _TR.validateTask(projArray[0][1], j, true, {from: obj.user.validator1})
        await _TR.validateTask(projArray[0][0], j, false, {from: obj.user.validator2})
        await _TR.validateTask(projArray[0][1], j, false, {from: obj.user.validator2})
        await _TR.validateTask(projArray[0][0], j, false, {from: obj.user.validator3})
        await _TR.validateTask(projArray[0][1], j, false, {from: obj.user.validator3})
      } else if (_valType[j] === obj.variables.valNeither) {
        // do nothing
      }
    }
    // increase time 1 week + 1 ms to make sure that checkVoting() doesn't bug out
    await evmIncreaseTime(604801)

    // call check voting for each project
    await _PR.checkVoting(projArray[0][0])
    await _PR.checkVoting(projArray[0][1])

    // assert that project is in state 5
    let stateT = await obj.project.get({projAddr: projArray[0][0], fn: 'state'})
    let stateR = await obj.project.get({projAddr: projArray[0][1], fn: 'state'})
    assert.equal(stateT, 5, 'project T not in voting state')
    assert.equal(stateR, 5, 'project R not in voting state')

    return projArray
  }

  // return finished projects (addresses) proposed by token holder and reputation holder
  // takes a list of tasks, a _voteType array parameter of how voted type, and the intended state of the outcome
  // incomplete tasks are left at the end
  // 0: no votes
  // 1: vote true only
  // 2: vote false only
  // 3: vote both (true > false)
  // 4: vote both (false > true)
  // moves ganache forward 6 weeks
  obj.returnProject.finished = async function (_cost, _stakingPeriod, _ipfsHash, _tasks, _numComplete, _valType, _voteType, _intendedState, _DT, _TR, _RR, _PR) {
    if (_DT === undefined) {
      _DT = obj.contracts.DT
    }
    if (_TR === undefined) {
      _TR = obj.contracts.TR
    }
    if (_RR === undefined) {
      _RR = obj.contracts.RR
    }
    if (_PR === undefined) {
      _PR = obj.contracts.PR
    }

    // get array of voting projects
    let projArray = await obj.returnProject.voting(_cost, _stakingPeriod, _ipfsHash, _tasks, _numComplete, _valType, _DT, _TR, _RR, _PR)
    // vote commit as necessary
    for (let j = 0; j < _numComplete; j++) {
      let secretHash
      await obj.utils.mintIfNecessary({user: obj.user.tokenYesVoter, DT: _DT})
      await obj.utils.mintIfNecessary({user: obj.user.tokenNoVoter, DT: _DT})
      await obj.utils.register({user: obj.user.repYesVoter, RR: _RR})
      await obj.utils.register({user: obj.user.repNoVoter, RR: _RR})

      if (_voteType[j] === obj.variables.voteNeither) {
        // do nothing
      } else if (_voteType[j] === obj.variables.voteTrueOnly) {
        secretHash = ethers.utils.solidityKeccak256(['int', 'int'], [obj.variables.voteYes, obj.variables.secretSalt])
        await _TR.voteCommit(projArray[0][0], j, obj.variables.voteAmountMore, secretHash, 0, {from: obj.user.tokenYesVoter})
        await _TR.voteCommit(projArray[0][1], j, obj.variables.voteAmountMore, secretHash, 0, {from: obj.user.tokenYesVoter})
        await _RR.voteCommit(projArray[0][0], j, obj.variables.voteAmountMore, secretHash, 0, {from: obj.user.repYesVoter})
        await _RR.voteCommit(projArray[0][1], j, obj.variables.voteAmountMore, secretHash, 0, {from: obj.user.repYesVoter})
      } else if (_voteType[j] === obj.variables.voteFalseOnly) {
        secretHash = ethers.utils.solidityKeccak256(['int', 'int'], [obj.variables.voteNo, obj.variables.secretSalt])
        await _TR.voteCommit(projArray[0][0], j, obj.variables.voteAmountMore, secretHash, 0, {from: obj.user.tokenNoVoter})
        await _TR.voteCommit(projArray[0][1], j, obj.variables.voteAmountMore, secretHash, 0, {from: obj.user.tokenNoVoter})
        await _RR.voteCommit(projArray[0][0], j, obj.variables.voteAmountMore, secretHash, 0, {from: obj.user.repNoVoter})
        await _RR.voteCommit(projArray[0][1], j, obj.variables.voteAmountMore, secretHash, 0, {from: obj.user.repNoVoter})
      } else if (_voteType[j] === obj.variables.voteTrueMore) {
        secretHash = ethers.utils.solidityKeccak256(['int', 'int'], [obj.variables.voteYes, obj.variables.secretSalt])
        await _TR.voteCommit(projArray[0][0], j, obj.variables.voteAmountMore, secretHash, 0, {from: obj.user.tokenYesVoter})
        await _TR.voteCommit(projArray[0][1], j, obj.variables.voteAmountMore, secretHash, 0, {from: obj.user.tokenYesVoter})
        await _RR.voteCommit(projArray[0][0], j, obj.variables.voteAmountMore, secretHash, 0, {from: obj.user.repYesVoter})
        await _RR.voteCommit(projArray[0][1], j, obj.variables.voteAmountMore, secretHash, 0, {from: obj.user.repYesVoter})

        secretHash = ethers.utils.solidityKeccak256(['int', 'int'], [obj.variables.voteNo, obj.variables.secretSalt])
        await _TR.voteCommit(projArray[0][0], j, obj.variables.voteAmount, secretHash, 0, {from: obj.user.tokenNoVoter})
        await _TR.voteCommit(projArray[0][1], j, obj.variables.voteAmount, secretHash, 0, {from: obj.user.tokenNoVoter})
        await _RR.voteCommit(projArray[0][0], j, obj.variables.voteAmount, secretHash, 0, {from: obj.user.repNoVoter})
        await _RR.voteCommit(projArray[0][1], j, obj.variables.voteAmount, secretHash, 0, {from: obj.user.repNoVoter})
      } else if (_voteType[j] === obj.variables.voteFalseMore) {
        secretHash = ethers.utils.solidityKeccak256(['int', 'int'], [obj.variables.voteYes, obj.variables.secretSalt])
        await _TR.voteCommit(projArray[0][0], j, obj.variables.voteAmountLess, secretHash, 0, {from: obj.user.tokenYesVoter})
        await _TR.voteCommit(projArray[0][1], j, obj.variables.voteAmountLess, secretHash, 0, {from: obj.user.tokenYesVoter})
        await _RR.voteCommit(projArray[0][0], j, obj.variables.voteAmountLess, secretHash, 0, {from: obj.user.repYesVoter})
        await _RR.voteCommit(projArray[0][1], j, obj.variables.voteAmountLess, secretHash, 0, {from: obj.user.repYesVoter})

        secretHash = ethers.utils.solidityKeccak256(['int', 'int'], [obj.variables.voteNo, obj.variables.secretSalt])
        await _TR.voteCommit(projArray[0][0], j, obj.variables.voteAmount, secretHash, 0, {from: obj.user.tokenNoVoter})
        await _TR.voteCommit(projArray[0][1], j, obj.variables.voteAmount, secretHash, 0, {from: obj.user.tokenNoVoter})
        await _RR.voteCommit(projArray[0][0], j, obj.variables.voteAmount, secretHash, 0, {from: obj.user.repNoVoter})
        await _RR.voteCommit(projArray[0][1], j, obj.variables.voteAmount, secretHash, 0, {from: obj.user.repNoVoter})
      }
    }

    // increase time 1 week + 1 ms to make sure that reveal vote doesn't bug out
    await evmIncreaseTime(604801)

    // vote reveal as necessary
    for (let j = 0; j < _numComplete; j++) {
      if (_voteType[j] === obj.variables.voteNeither) {
        // do nothing
      } else if (_voteType[j] === obj.variables.voteTrueOnly || _voteType[j] === obj.variables.voteTrueMore || _voteType[j] === obj.variables.voteFalseMore) {
        await _TR.voteReveal(projArray[0][0], j, obj.variables.voteYes, obj.variables.secretSalt, {from: obj.user.tokenYesVoter})
        await _TR.voteReveal(projArray[0][1], j, obj.variables.voteYes, obj.variables.secretSalt, {from: obj.user.tokenYesVoter})
        await _RR.voteReveal(projArray[0][0], j, obj.variables.voteYes, obj.variables.secretSalt, {from: obj.user.repYesVoter})
        await _RR.voteReveal(projArray[0][1], j, obj.variables.voteYes, obj.variables.secretSalt, {from: obj.user.repYesVoter})
      }
      if (_voteType[j] === obj.variables.voteFalseOnly || _voteType[j] === obj.variables.voteTrueMore || _voteType[j] === obj.variables.voteFalseMore) {
        await _TR.voteReveal(projArray[0][0], j, obj.variables.voteNo, obj.variables.secretSalt, {from: obj.user.tokenNoVoter})
        await _TR.voteReveal(projArray[0][1], j, obj.variables.voteNo, obj.variables.secretSalt, {from: obj.user.tokenNoVoter})
        await _RR.voteReveal(projArray[0][0], j, obj.variables.voteNo, obj.variables.secretSalt, {from: obj.user.repNoVoter})
        await _RR.voteReveal(projArray[0][1], j, obj.variables.voteNo, obj.variables.secretSalt, {from: obj.user.repNoVoter})
      }
    }

    // increase time 1 week + 1 ms to make sure that checkEnd() doesn't bug out
    await evmIncreaseTime(604801)

    // call check end for each project
    await _PR.checkEnd(projArray[0][0])
    await _PR.checkEnd(projArray[0][1])

    // assert that project is in intended state 6 || 7
    let stateT = await obj.project.get({projAddr: projArray[0][0], fn: 'state'})
    let stateR = await obj.project.get({projAddr: projArray[0][1], fn: 'state'})

    assert.equal(stateT, _intendedState, 'project T not in failed or complete state')
    assert.equal(stateR, _intendedState, 'project R not in failed or complete state')

    return projArray
  }

  // fully stake project with tokens via two stakers
  obj.returnProject.stakeTokens = async function (_projAddr, _DT, _TR) {
    if (_DT === undefined) {
      _DT = obj.contracts.DT
    }
    if (_TR === undefined) {
      _TR = obj.contracts.TR
    }

    // fuel token stakers
    await obj.utils.mintIfNecessary({user: obj.user.tokenStaker1, numTokens: 5000, DT: _DT})
    await obj.utils.mintIfNecessary({user: obj.user.tokenStaker2, numTokens: 5000, DT: _DT})

    // get tokens required to fully stake the project and stake half of them
    let requiredTokens = await obj.project.calculateRequiredTokens({DT: _DT, projAddr: _projAddr})
    let tokensToStake = Math.floor(requiredTokens / 2)

    // assert that tokenStaker1 has the tokens to stake
    let tsBal = await obj.utils.get({fn: _DT.balances, params: obj.user.tokenStaker1, bn: false})
    assert.isAtLeast(tsBal, tokensToStake, 'tokenStaker1 doesn\'t have enough tokens to stake')

    // stake
    await _TR.stakeTokens(_projAddr, tokensToStake, {from: obj.user.tokenStaker1})

    // get tokens left to fully stake the project and stake them
    requiredTokens = await obj.project.calculateRequiredTokens({DT: _DT, projAddr: _projAddr}) + 1

    // assert that tokenStaker2 has the tokens to stake
    tsBal = await obj.utils.get({fn: _DT.balances, params: obj.user.tokenStaker2, bn: false})
    assert.isAtLeast(tsBal, requiredTokens, 'tokenStaker2 doesn\'t have enough tokens to stake')

    // stake
    await _TR.stakeTokens(_projAddr, requiredTokens, {from: obj.user.tokenStaker2})
  }

  // fully stake project with reputation via two stakers
  obj.returnProject.stakeReputation = async function (_projAddr, _RR) {
    if (_RR === undefined) {
      _RR = obj.contracts.RR
    }

    // register reputation stakers
    await obj.utils.register({user: obj.user.repStaker1, RR: _RR})
    await obj.utils.register({user: obj.user.repStaker2, RR: _RR})

    // get reputation required to fully stake the project and stake half of it
    let requiredRep = await obj.project.get({projAddr: _projAddr, fn: 'reputationCost', bn: false})

    let repToStake = Math.floor(requiredRep / 2)

    // assert that repStaker1 has the reputation to stake
    let rsBal = await obj.utils.get({fn: _RR.users, params: obj.user.repStaker1, bn: false, position: 0})
    assert.isAtLeast(rsBal, repToStake, 'repStaker1 doesn\'t have enough rep to stake')

    // stake
    await _RR.stakeReputation(_projAddr, repToStake, {from: obj.user.repStaker1})

    // get reputation left to fully stake the project and stake it
    requiredRep = await obj.project.get({projAddr: _projAddr, fn: 'reputationCost', bn: false}) + 1

    // assert that repStaker2 has the reputation to stake
    rsBal = await obj.utils.get({fn: _RR.users, params: obj.user.repStaker2, bn: false, position: 0})
    assert.isAtLeast(rsBal, requiredRep, 'repStaker2 doesn\'t have enough rep to stake')

    // stake
    await _RR.stakeReputation(_projAddr, requiredRep, {from: obj.user.repStaker2})
  }
  return obj
}
