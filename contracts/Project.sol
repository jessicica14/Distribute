pragma solidity ^0.5.0;

import "./ProjectRegistry.sol";
import "./ReputationRegistry.sol";
import "./Task.sol";
import "./library/SafeMath.sol";
import "./library/Division.sol";

/**
@title An individual project in the distribute DAO system
@author Team: Jessica Marshall, Ashoka Finley
@notice This contract is used to manage the state of all project related parameters while also
maintaining a wei balance to be used in the case of reward. The project can be in 8 states, represented by
integers. They are as follows: [1: Proposed, 2: Staked, 3: Active, 4: Validation, 5: Voting, 6: Complete,
7: Failed, 8: Expired]
@dev This contract is managed and deployed by a Project Registry contract, and must be initialized
with a ReputationRegistry and TokenRegistry for full control.
*/
contract Project {

    using SafeMath for uint256;

    // =====================================================================
    // EVENTS
    // =====================================================================

    event LogProjectDetails(
      uint weiCost,
      uint reputationCost,
      uint state,
      uint nextDeadline,
      address proposer,
      uint proposerType,
      bytes ipfsHash,
      uint stakedStatePeriod,
      uint activeStatePeriod,
      uint turnoverTime,
      uint validateStatePeriod,
      uint voteCommitPeriod,
      uint voteRevealPeriod,
      uint passThreshold
    );

    /* event Transfer(address worker, uint reward); */

    // =====================================================================
    // STATE VARIABLES
    // =====================================================================

    address public tokenRegistryAddress;
    address public reputationRegistryAddress;
    address public projectRegistryAddress;

    uint256 public state;

    /*
    POSSIBLE PROJECT STATES
        1: Proposed,
        2: Staked,
        3: Active,
        4: Validation,
        5: Voting,
        6: Complete,
        7: Failed,
        8: Expired
    */

    uint256 public stakedStatePeriod;
    uint256 public activeStatePeriod;
    uint256 public turnoverTime;
    uint256 public validateStatePeriod;
    uint256 public voteCommitPeriod;
    uint256 public voteRevealPeriod;
    uint256 public passThreshold;

    address public proposer;
    uint256 public proposerType;
    uint256 public proposerStake;
    uint256 public weiBal;
    uint256 public nextDeadline;
    uint256 public proposedCost;
    uint256 public validationReward;
    uint256 public originatorReward;
    uint256 public weiCost;
    uint256 public reputationCost;

    bytes public ipfsHash;

    uint256 public tokensStaked;
    uint256 public reputationStaked;
    mapping (address => uint) public tokenBalances;
    mapping (address => uint) public reputationBalances;

    bool public hashListSubmitted;
    uint256 public passAmount;

    // MAKE THIS A DLL EVENTUALLY?
    address[] public tasks;

    // =====================================================================
    // MODIFIERS
    // =====================================================================

    modifier onlyPR() {
        require(msg.sender == projectRegistryAddress);
        _;
    }

    modifier onlyTR() {
        require(msg.sender == tokenRegistryAddress);
        _;
    }

    modifier onlyRR() {
        require(msg.sender == reputationRegistryAddress);
        _;
    }

    modifier onlyTRorRR() {
        require(msg.sender == tokenRegistryAddress || msg.sender == reputationRegistryAddress);
        _;
    }

    function isTR(address _sender) external view returns (bool) {
        return _sender == tokenRegistryAddress
            ? true
            : false;
    }

    function isRR(address _sender) external view returns (bool) {
        return _sender == reputationRegistryAddress
            ? true
            : false;
    }

    // =====================================================================
    // CONSTRUCTOR
    // =====================================================================

    constructor () public {}
    /**
    @dev Used for proxy deployment of this contract. Initialize a Project with a Reputation Registry
    and a Token Registry, and all related project values.
    @param _cost The total cost of the project in wei
    @param _costProportion The proportion of the project cost divided by theHyphaToken weiBal
    represented as integer
    @param _stakingPeriod The length of time the project is open for staking
    @param _proposer The address of the user proposing the project
    @param _proposerType Denotes if a proposer is proposing a project with reputation or tokens,
    value must be 1: tokens or 2: reputation
    @param _proposerStake The amount of reputation or tokens needed to create the proposal (5% of project cost)
    @param _ipfsHash The ipfs hash of the full project description
    @param _reputationRegistry Address of the Reputation Registry
    @param _tokenRegistry Address of the Token Registry
    */
    function setup(
        uint256 _cost,
        uint256 _costProportion,
        uint256 _stakingPeriod,
        address _proposer,
        uint256 _proposerType,
        uint256 _proposerStake,
        bytes memory _ipfsHash,
        address _reputationRegistry,
        address _tokenRegistry
    ) public {
        require(bytes(_ipfsHash).length == 46);
        require(reputationRegistryAddress == address(0));
        reputationRegistryAddress = _reputationRegistry;
        tokenRegistryAddress = _tokenRegistry;
        projectRegistryAddress = msg.sender;
        validationReward = _cost * 5 / 100;
        originatorReward = _cost * 5 / 100;
        proposedCost = _cost;
        weiCost = proposedCost + validationReward + originatorReward;
        reputationCost = _costProportion * ReputationRegistry(_reputationRegistry).totalSupply() / 10000000000;
        state = 1;
        nextDeadline = _stakingPeriod;
        proposer = _proposer;
        proposerType = _proposerType;
        proposerStake = _proposerStake;
        ipfsHash = _ipfsHash;
        // Proxies don't initialize variables
        stakedStatePeriod = 1 weeks;
        activeStatePeriod = 2 weeks;
        turnoverTime = 1 weeks;
        validateStatePeriod = 1 weeks;
        voteCommitPeriod = 1 weeks;
        voteRevealPeriod = 1 weeks;
        passThreshold = 100;
        emit LogProjectDetails(
          weiCost,
          reputationCost,
          state,
          nextDeadline,
          proposer,
          proposerType,
          ipfsHash,
          stakedStatePeriod,
          activeStatePeriod,
          turnoverTime,
          validateStatePeriod,
          voteCommitPeriod,
          voteRevealPeriod,
          passThreshold
        );
    }

    // =====================================================================
    // FALLBACK
    // =====================================================================

    function() external payable {}

    // =====================================================================
    // GETTERS
    // =====================================================================
    /**
    @notice The amount of tasks created in the project during the Staked period.
    @dev Helper function used by the project library to get the length of the task array
    @return The number of tasks in the task array
    */
    function getTaskCount() external view returns (uint256) {
        return tasks.length;
    }

    /* function getTaskAddress(uint256 _index) external view returns (address) {
        return tasks[_index];
    } */

    // =====================================================================
    // SETTERS
    // =====================================================================

    /**
    @notice Set the project state to `_state`, and update the nextDeadline to `_nextDeadline`
    @dev Only callable by the Project Registry that was initialized during construction
    @param _state The state to update the project to
    @param _nextDeadline The nextDeadline to transition project to the next state
    */
    function setState(uint256 _state, uint256 _nextDeadline) external onlyPR {
        state = _state;
        nextDeadline = _nextDeadline;
    }

    /**
    @notice Clears the proposer stake on proposal expiration
    @dev Only callable by the Project Registry initialized during construction
    */
    function clearProposerStake() external onlyPR {
        proposerStake = 0;
    }

    /**
    @notice Clear the token stake of `_staker`, used during stake claiming
    @dev Only callable by the Token Registry initialized during construction
    @param _staker Address of the staker
    */
    function clearTokenStake(address _staker) external onlyTR {
        tokensStaked = tokensStaked.sub(tokenBalances[_staker]);
        tokenBalances[_staker] = 0;
    }

    /**
    @notice Clear the reputation stake of `_staker`, used during stake claiming
    @dev Only callable by the Reputation Registry initialized during construction
    @param _staker Address of the staker
    */
    function clearReputationStake(address _staker) external onlyRR {
        reputationStaked = reputationStaked.sub(reputationBalances[_staker]);
        reputationBalances[_staker] = 0;
    }

    /**
    @notice Clear the stake of all stakers in the event of Project failure
    @dev Only callable by the Project Registry initialized during construction, in the case of project failure
    */
    function clearStake() external onlyPR {
        tokensStaked = 0;
        reputationStaked = 0;
    }

    /**
    @notice Set the number of project tasks to `_tasksLength` as defined by the project stakers
    @dev Only callable by the Project Registry initialized during construction
    @param _tasksLength The amount of tasks as defined by the project stakers
    */
    function setTaskLength(uint _tasksLength) external onlyPR {
        tasks.length = _tasksLength;
    }

    /**
    @notice Set the address of a task at index `_index`
    @dev Only callable by the Project Registry initialized during construction
    @param _taskAddress Address of the task contract
    @param _index Index of the task in the tasks array
    */
    function setTaskAddress(address _taskAddress, uint _index) external onlyPR {
        require(state == 3);
        tasks[_index] = _taskAddress;
    }

    function setHashListSubmitted() external onlyPR {
      hashListSubmitted = true;
    }

    /**
    @notice Set the weighting of the amount of tasks that passed to `_passAmount`
    @dev Only callable by the Project Registry initialized during construction
    @param _passAmount The total weighting of all tasks which passed
    */
    function setPassAmount(uint256 _passAmount) external onlyPR {
        passAmount = _passAmount;
    }

    // =====================================================================
    // STAKE
    // =====================================================================

    /**
    @notice Stake `_tokens` tokens from `_staker` and add `_weiValue` to the project ether balance
    @dev Only callable by the Token Registry initialized during construction, to maintain control flow
    @param _staker Address of the staker who is staking
    @param _tokens Amount of tokens to stake on the project
    @param _weiValue Amount of wei transferred to the project
    */
    function stakeTokens(address _staker, uint256 _tokens, uint256 _weiValue) external onlyTR {
        require(state == 1);
        tokenBalances[_staker] = tokenBalances[_staker].add(_tokens);
        tokensStaked = tokensStaked.add(_tokens);
        weiBal = weiBal.add(_weiValue);
    }

    /**
    @notice Unstake `_tokens` tokens from the project, subtract this value from the balance of `_staker`
    Returns the amount of ether to subtract from the project's ether balance
    @dev Only callable by the Token Registry initialized during construction, to maintain control flow
    @dev Only callable before the staking period of a proposed project ends (state must still be 1)
    @param _staker Address of the staker who is unstaking
    @param _tokens Amount of tokens to unstake on the project
    @param _hyphaToken Address of distribute token contract
    @return The amount of ether to deduct from the projects balance

    */
    function unstakeTokens(address _staker, uint256 _tokens, address payable _hyphaToken) external onlyTR returns (uint256) {
        require(state == 1);
        uint256 weiVal = (Division.percent(_tokens, tokensStaked, 10).mul(weiBal)).div(10000000000);
        tokenBalances[_staker] = tokenBalances[_staker].sub(_tokens);
        tokensStaked = tokensStaked.sub(_tokens);
        weiBal = weiBal.sub(weiVal);
        _hyphaToken.transfer(weiVal);
        return weiVal;
    }

    /**
    @notice Stake `_reputation` reputation from `_staker`
    @dev Only callable by the Reputation Registry initialized during construction, to maintain control flow
    @param _staker Address of the staker who is staking
    @param _reputation Amount of reputation to stake on the project
    */
    function stakeReputation(address _staker, uint256 _reputation) external onlyRR {
        require(state == 1);
        reputationBalances[_staker] = reputationBalances[_staker].add(_reputation);
        reputationStaked = reputationStaked.add(_reputation);
    }

    /**
    @notice Unstake `_reputation` reputation from the project, and update staked balance of `_staker`
    @dev Only callable by the Reputation Registry initialized during construction, to maintain control flow
    @dev Only callable before the staking period of a proposed project ends (state must still be 1)
    @param _staker Address of the staker who is unstaking
    @param _reputation Amount of reputation to unstake on the project
    */
    function unstakeReputation(address _staker, uint256 _reputation) external onlyRR {
        require(state == 1);
        reputationBalances[_staker] = reputationBalances[_staker].sub(_reputation);
        reputationStaked = reputationStaked.sub(_reputation);
    }

    // =====================================================================
    // REWARD
    // =====================================================================

    /**
    @notice Transfer `_reward` wei as reward for completing a task to `_rewardee
    @dev Only callable by the Reputation Registry or Token Registry initialized during construction, to maintain control flow
    @param _rewardee The account who claimed and completed the task.
    @param _reward The amount of wei to transfer.
    */
    function transferWeiReward(address payable _rewardee, uint _reward) external onlyTRorRR {
        weiBal = weiBal.sub(_reward);
        _rewardee.transfer(_reward);
    }

    /**
    @notice Transfer `_value` wei back to distribute token balance on task failure
    @dev Only callable by the Project Registry initialized during construction, to maintain control flow
    @param _hyphaToken The address of the systems token contract.
    @param _value The amount of ether to send
    */
    function returnWei(address payable _hyphaToken, uint _value) external onlyPR {
        weiBal = weiBal.sub(_value);
        _hyphaToken.transfer(_value);
    }

}
