import { ChangeNowService } from '../server/changenow_service';

interface TestCase {
  name: string;
  fromCurrency: string;
  fromNetwork: string;
  toCurrency: string;
  toNetwork: string;
  amount: string;
}

const TEST_CASES: TestCase[] = [
  {
    name: 'BTC -> ETH',
    fromCurrency: 'btc',
    fromNetwork: 'btc',
    toCurrency: 'eth',
    toNetwork: 'eth',
    amount: '0.05',
  },
  {
    name: 'ETH -> BTC',
    fromCurrency: 'eth',
    fromNetwork: 'eth',
    toCurrency: 'btc',
    toNetwork: 'btc',
    amount: '1.0',
  },
  {
    name: 'BTC -> TAO',
    fromCurrency: 'btc',
    fromNetwork: 'btc',
    toCurrency: 'tao',
    toNetwork: 'tao',
    amount: '0.05',
  },
  {
    name: 'ETH -> TAO',
    fromCurrency: 'eth',
    fromNetwork: 'eth',
    toCurrency: 'tao',
    toNetwork: 'tao',
    amount: '1.0',
  },
  {
    name: 'SOL -> TAO',
    fromCurrency: 'sol',
    fromNetwork: 'sol',
    toCurrency: 'tao',
    toNetwork: 'tao',
    amount: '10.0',
  },
  {
    name: 'USDC Arbitrum -> TAO',
    fromCurrency: 'usdc',
    fromNetwork: 'arbitrum',
    toCurrency: 'tao',
    toNetwork: 'tao',
    amount: '500.0',
  },
  {
    name: 'TAO -> BTC',
    fromCurrency: 'tao',
    fromNetwork: 'tao',
    toCurrency: 'btc',
    toNetwork: 'btc',
    amount: '5.0',
  },
];

async function runTests() {
  console.log('===============================================================');
  console.log('AURELIS ChangeNOW Quote Test Suite (Read-Only / No Live Orders)');
  console.log('===============================================================\n');

  let passed = 0;
  let failed = 0;

  for (const t of TEST_CASES) {
    process.stdout.write(`Testing ${t.name} (Amount: ${t.amount} ${t.fromCurrency.toUpperCase()})... `);
    try {
      const minData = await ChangeNowService.getMinimum(
        t.fromCurrency,
        t.fromNetwork,
        t.toCurrency,
        t.toNetwork
      );

      const quote = await ChangeNowService.getQuote(
        t.fromCurrency,
        t.fromNetwork,
        t.toCurrency,
        t.toNetwork,
        t.amount
      );

      if (quote.ok) {
        console.log(`\x1b[32mPASS\x1b[0m`);
        console.log(`  - Minimum: ${quote.minimumAmount} ${quote.fromCurrency}`);
        console.log(`  - Expected Receive: ${quote.toAmount} ${quote.toCurrency}`);
        console.log(`  - Network Route: ${t.fromNetwork.toUpperCase()} -> ${t.toNetwork.toUpperCase()}`);
        passed++;
      } else {
        console.log(`\x1b[31mFAIL\x1b[0m (${quote.code}: ${quote.message})`);
        failed++;
      }
    } catch (err: any) {
      console.log(`\x1b[31mERROR\x1b[0m: ${err?.message || err}`);
      failed++;
    }
    console.log('');
  }

  console.log('---------------------------------------------------------------');
  console.log(`Results: ${passed}/${TEST_CASES.length} Passed, ${failed} Failed.`);
  console.log('---------------------------------------------------------------');

  if (failed > 0) {
    process.exit(1);
  }
}

runTests();
