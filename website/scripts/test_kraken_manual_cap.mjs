import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const backend=readFileSync('server/migrated_backend.ts','utf8');
const live=readFileSync('src/components/trade/LiveBetView.tsx','utf8');
const desk=readFileSync('src/components/SignalDeskScreen.tsx','utf8');
const readiness=readFileSync('src/components/trade/BotTestReadiness.tsx','utf8');

const prepareStart=backend.indexOf('async function prepareKrakenOrder(');
const validatorStart=backend.indexOf('async function validateKrakenPreparedOrder(');
const submitStart=backend.indexOf('async function submitKrakenOrder(');
const end=backend.indexOf('const AAVE_MCP_DEFAULT_ENDPOINT',submitStart);
assert(prepareStart>=0&&submitStart>prepareStart&&end>submitStart,'Both Kraken order handlers must exist');
const prepare=backend.slice(prepareStart,submitStart);
const submit=backend.slice(submitStart,end);
const validation=backend.slice(validatorStart,submitStart);

assert(prepare.includes('amount>10 || amount<10'),'First Kraken preview notional must be exactly $10');
assert(prepare.includes('leverage>2'),'Kraken preview must reject leverage above 2x');
assert(prepare.includes('pair.ordermin'),'Preview must enforce exchange minimum base quantity');
assert(prepare.includes('pair.costmin'),'Preview must enforce exchange minimum notional cost');
assert(prepare.includes('pair.status'),'Preview must reject nontrading market status');
assert(backend.includes('execution_venue=bitnomial_exchange'),'US retail margin quote must use BTNL venue');
assert(validation.includes('trade_confirmation_expired_during_validation'),'Delayed Kraken validation cannot approve an expired preview');
assert(live.includes('validationExpiresAt')&&live.includes('setValidationExpiresAt(expiresAt)'),'Live Bet must track validation expiration');
assert(desk.includes('krakenValidationExpiresAt'),'Signal Desk must track validation expiration');

assert(prepare.includes('conditionalClose:{orderType:\'stop-loss\''),'Kraken preview must describe conditional stop');
assert(submit.includes('Number(p.positionValueUsd)>10||Number(p.positionValueUsd)<10'),'Submit must recheck $10 max notional');
assert(submit.includes('Number(p.leverage)>2'),'Submit must recheck 2x max leverage');
assert(submit.includes("payload?.acknowledgeLiveTest!==true"),'Submit must require fresh explicit user approval');
assert(submit.includes("process.env.AURELIS_KRAKEN_MARGIN_EXECUTION_ENABLED!=='1'"),'Submit must be disabled by default');
assert(submit.includes("throw new Error('trade_confirmation_used')"),'Submit must reject reused confirmation tokens');
assert(backend.includes("'close[ordertype]':'stop-loss'"),'Protected order payload must include Kraken stop-loss');
assert(submit.includes('krakenProtectedOrderPayload(item)'),'Submit must use the same order payload as validation');
assert(submit.includes('kraken_price_moved_repreview'),'Submit must reject stale quotes');
assert(submit.includes('kraken_validation_required_or_expired'),'Submission requires recent successful validation');
assert(submit.includes("validate:'true'"),'Revalidate exact protected order before live submission');
assert(validatorStart>prepareStart&&submitStart>validatorStart,'No-order Kraken validation handler is required');
assert(validation.includes("validate:'true'"),'Exchange validation MUST use validate=true');
assert(validation.includes("krakenProtectedOrderPayload(item)"),'Exchange validation must use protected payload');
assert(validation.includes("orderPlaced:false"),'Validation response must explicitly report no order placed');
assert(backend.includes("app.post('/api/signal-desk/order/validate'"),'Separate validation endpoint must be exposed');
const validationRoute=backend.slice(backend.indexOf("app.post('/api/signal-desk/order/validate'"),
    backend.indexOf("app.post('/api/signal-desk/order/submit'"));
assert(validationRoute.includes('requireBotAccountOwner(req,res)'),'Validation must require signed owner');
assert(live.includes('onClick={reviewKraken}'),'Live Bet must offer a usable Kraken review button');
assert(live.includes('onClick={validateKraken}'),'Live Bet must offer validation without trading');
assert(live.includes('!krakenValidated||busy'),'Live Bet submit must require Kraken validation');
assert(desk.includes('onClick={handleValidateSetup}'),'Signal Desk must offer no-trade validation');
assert(desk.includes('!krakenValidated || orderBusy'),'Signal Desk submit must require validation');
assert(!desk.includes('setActivePosition({\\n        symbol: selectedCoinSymbol'),'Signal Desk must not invent a fill from submission');

assert(backend.includes("app.post('/api/signal-desk/order/submit'"),'Owner-protected submit route must exist');
const api=backend.slice(backend.indexOf("app.post('/api/signal-desk/order/submit'"),backend.indexOf("app.post('/api/signal-desk/order/submit'")+240);
assert(api.includes('requireBotAccountOwner(req,res)'),'Submission must require Bot Wallet owner authorization');
assert(live.includes("const [amount, setAmount] = useState('10')"),'Live Bet must default to $10');
assert(desk.includes("const [positionAmount, setPositionAmount] = useState('10')"),'Signal Desk must default to $10');
assert(readiness.includes('First test: $10 total notional maximum'),'Readiness panel must show $10 cap');
console.log('PASS: Kraken $10 notional, 2x max, owner authorization, fresh manual consent, conditional stop, default-locked execution.');
