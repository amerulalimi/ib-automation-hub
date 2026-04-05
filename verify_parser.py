import asyncio
import os
import sys

# Add backend to sys.path to import from there
sys.path.append(os.path.abspath(os.path.join(os.getcwd(), "backend")))

from backend.services.signal_parser import regex_fallback_parser, _standardize_pair

def test_standardization():
    print("Testing Standardization...")
    tests = [
        ("Gold", "XAUUSD"),
        ("XAU", "XAUUSD"),
        ("XAUUSD_IB", "XAUUSD"),
        ("gbpusd", "GBPUSD"),
        ("EURUSD", "EURUSD"),
    ]
    for inp, expected in tests:
        res = _standardize_pair(inp)
        assert res == expected, f"Failed: {inp} -> {res} (Expected {expected})"
    print("Standardization Tests Passed!")

def test_regex_fallback():
    print("\nTesting Regex Fallback...")
    sample_text = """
    SELL GOLD NOW
    ENTRY: 2650.50 - 2655
    SL: 2665
    TP: 2640, 2630
    """
    res = regex_fallback_parser(sample_text)
    print(f"Result: {res}")
    assert res["is_signal"] is True
    assert res["pair"] == "XAUUSD"
    assert res["order_type"] == "SELL"
    assert res["entry"] == 2650.5
    assert res["sl"] == 2665.0
    assert 2640.0 in res["tp"]
    print("Regex Fallback Tests Passed!")

if __name__ == "__main__":
    test_standardization()
    test_regex_fallback()
