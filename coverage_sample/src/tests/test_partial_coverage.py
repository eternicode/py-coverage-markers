from src.partial_coverage import covered_function

def test_covered_function():
    assert covered_function() is None
