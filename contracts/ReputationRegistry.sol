pragma solidity ^0.4.21;

import "./Project.sol";
import "./ProjectLibrary.sol";
import "./ProjectRegistry.sol";
import "./DistributeToken.sol";
import "./Task.sol";
import "./library/PLCRVoting.sol";
import "./library/Division.sol";
import "./library/SafeMath.sol";
import "./library/Ownable.sol";
/**
@title Reputation Registry for Distribute Network
@author Team: Jessica Marshall, Ashoka Finley
@notice This contract manages the reputation balances of each user and serves as the interface through
which users stake reputation, come to consensus around tasks, claim tasks, vote, refund their stakes,
and claim their task rewards. This contract also registers users and instantiates their accounts with 10.000 reputation
@dev This contract must be initialized with the address of a valid DistributeToken, ProjectRegistry,
and PLCR Voting contract
*/
// ===================================================================== //
//
// ===================================================================== //
contract ReputationRegistry is Ownable {

    using ProjectLibrary for address;
    using SafeMath for uint256;

    // =====================================================================
    // EVENTS
    // =====================================================================

    event LogRegister(
        address indexed registree
    );

    event LogStakedReputation(address indexed projectAddress, uint256 reputation, address staker);
    event LogUnstakedReputation(address indexed projectAddress, uint256 reputation, address unstaker);

    // =====================================================================
    // STATE VARIABLES
    // =====================================================================

    DistributeToken distributeToken;
    ProjectRegistry projectRegistry;
    PLCRVoting plcrVoting;

    /* struct User {
      uint balance;
      bool registered;
      uint lastAccess;
    } */

    // make this a struct and save the mapping
    mapping (address => uint) public balances;
    mapping (address => bool) public first;   //indicates if address has registerd
    mapping (address => uint) public lastAccess;
    /* mapping (address => User) public users; */
    uint256 public totalSupply;               //total supply of reputation in all states
    uint256 public totalUsers;

    uint256 proposeProportion = 20 * 10000000000; // tokensupply/proposeProportion is the number of tokens the proposer must stake
    uint256 rewardProportion = 100;
    uint256 public initialRepVal = 10000;

    bool freeze;

    // =====================================================================
    // MODIFIERS
    // =====================================================================

    modifier onlyPR() {
        require(msg.sender == address(projectRegistry));
        _;
    }

    // =====================================================================
    // CONSTRUCTOR
    // =====================================================================

    /**
    @dev Quasi contstructor is called after contract is deployed, must be called with distributeToken,
    projectRegistry, and plcrVoting intialized to 0
    @param _distributeToken Address of DistributeToken contract
    @param _projectRegistry Address of ProjectRegistry contract
    @param _plcrVoting Address of PLCRVoting contract
    */
    function init(address _distributeToken, address _projectRegistry, address _plcrVoting) public {
        require(
            address(distributeToken) == 0 &&
            address(projectRegistry) == 0 &&
            address(plcrVoting) == 0
        );
        projectRegistry = ProjectRegistry(_projectRegistry);
        plcrVoting = PLCRVoting(_plcrVoting);
        distributeToken = DistributeToken(_distributeToken);
    }

    // =====================================================================
    // UTILITY
    // =====================================================================

    /**
    @notice Return the average reputation balance of the network users
    @return Average balance of each user
    */
    function averageBalance() external view returns(uint256) {
        return totalSupply / totalUsers;
    }

    // =====================================================================
    // OWNABLE
    // =====================================================================

    /**
     * @dev Freezes the contract and allows existing token holders to withdraw tokens
     */
    function freezeContract() external onlyOwner {
      freeze = true;
    }

    /**
     * @dev Unfreezes the contract and allows existing token holders to withdraw tokens
     */
    function unfreezeContract() external onlyOwner {
      freeze = false;
    }

    /**
     * @dev Instantiate a new instance of plcrVoting contract
     * @param _newPlcrRegistry Address of the new plcr contract
     */
    function updatePLCRVoting(address _newPlcrVoting) external onlyOwner {
      plcrVoting = PLCRVoting(_newPlcrVoting);
    }

    /**
     * @dev Update the address of the distributeToken
     * @param _newDistributeToken Address of the new distribute token
     */
    function updateDistributeToken(address _newDistributeToken) external onlyOwner {
      distributeToken = DistributeToken(_newDistributeToken);
    }

    /**
     * @dev Update the address of the base product proxy contract
     * @param _newProjectRegistry Address of the new project contract
     */
    function updateProjectRegistry(address _newProjectRegistry) external onlyOwner {
      projectRegistry = ProjectRegistry(_newProjectRegistry);
    }


    // =====================================================================
    // START UP
    // =====================================================================

    /**
    @notice Register an account `msg.sender` for the first time in the reputation registry, grant 10,000
    reputation to start.
    @dev Has no sybil protection, thus a user can auto generate accounts to receive excess reputation.
    */
    function register() external {
        require(!freeze);
        require(balances[msg.sender] == 0 && first[msg.sender] == false);
        first[msg.sender] = true;
        balances[msg.sender] = initialRepVal;
        totalSupply += initialRepVal;
        totalUsers += 1;
        emit LogRegister(msg.sender);
    }

    // =====================================================================
    // PROPOSE
    // =====================================================================

    /**
    @notice Propose a project of cost `_cost` with staking period `_stakingPeriod` and hash `_ipfsHash`,
    with reputation.
    @dev Calls ProjectRegistry.createProject finalize transaction
    @param _cost Total project cost in wei
    @param _stakingPeriod Length of time the project can be staked before it expires
    @param _ipfsHash Hash of the project description
    */
    function proposeProject(uint256 _cost, uint256 _stakingPeriod, bytes _ipfsHash) external {
        require(!freeze);
        require(now < _stakingPeriod && _cost > 0);
        uint256 costProportion = Division.percent(_cost, distributeToken.weiBal(), 10);
        uint256 proposerReputationCost = ( //divide by 20 to get 5 percent of reputation
        Division.percent(costProportion, proposeProportion, 10) *
        totalSupply) /
        10000000000;
        require(balances[msg.sender] >= proposerReputationCost);

        balances[msg.sender] -= proposerReputationCost;
        projectRegistry.createProject(
            _cost,
            costProportion,
            _stakingPeriod,
            msg.sender,
            2,
            proposerReputationCost,
            _ipfsHash
        );
    }

    /**
    @notice Refund a reputation proposer upon proposal success, transfer 1% of the project cost in
    wei as a reward along with any reputation staked.
    @param _projectAddress Address of the project
    */
    function refundProposer(address _projectAddress) external {
        require(!freeze);
        Project project = Project(_projectAddress);                                         //called by proposer to get refund once project is active
        require(project.proposer() == msg.sender);
        require(project.proposerType() == 2);
        uint256[2] memory proposerVals = projectRegistry.refundProposer(_projectAddress);   //call project to "send back" staked tokens to put in proposer's balances
        balances[msg.sender] += proposerVals[1];
        distributeToken.transferWeiTo(msg.sender, proposerVals[0] / 100);
    }

    // =====================================================================
    // STAKE
    // =====================================================================

    /**
    @notice Stake `_reputation` reputation on project at `_projectAddress`
    @dev Prevents over staking and returns any excess reputation staked.
    @param _projectAddress Address of the project
    @param _reputation Amount of reputation to stake
    */
    function stakeReputation(address _projectAddress, uint256 _reputation) external {
        require(!freeze);
        require(projectRegistry.projects(_projectAddress) == true);
        require(balances[msg.sender] >= _reputation && _reputation > 0);                    //make sure project exists & RH has tokens to stake
        Project project = Project(_projectAddress);
        // handles edge case where someone attempts to stake past the staking deadline
        projectRegistry.checkStaked(_projectAddress);
        require(project.state() == 1);

        uint256 repRemaining = project.reputationCost() - project.reputationStaked();
        uint256 reputationVal = _reputation < repRemaining ? _reputation : repRemaining;
        balances[msg.sender] -= reputationVal;
        Project(_projectAddress).stakeReputation(msg.sender, reputationVal);
        projectRegistry.checkStaked(_projectAddress);
        emit LogStakedReputation(_projectAddress, _reputation, msg.sender);
    }

    /**
    @notice Unstake `_reputation` reputation from project at `_projectAddress`
    @dev Require reputation to be unstaked to be greater than 0
    @param _projectAddress Address of the project
    @param _reputation Amount of reputation to unstake
    */
    function unstakeReputation(address _projectAddress, uint256 _reputation) external {
        require(!freeze);
        require(projectRegistry.projects(_projectAddress) == true);
        require(_reputation > 0);
        // handles edge case where someone attempts to stake past the staking deadline
        projectRegistry.checkStaked(_projectAddress);

        balances[msg.sender] += _reputation;
        Project(_projectAddress).unstakeReputation(msg.sender, _reputation);
        emit LogUnstakedReputation(_projectAddress, _reputation, msg.sender);
    }

    // =====================================================================
    // TASK
    // =====================================================================

    /**
    @notice Claim a task at index `_index` from project at `_projectAddress` with description
    `_taskDescription` and weighting `_weighting`
    @dev Requires the reputation of msg.sender to be greater than the reputationVal of the task
    @param _projectAddress Address of the project
    @param _index Index of the task
    @param _taskDescription Description of the task
    @param _weighting Weighting of the task
    */
    function claimTask(
        address _projectAddress,
        uint256 _index,
        bytes32 _taskDescription,
        uint _weighting
    ) external {
        require(!freeze);
        require(projectRegistry.projects(_projectAddress) == true);
        Project project = Project(_projectAddress);
        require(project.hashListSubmitted() == true);
        uint reputationVal = project.reputationCost() * _weighting / 100;   // does this need SafeMath?
        require(balances[msg.sender] >= reputationVal);
        uint weiVal = project.proposedCost() * _weighting / 100;
        balances[msg.sender] -= reputationVal;
        projectRegistry.claimTask(
            _projectAddress,
            _index,
            _taskDescription,
            msg.sender,
            _weighting,
            weiVal,
            reputationVal
        );
    }

    /**
    @notice Reward the claimer of a task that has been successfully validated.
    @param _projectAddress Address of the project
    @param _index Index of the task
    */
    //called by reputation holder who completed a task
    function rewardTask(address _projectAddress, uint8 _index) external {
        require(!freeze);
        require(projectRegistry.projects(_projectAddress) == true);
        uint256 reward = _projectAddress.claimTaskReward(_index, msg.sender);
        balances[msg.sender] += reward;
    }

    // =====================================================================
    // VOTING
    // =====================================================================

    /**
    @notice First part of voting process. Commits a vote using reputation to task at index `_index`
    of project at `projectAddress` for reputation `_reputation`. Submits a secrect hash `_secretHash`,
    which is a tightly packed hash of the voters choice and their salt
    @param _projectAddress Address of the project
    @param _index Index of the task
    @param _reputation Reputation to vote with
    @param _secretHash Secret Hash of voter choice and salt
    @param _prevPollID The nonce of the previous poll. This is stored off chain
    */
    function voteCommit(
        address _projectAddress,
        uint256 _index,
        uint256 _reputation,
        bytes32 _secretHash,
        uint256 _prevPollID
    ) external {     //_secretHash Commit keccak256 hash of voter's choice and salt (tightly packed in this order), done off-chain
        require(!freeze);
        require(projectRegistry.projects(_projectAddress) == true);
        uint256 pollId = Task(Project(_projectAddress).tasks(_index)).pollId();
        //calculate available tokens for voting
        uint256 availableTokens = plcrVoting.getAvailableTokens(msg.sender, 2);
        //make sure msg.sender has tokens available in PLCR contract
        //if not, request voting rights for token holder
        if (availableTokens < _reputation) {
            require(balances[msg.sender] >= _reputation - availableTokens);
            balances[msg.sender] -= (_reputation - availableTokens);
            plcrVoting.requestVotingRights(msg.sender, _reputation - availableTokens);
        }
        plcrVoting.commitVote(msg.sender, pollId, _secretHash, _reputation, _prevPollID);
    }

    /**
    @notice Second part of voting process. Reveal existing vote.
    @param _projectAddress Address of the project
    @param _index Index of the task
    @param _voteOption Vote choice of account
    @param _salt Salt of account
    */
    function voteReveal(
        address _projectAddress,
        uint256 _index,
        uint256 _voteOption,
        uint256 _salt
    ) external {
        require(!freeze);
        require(projectRegistry.projects(_projectAddress) == true);
        Project project = Project(_projectAddress);
        uint256 pollId = Task(project.tasks(_index)).pollId();
        plcrVoting.revealVote(msg.sender, pollId, _voteOption, _salt);
    }

    /**
    @notice Withdraw voting rights from PLCR Contract
    @param _reputation Amount of reputation to withdraw
    */
    function refundVotingReputation(uint256 _reputation) external {
        require(!freeze);
        balances[msg.sender] += _reputation;
        plcrVoting.withdrawVotingRights(msg.sender, _reputation);
    }

    // =====================================================================
    // COMPLETE
    // =====================================================================

    /**
    @notice Refund a reputation staker from project at `_projectAddress`
    @param _projectAddress Address of the project
    */
    function refundStaker(address _projectAddress) external {     //called by worker who staked or voted
        require(!freeze);
        require(projectRegistry.projects(_projectAddress) == true);
        uint256 _refund = _projectAddress.refundStaker(msg.sender);
        require(_refund > 0);
        balances[msg.sender] += _refund * 3 / 2;
        Project(_projectAddress).clearReputationStake(msg.sender);
    }

    /**
    @notice Rescue unrevealed reputation votes from expired polls of task at `_index` of project at
    `_projectAddress`
    @param _projectAddress Address of the project
    @param _index Index of the task
    */
    function rescueTokens(address _projectAddress, uint _index) external {
        require(!freeze);
        require(projectRegistry.projects(_projectAddress) == true);
        uint256 pollId = Task(Project(_projectAddress).tasks(_index)).pollId();
        plcrVoting.rescueTokens(msg.sender, pollId);
    }


    // =====================================================================
    // FAILED
    // =====================================================================

    /**
    @notice Burn reputation in event of project failure
    @dev Only callable by the ProjectRegistry contract
    @param _reputation Amount of reputation to burn
    */
    function burnReputation(uint256 _reputation) external onlyPR {
        require(!freeze);
        totalSupply -= _reputation;
    }

}
