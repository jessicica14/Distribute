pragma solidity 0.4.19;

import "./library/PLCRVoting.sol";
import "./ReputationRegistry.sol";
import "./Project.sol";
import "./ProjectLibrary.sol";
import "./Task.sol";

/**
@title Project Registry for Distribute Network
@author Team: Jessica Marshall, Ashoka Finley
@notice This project uses the Project Library to manage the state of Distribute Network projects.
@dev This contract must be initialized with the address of a valid Token Registry, Reputation Registry
and Distribute Token
*/
contract ProjectRegistry {

    using ProjectLibrary for address;

    // =====================================================================
    // EVENTS
    // =====================================================================

    event LogProjectCreated(
        address indexed projectAddress,
        address proposerAddress,
        uint256 projectCost,
        uint256 proposerStake
    );

    event ProxyDeployed(address proxyAddress, address targetAddress);

    // =====================================================================
    // STATE VARIABLES
    // =====================================================================

    PLCRVoting plcrVoting;

    address tokenRegistryAddress;
    address reputationRegistryAddress;
    address distributeTokenAddress;
    address projectContractAddress;
    address taskContractAddress;

    uint256 projectNonce = 0;
    mapping (uint => address) public projectsList;
    mapping (address => bool) public projects;

    struct StakedState {
        bytes32 topTaskHash;
        mapping(address => bytes32) taskHashSubmissions;
        mapping(bytes32 => uint256) numSubmissionsByWeight;
    }

    mapping (address => StakedState) public stakedProjects;

    // =====================================================================
    // MODIFIERS
    // =====================================================================

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

    // =====================================================================
    // CONSTRUCTOR
    // =====================================================================

    /**
    @notice
    @dev Quasi constructor is called after thr project is deployed. Requires that all relevant contract
    address are not yet intialized.
    @param _distributeToken Address of the distributeToken contract
    @param _tokenRegistry Address of the token registry contract
    @param _reputationRegistry Address of the reputation registry contract
    @param _plcrVoting Address of the plcr voting contract
    */
    function init(
        address _distributeToken,
        address _tokenRegistry,
        address _reputationRegistry,
        address _plcrVoting,
        address _projectAddress,
        address _taskAddress
    ) public {       //contract is created
        require(
            tokenRegistryAddress == 0 &&
            reputationRegistryAddress == 0 &&
            distributeTokenAddress == 0
        );
        distributeTokenAddress = _distributeToken;
        tokenRegistryAddress = _tokenRegistry;
        reputationRegistryAddress = _reputationRegistry;
        plcrVoting = PLCRVoting(_plcrVoting);
        projectContractAddress = _projectAddress;
        taskContractAddress = _taskAddress;
    }

    // =====================================================================
    // PROXY DEPLOYER
    // =====================================================================

    /**
    @dev Used to create proxy deployments of the project and task contracts
    @param _target Address of the master contract
    @param _data Packed function bytes id + parameters
    */
    function createProxy(address _target, bytes _data) public returns (address proxyContract) {
       assembly {
           let contractCode := mload(0x40) // Find empty storage location using "free memory pointer"

           mstore(add(contractCode, 0x0b), _target) // Add target address, with a 11 bytes [i.e. 23 - (32 - 20)] offset to later accomodate first part of the bytecode
           mstore(sub(contractCode, 0x09), 0x000000000000000000603160008181600b9039f3600080808080368092803773) // First part of the bytecode, shifted left by 9 bytes, overwrites left padding of target address
           mstore(add(contractCode, 0x2b), 0x5af43d828181803e808314603057f35bfd000000000000000000000000000000) // Final part of bytecode, offset by 42 bytes

           proxyContract := create(0, contractCode, 0x3c) // total length 60 bytes
           if iszero(extcodesize(proxyContract)) { revert(0,0) }

           // check if the _data.length > 0 and if it is forward it to the newly created contract
           if iszero(iszero(mload(_data))) {
               if call(gas, proxyContract, 0, add(_data, 0x20), mload(_data), 0, 0) { revert(0, 0) }
           }
       }

       ProxyDeployed(proxyContract, _target);
    }

    // =====================================================================
    // STATE CHANGE
    // =====================================================================

    /**
    @notice Calls the project library checkStaked function
    @dev Used to create the correct msg.sender to manage control
    @param _projectAddress Address of the project
    @return Boolean representing Staked status
    */
    function checkStaked(address _projectAddress) external returns (bool) {
        require(projects[_projectAddress] == true);
        return _projectAddress.checkStaked();
    }

    /**
    @notice Calls the project library checkActive function, passing along the topTaskHash of the
    project at `_projectAddress`
    @dev Used to create the correct msg.sender to manage control
    @param _projectAddress Address of the project
    @return Boolean representing Active status
    */
    function checkActive(address _projectAddress) public returns (bool) {
        require(projects[_projectAddress] == true);
        return _projectAddress.checkActive(stakedProjects[_projectAddress].topTaskHash);
    }

    /**
    @notice Calls the project library checkValidate function
    @dev Used to create the correct msg.sender to manage control
    @param _projectAddress Address of the project
    @return Boolean representing Validate status
    */
    function checkValidate(address _projectAddress) external {
        require(projects[_projectAddress] == true);
        _projectAddress.checkValidate(tokenRegistryAddress, distributeTokenAddress);
    }

    /**
    @notice Calls the project library checkVoting function
    @dev Used to create the correct msg.sender to manage control
    @param _projectAddress Address of the project
    @return Boolean representing Voting status
    */
    function checkVoting(address _projectAddress) external {
        require(projects[_projectAddress] == true);
        _projectAddress.checkVoting(tokenRegistryAddress, distributeTokenAddress, address(plcrVoting));
    }

    /**
    @notice Calls the project library checkEnd function. Burns tokens and reputation if the project fails
    @dev Used to create the correct msg.sender to manage control
    @param _projectAddress Address of the project
    @return Boolean representing Final Status
    */
    function checkEnd(address _projectAddress) external {
        require(projects[_projectAddress] == true);
        _projectAddress.checkEnd(tokenRegistryAddress, distributeTokenAddress, address(plcrVoting));
        Project project = Project(_projectAddress);
        if (project.state() == 7) {
            TokenRegistry(tokenRegistryAddress).burnTokens(project.tokensStaked());
            ReputationRegistry(reputationRegistryAddress).burnReputation(project.reputationStaked());
            project.clearStake();
        }
    }

    // =====================================================================
    // PROPOSER
    // =====================================================================

    /**
    @notice Create a project with a cost of `_cost`, a ratio of `_costProportion`, a staking period
    length of `_stakingPeriod`, by proposer `_proposer` of type `_proposerType` with stake of
    `_proposerStake` defined by ipfsHash `_ipfsHash`
    @dev Only callable by the ReputationRegistry or TokenRegistry, after proposer stake is confirmed.
    @param _cost The total cost of the project in wei
    @param _costProportion The proportion of the project cost divided by the DistributeToken weiBal
    represented as integer
    @param _stakingPeriod The length of time this project is open for staking
    @param _proposer The address of the user proposing the project
    @param _proposerType Denotes if a proposer is using reputation or tokens,
    value must be 1: tokens or 2: reputation
    @param _proposerStake The amount of reputation or tokens needed to create the proposal
    @param _ipfsHash The ipfs hash of the full project description
    @return Address of the created project
    */
    /* 0xe7b7c2a6  project signature */
    function createProject(
        uint256 _cost,
        uint256 _costProportion,
        uint256 _stakingPeriod,
        address _proposer,
        uint256 _proposerType,
        uint256 _proposerStake,
        string _ipfsHash
    ) external onlyTRorRR returns (address) {
        /* createProxy(projectContractAddress, (0xe7b7c2a6 + )) */
        Project newProject = new Project(
            _cost,
            _costProportion,
            _stakingPeriod,
            _proposer,
            _proposerType,
            _proposerStake,
            _ipfsHash,
            reputationRegistryAddress,
            tokenRegistryAddress
        );
        address projectAddress = address(newProject);
        /* address projectAddress = createProxy(projectContractAddress, (0xe7b7c2a6 + )) */
        projects[projectAddress] = true;
        projectsList[projectNonce] = projectAddress;
        projectNonce += 1;
        LogProjectCreated(projectAddress, _proposer, _cost, _proposerStake);
        return projectAddress;
    }

    /**
    @notice Refund a proposer if the project at `_projectAddress` is not in state: 1 Proposed or
    state: 8 Expired.
    @dev Only called by the TokenRegistry or ReputationRegistry
    @param _projectAddress Address of the project
    @return An array with the weiCost of the project and the proposers stake
    */
    function refundProposer(address _projectAddress) external onlyTRorRR returns (uint256[2]) {
        require(projects[_projectAddress] == true);
        Project project =  Project(_projectAddress);
        require(project.state() > 1 && project.state() != 8);
        require(project.proposerStake() > 0);

        uint256[2] memory returnValues;
        returnValues[0] = project.weiCost();
        returnValues[1] = project.proposerStake();
        project.clearProposerStake();
        return returnValues;
    }

    // =====================================================================
    // STAKED
    // =====================================================================

    /**
    @notice Submit a hash of a task list `_taskHash` to project at `_projectAddress` by staker
    `msg.sender`. Makes sure the Project is in the Active State, and calls stakedTaskHash.
    @dev This library is imported into all the Registries to manage project interactions
    @param _projectAddress Address of the project
    @param _taskHash Hash of the task list
    */
    function addTaskHash(address _projectAddress, bytes32 _taskHash) external  {      // format of has should be 'description', 'percentage', check via js that percentages add up to 100 prior to calling contract
        require(projects[_projectAddress] == true);
        Project project = Project(_projectAddress);
        require(_projectAddress.isStaker(msg.sender) == true);

        checkActive(_projectAddress);
        if (project.state() == 2) {
            uint256 stakerWeight = _projectAddress.calculateWeightOfAddress(msg.sender);
            stakedTaskHash(_projectAddress, msg.sender, _taskHash, stakerWeight);
        }
    }

    /**
    @notice Calculates the taskHash that has the highest weight of all tasks hashes submitted by stakers
    and stores this as the top task hash.
    @dev Internal helper function used to calculate the top task hash.
    @param _projectAddress Address of the project
    @param _staker Address of the staker
    @param _taskHash Hash of the task list
    @param _stakerWeight Weight of the staker
    */
    function stakedTaskHash(
        address _projectAddress,
        address _staker,
        bytes32 _taskHash,
        uint256 _stakerWeight
    ) internal {
        StakedState storage ss = stakedProjects[_projectAddress];
        if(ss.taskHashSubmissions[_staker] !=  0) {   //Not first time submission for this particular address
            bytes32 submittedTaskHash = ss.taskHashSubmissions[_staker];
            ss.numSubmissionsByWeight[submittedTaskHash] -= _stakerWeight;
        }
        ss.numSubmissionsByWeight[_taskHash] += _stakerWeight;
        ss.taskHashSubmissions[_staker] = _taskHash;
        if(ss.numSubmissionsByWeight[_taskHash] > ss.numSubmissionsByWeight[ss.topTaskHash]) {
            ss.topTaskHash = _taskHash;
        }
    }

    // =====================================================================
    // ACTIVE
    // =====================================================================

    /**
    @notice Submit the final task list with hashed tasks `_hashes` for project at `_projectAddress`.
    Hashes the submitted task list to validate it is the top task hash list, and creates a task for
    each list item with the respective hash.
    @dev This function is an interation and requires variable gas.
    @param _projectAddress Address of the project
    @param _hashes Array of task hashes
    */
    // Doesn't Change State Here Could Possibly move to ProjectLibrary
    /* 0xae4d1af6 task signature*/
    function submitHashList(address _projectAddress, bytes32[] _hashes) external {
        require(projects[_projectAddress] == true);
        Project project = Project(_projectAddress);
        require(keccak256(_hashes) == stakedProjects[_projectAddress].topTaskHash);

        project.setTaskLength(_hashes.length);
        for (uint256 i = 0; i < _hashes.length; i++) {
            /* createProxy(taskContractAddress, (0xae4d1af6 + ) */
            Task newTask = new Task(_hashes[i], tokenRegistryAddress, reputationRegistryAddress);
            project.setTaskAddress(address(newTask), i);
        }
    }

    /**
    @notice Claim a task at index `_index` from project at `_projectAddress` with description
    `_taskDescription`, weighting `_weighting` by claimer `_claimer. Set the ether reward of the task
    to `_weiVal` and the repuation needed to claim the task to `_reputationVal`
    @dev Only callable by the ReputationRegistry
    @param _projectAddress Address of project
    @param _index Index of the task in task array.
    @param _taskDescription Description of the task.
    @param _claimer Address of account to claim task.
    @param _weighting Weighting of this particular task (proportion of project funds)
    @param _weiVal Ether reward of task
    @param _reputationVal Reputation required to claim task
    */
    // Doesn't Change State Here Could Possibly move to ProjectLibrary
    function claimTask(
        address _projectAddress,
        uint256 _index,
        bytes32 _taskDescription,
        address _claimer,
        uint _weighting,
        uint _weiVal,
        uint _reputationVal
    ) external onlyRR {
        Project project = Project(_projectAddress);
        require(project.state() == 3);
        Task task = Task(project.tasks(_index));
        require(keccak256(_taskDescription, _weighting) == task.taskHash());
        require(
            task.claimer() == 0 ||
            (now > (task.claimTime() + project.turnoverTime()) && !task.complete())
        );
        task.setWeighting(_weighting);
        task.setTaskReward(_weiVal, _reputationVal, _claimer);
    }

    /**
    @notice Mark that task at index `_index` in project at `_projectAddress` as completed by the claimer
    `msg.sender`
    @param _projectAddress Address of project
    @param _index Index of the task in task array
    */
    // Doesn't Change State Here Could Possibly move to ProjectLibrary
    function submitTaskComplete(address _projectAddress, uint256 _index) external {
        Project project = Project(_projectAddress);
        Task task = Task(project.tasks(_index));
        require(task.claimer() == msg.sender);
        require(task.complete() == false);
        require(project.state() == 3);

        task.markTaskComplete();
    }
}
