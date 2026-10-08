import sys
import unittest
from pathlib import Path
from unittest.mock import patch
sys.path.insert(0,str(Path(__file__).parent))
from dex_strategy_observations import inspect
from agent_wallet_service import BOT_IDS

class StrategyObservationTests(unittest.TestCase):
    @patch("dex_strategy_observations.analyze")
    def test_imbalance_is_not_a_qualified_signal(self, base):
        base.side_effect=lambda bot,asset,side,notional,quotes: {
            "venueAssessments":[{"venue":"extended"}], "qualifiedSignals":[],
            "executionReady":False,"ordersSubmitted":0}
        book={"extended":{"bids":[[100,10]],"asks":[[101,1]]}}
        for bot in BOT_IDS:
            report=inspect(bot,"BTC","long",25,book)
            self.assertEqual(report["venueAssessments"][0]["marketObservation"],"buy_side_heavier")
            self.assertFalse(report["strategyQualified"])
            self.assertFalse(report["venueAssessments"][0]["directionalSignalVerified"])
            self.assertEqual(report["qualifiedSignals"],[])
            self.assertEqual(report["ordersSubmitted"],0)

    @patch("dex_strategy_observations.analyze")
    def test_funding_evidence_remains_unverified(self, base):
        base.return_value={"venueAssessments":[{"venue":"hyperliquid"}],"qualifiedSignals":[]}
        book={"hyperliquid":{"bids":[[99,1]],"asks":[[100,1]]}}
        funding={"venues":{"hyperliquid":{"hourlyFundingRate":"0.0001","observedAt":123,"quoteSource":"metaAndAssetCtxs"}}}
        result=inspect("hunter","BTC","long",25,book,funding)
        evidence=result["venueAssessments"][0]["fundingObservation"]
        self.assertEqual(evidence["hourlyRate"],"0.0001")
        self.assertFalse(evidence["costsVerified"])
        self.assertEqual(result["fundingEvidence"],"public_observation_only")
        self.assertFalse(result["executionReady"])

    @patch("dex_strategy_observations.analyze")
    def test_bad_depth_gives_no_imbalance(self, base):
        base.return_value={"venueAssessments":[{"venue":"extended"}],"qualifiedSignals":[]}
        result=inspect("grid","ETH","short",25,{"extended":{"bids":[["notprice",1]],"asks":[[100,1]]}})
        self.assertIsNone(result["venueAssessments"][0]["observedDepthImbalance"])
        self.assertEqual(result["venueAssessments"][0]["marketObservation"],"inconclusive")

if __name__=="__main__":unittest.main()
