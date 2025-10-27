// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

/**
 * @title ServiceRegistry
 * @notice Vertical-First Discovery Registry for x402 Protocol
 * @dev ERC-8004 compliant registry with reputation tracking
 * 
 * This contract enables:
 * - Agent registration with vertical categorization
 * - Trust scoring via ERC-8004 reputation metrics
 * - Multi-chain service tracking
 * - Payment verification integration
 */
contract ServiceRegistry {
    
    struct Service {
        address provider;           // Wallet receiving payments
        string endpoint;            // x402 API URL
        string serviceType;         // VERTICAL: "customer-support", "sales", "data", etc.
        string description;         // Human-readable description
        uint256 pricePerCall;      // Cost in wei
        string chain;              // "base", "optimism", "mantle", etc.
        uint256 totalCalls;        // Usage metrics (ERC-8004)
        uint256 totalRevenue;      // Revenue metrics (ERC-8004)
        uint256 reputationScore;   // Trust score 0-100 (ERC-8004)
        bool isActive;             // Can be disabled by provider
        uint256 registeredAt;      // Timestamp
    }
    
    // Mappings
    mapping(bytes32 => Service) public services;        // serviceId => Service
    mapping(address => bytes32[]) public providerServices;  // provider => serviceIds[]
    mapping(string => bytes32[]) public verticalServices;   // vertical => serviceIds[]
    
    bytes32[] public allServiceIds;
    
    // Events
    event ServiceRegistered(
        bytes32 indexed serviceId,
        address indexed provider,
        string endpoint,
        string serviceType,
        uint256 pricePerCall
    );
    
    event ServiceUpdated(
        bytes32 indexed serviceId,
        uint256 newPrice,
        bool isActive
    );
    
    event ServiceCallRecorded(
        bytes32 indexed serviceId,
        address indexed buyer,
        uint256 amount
    );
    
    event ReputationUpdated(
        bytes32 indexed serviceId,
        uint256 newScore
    );
    
    /**
     * @notice Register a new x402 service
     * @param _endpoint Full URL to x402 API (e.g., "https://api.example.com/agent")
     * @param _serviceType Vertical category (e.g., "customer-support", "sales", "data")
     * @param _description Human-readable service description
     * @param _pricePerCall Cost per API call in wei
     * @param _chain Blockchain network (e.g., "base", "optimism")
     */
    function registerService(
        string memory _endpoint,
        string memory _serviceType,
        string memory _description,
        uint256 _pricePerCall,
        string memory _chain
    ) external returns (bytes32) {
        // Generate unique service ID
        bytes32 serviceId = keccak256(
            abi.encodePacked(msg.sender, _endpoint, block.timestamp)
        );
        
        require(services[serviceId].provider == address(0), "Service already exists");
        
        // Create service record
        services[serviceId] = Service({
            provider: msg.sender,
            endpoint: _endpoint,
            serviceType: _serviceType,
            description: _description,
            pricePerCall: _pricePerCall,
            chain: _chain,
            totalCalls: 0,
            totalRevenue: 0,
            reputationScore: 50,  // Start at neutral reputation
            isActive: true,
            registeredAt: block.timestamp
        });
        
        // Update indices
        allServiceIds.push(serviceId);
        providerServices[msg.sender].push(serviceId);
        verticalServices[_serviceType].push(serviceId);
        
        emit ServiceRegistered(
            serviceId,
            msg.sender,
            _endpoint,
            _serviceType,
            _pricePerCall
        );
        
        return serviceId;
    }
    
    /**
     * @notice Update service price and active status
     * @param _serviceId Unique service identifier
     * @param _newPrice New price per call in wei
     * @param _isActive Whether service is accepting calls
     */
    function updateService(
        bytes32 _serviceId,
        uint256 _newPrice,
        bool _isActive
    ) external {
        Service storage service = services[_serviceId];
        require(service.provider == msg.sender, "Not service owner");
        
        service.pricePerCall = _newPrice;
        service.isActive = _isActive;
        
        emit ServiceUpdated(_serviceId, _newPrice, _isActive);
    }
    
    /**
     * @notice Record a successful API call (called by payment verifier)
     * @param _serviceId Service that was called
     * @param _buyer Address that made the payment
     * @param _amount Payment amount in wei
     */
    function recordCall(
        bytes32 _serviceId,
        address _buyer,
        uint256 _amount
    ) external {
        Service storage service = services[_serviceId];
        require(service.isActive, "Service not active");
        
        service.totalCalls++;
        service.totalRevenue += _amount;
        
        // Update reputation based on successful call
        // Simple algorithm: +1 point per successful call (max 100)
        if (service.reputationScore < 100) {
            service.reputationScore++;
        }
        
        emit ServiceCallRecorded(_serviceId, _buyer, _amount);
        emit ReputationUpdated(_serviceId, service.reputationScore);
    }
    
    /**
     * @notice Get service details
     * @param _serviceId Service identifier
     * @return Service struct
     */
    function getService(bytes32 _serviceId) 
        external 
        view 
        returns (Service memory) 
    {
        return services[_serviceId];
    }
    
    /**
     * @notice Get all services for a specific vertical
     * @param _vertical Vertical category (e.g., "customer-support")
     * @return Array of service IDs
     */
    function getServicesByVertical(string memory _vertical) 
        external 
        view 
        returns (bytes32[] memory) 
    {
        return verticalServices[_vertical];
    }
    
    /**
     * @notice Get all services by a provider
     * @param _provider Provider address
     * @return Array of service IDs
     */
    function getServicesByProvider(address _provider) 
        external 
        view 
        returns (bytes32[] memory) 
    {
        return providerServices[_provider];
    }
    
    /**
     * @notice Get total number of registered services
     * @return Count of all services
     */
    function getTotalServices() external view returns (uint256) {
        return allServiceIds.length;
    }
    
    /**
     * @notice Get all service IDs (paginated)
     * @param _offset Starting index
     * @param _limit Number of results to return
     * @return Array of service IDs
     */
    function getAllServices(uint256 _offset, uint256 _limit) 
        external 
        view 
        returns (bytes32[] memory) 
    {
        require(_offset < allServiceIds.length, "Offset out of bounds");
        
        uint256 end = _offset + _limit;
        if (end > allServiceIds.length) {
            end = allServiceIds.length;
        }
        
        bytes32[] memory result = new bytes32[](end - _offset);
        for (uint256 i = _offset; i < end; i++) {
            result[i - _offset] = allServiceIds[i];
        }
        
        return result;
    }
}
