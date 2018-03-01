pragma solidity ^0.4.8;

import "./Project.sol";
import "./TokenRegistry.sol";
import "./ReputationRegistry.sol";
import "./ProjectRegistry.sol";
import "./Task.sol";

library ProjectLibrary {

  struct Reward {
    uint256 weiReward;
    uint256 reputationReward;
    address claimer;
  }

  event tokenRefund(address staker, uint256 refund);
  event reputationRefund(address projectAddress, address staker, uint256 refund);
  // =====================================================================
  // UTILITY FUNCTIONS
  // =====================================================================
  modifier onlyInState(address _projectAddress, uint256 _state) {
    Project project = Project(_projectAddress);
    require(project.state() == _state);
    _;
  }

  function isStaker(address _projectAddress, address _staker) public view returns(bool) {
    Project project = Project(_projectAddress);
    return project.stakedTokenBalances(_staker) > 0 || project.stakedReputationBalances(_staker) > 0;
  }

  function percent(uint256 numerator, uint256 denominator, uint256 precision) internal pure returns (uint256) {
     // caution, check safe-to-multiply here
    uint256 _numerator  = numerator * 10 ** (precision+1);
    // with rounding of last digit
    return ((_numerator / denominator) + 5) / 10;
  }

  function calculateWeightOfAddress(address _projectAddress, address _address) public view returns (uint256) {
    uint256 reputationWeight;
    uint256 tokenWeight;
    Project project = Project(_projectAddress);
    project.totalReputationStaked() != 0
      ? reputationWeight = percent(project.stakedReputationBalances(_address), project.totalReputationStaked(), 2)
      : reputationWeight = 0;
    project.totalTokensStaked() != 0
      ? tokenWeight = percent(project.stakedTokenBalances(_address), project.totalTokensStaked(), 2)
      : tokenWeight = 0;
    return (reputationWeight + tokenWeight) / 2;
    /* return percent((stakedReputationBalances[_address] + stakedTokenBalances[_address]), (totalTokensStaked + totalReputationStaked), 2); */
  }

  function timesUp(address _projectAddress) public view returns (bool) {
    return (now > Project(_projectAddress).nextDeadline());
  }

  function isStaked(address _projectAddress) public view returns (bool) {
    Project project = Project(_projectAddress);
    return project.weiCost() <= project.weiBal() && project.reputationCost() <= project.totalReputationStaked();
  }

  function refundStaker(address _projectAddress, address _staker, uint256 _index) public returns (uint256 _refund) {
    Project project = Project(_projectAddress);
    require(project.state() == 6);
    if (project.isTR(msg.sender)) {
      return handleTokenStaker(msg.sender, _projectAddress, _staker, _index);
    } else if (project.isRR(msg.sender)) {
      return handleReputationStaker(_projectAddress, _staker, _index);
    }
  }

  function handleTokenStaker(address _tokenRegistry, address _projectAddress, address _staker) internal returns (uint256 _refund) {
    uint256 refund;     //tokens
    Project project = Project(_projectAddress);
    Task task = Task(project.tasks(_index));
    if(project.totalTokensStaked() != 0) {
      refund = task.stakedTokenBalances(_staker);
      project.clearTokenStake(_staker);
    }
    refund += validatorRewardHandler(_tokenRegistry, _projectAddress, _staker, _index);
    tokenRefund(_staker, refund);
    return refund;
  }

  function validatorRewardHandler(address _tokenRegistry, address _projectAddress, address _staker, uint256 _index) internal returns (uint256 _refund) {
    uint256 refund;
    Project project = Project(_projectAddress);
    Task task = Task(project.tasks(_index));
    if(task.totalValidateNegative() != 0 || task.totalValidateAffirmative() != 0) {
      var (,stake) = project.validators(_staker);
      refund += stake;
      uint256 denom;
      project.state() == 7
        ? denom = task.totalValidateNegative()
        : denom = task.totalValidateAffirmative();
        if (task.opposingValidator() == true) {
          refund += project.validateReward() * stake / denom;
        } else {
          TokenRegistry(_tokenRegistry).rewardValidator(_projectAddress, _staker, (project.weiCost() * stake / denom));
        }
      task.clearValidatorStake(_staker);
    }
    return refund;
  }

  function handleReputationStaker(address _projectAddress, address _staker) internal returns (uint256 _refund) {
    uint256 refund;
    Project project = Project(_projectAddress);
    if(project.totalReputationStaked() != 0) {
      refund = project.stakedReputationBalances(_staker);
      project.clearReputationStake(_staker);
    }
    reputationRefund(_projectAddress, _staker, refund);
    return refund;
  }

  // =====================================================================
  // VALIDATOR FUNCTIONS
  // =====================================================================
  function validate(address _projectAddress, address _staker, uint256 _index, uint256 _tokens, bool _validationState) public onlyInState(_projectAddress, 4) {
    Project project = Project(_projectAddress);
    Task task = Task(Project.tasks(_index));
    require(_tokens > 0);
    if (_validationState == true) {
      task.setValidator(_staker, 1, _tokens);
    }
    else if (_validationState == false){
      task.setValidator(_staker, 0, _tokens);
    }
  }

  function setValidationState(uint256 _index, address _tokenRegistry, address _reputationRegistry, address _projectAddress, bool isPassed) public {
    Project project = Project(_projectAddress);
    Task task = Task(Project.tasks(_index));
    if(isPassed) {                          // project succeeds
      task.setValidationReward(0);
    } else {                                // project fails
      burnStake(_tokenRegistry, _reputationRegistry, _projectAddress);
      task.setValidationReward(1);
    }
    if (project.validateReward() == 0) {
      task.setOpposingValidator();
    }
  }

  function burnStake(address _tokenRegistry, address _reputationRegistry, address _projectAddress) internal {
    Project project = Project(_projectAddress);
    TokenRegistry(_tokenRegistry).burnTokens(project.totalTokensStaked());
    ReputationRegistry(_reputationRegistry).burnReputation(project.totalReputationStaked());
    project.clearStake();
  }

  // =====================================================================
  // TASK FUNCTIONS
  // =====================================================================

  function claimTask(address _projectAddress, uint256 _index, uint256 _weiVal, uint256 _reputationVal, address _claimer) public onlyInState(_projectAddress, 3) {
    Project project = Project(_projectAddress);
    Task task = Task(project.tasks(_index));
    require(task.claimer() == 0 || now > (task.claimTime() + project.turnoverTime()) && !task.complete());
    task.setTaskReward(_weiVal, _reputationVal, _claimer);
  }

  function claimTaskReward(address _tokenRegistry, uint256 _index, address _projectAddress, address _claimer) public onlyInState(_projectAddress, 6) returns (uint256) {
    Project project = Project(_projectAddress);
    Task task = Task(project.tasks(_index));
    require(task.claimer() == _claimer);
    task.setTaskReward(0, 0, _claimer);
    TokenRegistry(_tokenRegistry).transferWeiReward(_claimer, task.weiReward());
    return task.reputationReward();
  }
}
