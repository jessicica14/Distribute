
// ===================================================================== //
// This contract manages the ether and balances of stakers & validators of a given project.
// It holds its own state as well, set by a call from the PR.
// ===================================================================== //

pragma solidity ^0.4.10;

import "./TokenRegistry.sol";
import "./ReputationRegistry.sol";
import "./ProjectRegistry.sol";
import "./DistributeToken.sol";

contract Project {
  TokenRegistry tokenRegistry;
  ReputationRegistry reputationRegistry;
  ProjectRegistry projectRegistry;
  DistributeToken distributeToken;
  uint256 public state;
  uint256 public weiBal;
  uint256 nextDeadline;
  //set by proposer, total cost of project in ETH, to be fulfilled by capital token holders
  uint256 public weiCost;
  //total amount of staked worker tokens needed, TBD
  uint256 public reputationCost;

  uint256 public totalStakers;
  uint256 public totalTokensStaked;           //amount of capital tokens currently staked
  uint256 public totalReputationStaked;            //amount of worker tokens currently staked
  mapping (address => uint) stakedTokenBalances;
  mapping (address => uint) stakedReputationBalances;

  struct Validator {
    uint256 status;
    uint256 stake;
  }
 bool validateFlag = false;
 uint256 public validateReward;

  mapping (address => Validator) validators;
  uint256 public totalValidateAffirmative;
  uint256 public totalValidateNegative;

  struct Reward {
    uint256 weiReward;
    uint256 reputationReward;
    address claimer;
  }

  mapping (bytes32 => Reward) public taskRewards;

  // =====================================================================
  // MODIFIERS
  // =====================================================================

  modifier onlyInState(uint256 _state) {
    require(state == _state);
    _;
  }

  modifier onlyPR() {
    require(msg.sender == address(projectRegistry));
    _;
  }

  modifier onlyTR() {
    require(msg.sender == address(tokenRegistry));
    _;
  }

  modifier onlyRR() {
    require(msg.sender == address(reputationRegistry));
    _;
  }

  // =====================================================================
  // UTILITY FUNCTIONS
  // =====================================================================

  function isStaker(address _staker) public view returns(bool) {
    return stakedTokenBalances[_staker] > 0 || stakedReputationBalances[_staker] > 0;
  }

  function calculateWeightOfAddress(address _address) public view returns (uint256) {
    return (stakedReputationBalances[_address] + stakedTokenBalances[_address]);
  }

  function timesUp() public view returns (bool) {
    return (now > nextDeadline);
  }

  function clearStake() public onlyPR() {
    totalReputationStaked = 0;
    totalTokensStaked = 0;
  }

  function isStaked() public view returns (bool) {
    return weiCost >= weiBal && reputationCost >= totalReputationStaked;
  }

  // =====================================================================
  // GETTER/SETTER FUNCTIONS
  // =====================================================================

  function setState(uint256 _state, uint256 _nextDeadline) public onlyPR() {
    state = _state;
    nextDeadline = _nextDeadline;
  }

  function setValidateReward(bool _validateReward) public onlyPR() {
    _validateReward == true ? validateReward = totalValidateAffirmative :
                              validateReward = totalValidateNegative;
  }

  function setValidateFlag(bool _flag) public onlyPR() {
    validateFlag = _flag;
  }

  function setTotalValidateAffirmative(uint256 _totalValidateAffirmative) public onlyPR() {
    totalValidateAffirmative = _totalValidateAffirmative;
  }

  function setTotalValidateNegative(uint256 _totalValidateNegative) public onlyPR() {
    totalValidateAffirmative = _totalValidateNegative;
  }

  // =====================================================================
  // CONSTRUCTOR
  // =====================================================================
  function Project(uint256 _cost, uint256 _costProportion, address _rr, address _tr, address _dt) public {       //called by THR
    tokenRegistry = TokenRegistry(_tr);     //the token holder registry calls this function
    reputationRegistry = ReputationRegistry(_rr);
    projectRegistry = ProjectRegistry(msg.sender);
    distributeToken = DistributeToken(_dt);
    weiCost = _cost;
    reputationCost = _costProportion * reputationRegistry.totalFreeSupply();
  }


  // =====================================================================
  // STAKE FUNCTIONS
  // =====================================================================
  function stakeTokens(address _staker, uint256 _tokens, uint256 _weiVal) public onlyTR() onlyInState(1) returns (uint256) {
    stakedTokenBalances[_staker] += _tokens;
    totalTokensStaked += _tokens;
    weiBal += _weiVal;
  }

  function unstakeTokens(address _staker, uint256 _tokens) public onlyTR() onlyInState(1) returns (uint256) {
    require(stakedTokenBalances[_staker] - _tokens < stakedTokenBalances[_staker] &&   //check overflow
         stakedTokenBalances[_staker] > _tokens);   //make sure _staker has the tokens staked to unstake
    stakedTokenBalances[_staker] -= _tokens;
    totalTokensStaked -= _tokens;
    distributeToken.transfer((_tokens / totalTokensStaked) * weiCost);
  }

  function stakeReputation(address _staker, uint256 _tokens) public onlyRR() onlyInState(1) {
    require(stakedReputationBalances[_staker] + _tokens > stakedReputationBalances[_staker]);
    stakedReputationBalances[_staker] += _tokens;
  }

  function unstakeReputation(address _staker, uint256 _tokens) public onlyRR() onlyInState(1) {
    require(stakedReputationBalances[_staker] - _tokens < stakedReputationBalances[_staker] &&  //check overflow /
      stakedReputationBalances[_staker] > _tokens); //make sure _staker has the tokens staked to unstake
    stakedReputationBalances[_staker] -= _tokens;
  }

  function refundStaker(address _staker) public returns (uint256 _refund) {  //called by THR or WR, allow return of staked, validated, and
    require(msg.sender == address(tokenRegistry) ||  msg.sender == address(reputationRegistry));
    require(state == 7|| state == 9);
    uint256 refund;     //tokens
    if (msg.sender == address(tokenRegistry)) {
      if(totalTokensStaked != 0) {
        refund = stakedTokenBalances[_staker];
        stakedTokenBalances[_staker] = 0;
      }
      if(totalValidateNegative != 0 || totalValidateAffirmative != 0) {
        refund += validators[_staker].stake;
        uint256 denom;
        if (state == 9) {
          denom = totalValidateNegative;
        } else {
          denom = totalValidateAffirmative;
        }
        if (validateFlag == false) {
          refund += validateReward * validators[_staker].stake / denom;
        } else {
          tokenRegistry.rewardValidator(_staker, (weiCost * validators[_staker].stake / denom));
        }
        validators[_staker].stake = 0;
      }
    } else if (msg.sender == address(reputationRegistry)) {
      if(totalReputationStaked != 0) {
        refund = stakedReputationBalances[_staker];
        stakedReputationBalances[_staker] = 0;
      }
    }
    return refund;
  }

  // =====================================================================
  // VALIDATOR FUNCTIONS
  // =====================================================================
  function validate(address _staker, uint256 _tokens, bool _validationState) public onlyTR() onlyInState(5) {
    //checks for free tokens done in THR
    //increments validation tokens in Project.sol only
    // require(ProjectRegistry.checkVoting());
    if (_tokens > 0) {
      if (_validationState == true) {
        validators[_staker] = Validator(1, _tokens);
        totalValidateAffirmative += _tokens;
      }
      else if (_validationState == false){
        validators[_staker] = Validator(0, _tokens);
        totalValidateNegative += _tokens;
      }
    }
  }

  function rewardValidator(bool isPassed) public onlyPR() {
    if(!isPassed) {               //project fails
      tokenRegistry.burnTokens(totalTokensStaked);
      reputationRegistry.burnReputation(totalReputationStaked);
      totalTokensStaked = 0;
      totalReputationStaked = 0;
      validateReward = totalValidateAffirmative;
      if (validateReward == 0) {
        validateFlag = true;
      }
      totalValidateAffirmative = 0;
    }
    else {                                              //project succeeds
      validateReward = totalValidateNegative;
      if (validateReward == 0) {
        validateFlag = true;
      }
      totalValidateNegative = 0;
    }
  }

  // =====================================================================
  // TASK FUNCTIONS
  // =====================================================================

  function claimTask(bytes32 _taskHash, uint256 _weiVal, uint256 _repVal, address _claimer) public onlyInState(4) {
    require(taskRewards[_taskHash].claimer == 0);
    Reward storage taskReward = taskRewards[_taskHash];
    taskReward.claimer = _claimer;
    taskReward.weiReward = _weiVal;
    taskReward.reputationReward = _repVal;
  }


  function claimTaskReward(bytes32 _taskHash, address _claimer) public onlyInState(7) returns (uint256) {
    require(taskRewards[_taskHash].claimer == _claimer);
    Reward storage taskReward = taskRewards[_taskHash];
    uint256 weiTemp = taskReward.weiReward;
    uint256 repTemp = taskReward.reputationReward;
    taskReward.claimer = 0;
    taskReward.weiReward = 0;
    taskReward.reputationReward = 0;
    tokenRegistry.transferWeiReward(_claimer, weiTemp);
    return repTemp;
  }

  function() public payable {

  }
}
