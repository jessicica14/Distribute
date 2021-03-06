pragma solidity ^0.5.0;

// divide by 10 ** precision at the very end
library Division {
    function percent(uint256 _numerator, uint256 _denominator, uint256 _precision) internal pure returns (uint256) {
        require(_denominator > 0);
        uint256 numerator = _numerator * 10 ** (_precision + 1);
        // with rounding of last digit
        return ((numerator / _denominator) + 5) / 10;
    }
}
