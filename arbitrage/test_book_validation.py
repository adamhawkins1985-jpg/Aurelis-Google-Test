import sys
import unittest
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent))
from book_validation import validate_book

class BookTests(unittest.TestCase):
    def setUp(self):
        self.good = {"bids": [[99.0, 2.0], [98.0, 4.0]], "asks": [[100.0, 2.0], [101.0, 3.0]]}

    def test_valid_depth(self):
        output = validate_book("dydx", "BTC", self.good, 100, now=101)
        self.assertTrue(output["quoteUsable"])
        self.assertFalse(output["executionReady"])

    def test_crossed_and_stale_rejected(self):
        for book, at, reason in (
            ({"bids": [[101, 1]], "asks": [[100, 1]]}, 100, "crossed_book"),
            (self.good, 70, "stale_quote"),
            ({"bids": [[99, 1], [100, 1]], "asks": [[101, 1]]}, 100, "unordered_depth"),
            ({"bids": [[99, float("nan")]], "asks": [[100, 1]]}, 100, "invalid_depth"),
            ({"bids": [[50, 1]], "asks": [[100, 1]]}, 100, "abnormal_spread"),
        ):
            with self.subTest(reason=reason):
                result = validate_book("dydx", "BTC", book, at, now=101)
                self.assertFalse(result["quoteUsable"])
                self.assertEqual(result["reason"], reason)

if __name__ == "__main__":
    unittest.main()
