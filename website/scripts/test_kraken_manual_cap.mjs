import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const backend=readFileSync('server/migrated_backend.ts','utf8');
const live=readFileSync('src/components/trade/LiveBetView.tsx','utf8');
const desk=readFileSync('src/components/SignalDeskScreen.tsx','utf8');
const readiness=readFileSync('src/components/trade/BotTestReadiness.tsx','utf8');

const prepareStart=backend.indexOf('async function prepareKrakenOrder(');
const submitStart=backend.indexOf('async function submitKrakenOrder(');
const end=backend.indexOf('const AAVE_MCP_DEFAULT_ENDPOINT',submitStart);
assert(prepareStart>=0&&submitStart>prepareStart&&end>submitStart,'Both Kraken order handlers must exist');
const prepare=backend.slice(prepareStart,submitStart);
const submit=backend.slice(submitStart,end);

assert(prepare.includes('amount>10 || amount<10'),'First Kraken preview notional must be exactly $10');
assert(prepare.includes('leverage>2'),'Kraken preview must reject leverage above 2x');
assert(prepare.includes('conditionalClose:{orderType:\'stop-loss\''),'Kraken preview must describe conditional stop');
assert(submit.includes('Number(p.positionValueUsd)>10||Number(p.positionValueUsd)<10'),'Submit must recheck $10 max notional');
assert(submit.includes('Number(p.leverage)>2'),'Submit must recheck 2x max leverage');
assert(submit.includes("payload?.acknowledgeLiveTest!==true"),'Submit must require fresh explicit user approval');
assert(submit.includes("process.env.AURELIS_KRAKEN_MARGIN_EXECUTION_ENABLED!=='1'"),'Submit must be disabled by default');
assert(submit.includes("throw new Error('trade_confirmation_used')"),'Submit must reject reused confirmation tokens');
assert(submit.includes("'close[ordertype]':'stop-loss'"),'Conditional stop must be requested on entry');
assert(submit.includes('kraken_price_moved_repreview'),'Submit must reject stale quotes');
assert(backend.includes("app.post('/api/signal-desk/order/submit'"),'Owner-protected submit route must exist');
const api=backend.slice(backend.indexOf("app.post('/api/signal-desk/order/submit'"),backend.indexOf("app.post('/api/signal-desk/order/submit'")+240);
assert(api.includes('requireBotAccountOwner(req,res)'),'Submission must require Bot Wallet owner authorization');
assert(live.includes("const [amount, setAmount] = useState('10')"),'Live Bet must default to $10');
assert(desk.includes("const [positionAmount, setPositionAmount] = useState('10')"),'Signal Desk must default to $10');
assert(readiness.includes('First test: $10 total notional maximum'),'Readiness panel must show $10 cap');
console.log('PASS: Kraken $10 notional, 2x max, owner authorization, fresh manual consent, conditional stop, default-locked execution.');
