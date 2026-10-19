"""가격 수집 스크립트의 핵심 함수 테스트. python3 -m unittest discover -s tests -p "test_*.py" """
import importlib.util
import unittest
from pathlib import Path

spec = importlib.util.spec_from_file_location("fetch_prices", Path(__file__).resolve().parent.parent / "scripts" / "fetch_prices.py")
fp = importlib.util.module_from_spec(spec)
spec.loader.exec_module(fp)


def row(price, start="0", end="Inf"):
    return {"PricePerUnit": str(price), "StartingRange": start, "EndingRange": end}


class UsageMatchTest(unittest.TestCase):
    def test_region_prefix_optional(self):
        self.assertTrue(fp.usage_matches("APN2-Request", "Request", "APN2"))
        self.assertTrue(fp.usage_matches("Request", "Request", "USE1"))

    def test_other_prefix_rejected(self):
        # 'IA-ReadRequestUnits'를 'ReadRequestUnits'로 잘못 잡던 버그 재발 방지
        self.assertFalse(fp.usage_matches("IA-ReadRequestUnits", "ReadRequestUnits", "USE1"))
        self.assertFalse(fp.usage_matches("APN2-Lambda-Edge-Request", "Request", "APN2"))

    def test_exact_match(self):
        self.assertTrue(fp.usage_matches("AP-DataTransfer-Out-Bytes", "=AP-DataTransfer-Out-Bytes", "APN2"))
        self.assertFalse(fp.usage_matches("APN2-AP-DataTransfer-Out-Bytes", "=AP-DataTransfer-Out-Bytes", "APN2"))


class PickPriceTest(unittest.TestCase):
    def test_first_paid_tier_and_end(self):
        rows = [row(0, "0", "25"), row(0.25, "25", "Inf")]
        self.assertEqual(fp.pick_price("x", rows), (0.25, None))
        rows = [row(0.09, "0", "10240"), row(0.085, "10240", "51200")]
        self.assertEqual(fp.pick_price("x", rows), (0.09, 10240.0))

    def test_ambiguous_fails(self):
        with self.assertRaises(ValueError):
            fp.pick_price("x", [row(0.1), row(0.2)])

    def test_missing_fails(self):
        with self.assertRaises(ValueError):
            fp.pick_price("x", [])


class PathTest(unittest.TestCase):
    def test_split_path_keeps_instance_name(self):
        self.assertEqual(fp.split_path("ec2.t4g.micro.hourly"), ["ec2", "t4g.micro", "hourly"])
        self.assertEqual(fp.split_path("alb.hourly"), ["alb", "hourly"])


class DiffTest(unittest.TestCase):
    def test_changes_and_added(self):
        old = {"updatedAt": "2026-10-01", "regions": {"r": {"name": "R", "ec2": {"a": {"hourly": 1.0}}, "dataTransferOut": {"perGb": 0.1, "perGbUpTo": 10}}}}
        new = {"updatedAt": "2026-10-08", "regions": {
            "r": {"name": "R", "ec2": {"a": {"hourly": 1.5}, "b": {"hourly": 2.0}}, "dataTransferOut": {"perGb": 0.1, "perGbUpTo": 20}},
            "s": {"name": "S", "ec2": {"a": {"hourly": 1.0}}},
        }}
        d = fp.diff_prices(old, new)
        self.assertEqual(d["changes"], [{"region": "r", "item": "ec2/a/hourly", "old": 1.0, "new": 1.5}])
        self.assertEqual(d["addedItems"], 2)  # r의 b, 새 리전 s의 a (구간 한도 UpTo는 비교하지 않음)
        self.assertEqual(d["removedItems"], 0)
        self.assertEqual(d["previousUpdatedAt"], "2026-10-01")


if __name__ == "__main__":
    unittest.main()
