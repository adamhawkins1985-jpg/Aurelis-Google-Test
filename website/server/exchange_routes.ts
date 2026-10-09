import { Router } from 'express';
import { isIP } from 'node:net';
import { ChangeNowService } from './changenow_service';
import { SwapSpaceService } from './swapspace_service';

// Disabled by default: updating the website cannot activate real SwapSpace exchanges.
const swapSpaceEnabled = () => process.env.SWAPSPACE_TRADE_ENABLED === 'true';
import { QuoteRequest, CreateExchangeRequest } from './exchange_models';

export const exchangeRouter = Router();

/**
 * GET /api/exchange/currencies
 * Returns the catalog of supported ChangeNOW assets and their networks
 */
exchangeRouter.get('/currencies', async (_req, res) => {
  try {
    const catalog = swapSpaceEnabled() ? await SwapSpaceService.getCurrencies() : await ChangeNowService.getCurrencies();
    return res.json({ ok: true, catalog, count: catalog.length });
  } catch (err: any) {
    return res.status(500).json({
      ok: false,
      code: 'PROVIDER_UNAVAILABLE',
      message: err?.message || 'Failed to retrieve currency catalog',
    });
  }
});

/**
 * POST /api/exchange/quote
 * Returns estimated quote & minimum amount for swap pair
 */
exchangeRouter.post('/quote', async (req, res) => {
  try {
    const { fromAsset, toAsset, amount }: QuoteRequest = req.body || {};

    if (!fromAsset?.currency || !toAsset?.currency) {
      return res.status(400).json({
        ok: false,
        code: 'UNSUPPORTED_ASSET',
        message: 'Both fromAsset and toAsset with currency are required',
      });
    }

    if (!Number.isFinite(Number(amount)) || Number(amount) <= 0) {
      return res.status(400).json({
        ok: false,
        code: 'BELOW_MINIMUM',
        message: 'A valid numeric amount greater than 0 is required',
      });
    }

    const fromNet = fromAsset.network || fromAsset.currency;
    const toNet = toAsset.network || toAsset.currency;

    const result = swapSpaceEnabled()
      ? await SwapSpaceService.getQuote({currency:fromAsset.currency,network:fromNet},{currency:toAsset.currency,network:toNet},String(amount))
      : await ChangeNowService.getQuote(fromAsset.currency,fromNet,toAsset.currency,toNet,String(amount));

    if (!result.ok) {
      const statusCode = result.code === 'BELOW_MINIMUM' ? 400 : 422;
      return res.status(statusCode).json(result);
    }

    return res.json(result);
  } catch (err: any) {
    return res.status(500).json({
      ok: false,
      code: 'QUOTE_FAILED',
      message: err?.message || 'Unexpected quote processing failure',
    });
  }
});

/**
 * POST /api/exchange/create
 * Creates onchain exchange deposit order on ChangeNOW
 */
exchangeRouter.post('/create', async (req, res) => {
  try {
    const body: CreateExchangeRequest = req.body;

    if (!body?.fromAsset?.currency || !body?.toAsset?.currency) {
      return res.status(400).json({
        ok: false,
        code: 'UNSUPPORTED_ASSET',
        message: 'fromAsset and toAsset are required',
      });
    }

    if (!body?.destinationAddress?.trim()) {
      return res.status(400).json({
        ok: false,
        code: 'INVALID_ADDRESS',
        message: 'Destination wallet address is required',
      });
    }

    if (swapSpaceEnabled() && (!body?.refundAddress?.trim() || !Number.isFinite(Number(body?.amount)) || Number(body.amount) <= 0)) {
      return res.status(400).json({ok:false,code:'INVALID_REQUEST',message:'Valid amount and refund address are required'});
    }
    // Quotes may be enabled independently. Creating deposit orders requires a second explicit opt-in.
    if (swapSpaceEnabled() && process.env.SWAPSPACE_ORDER_CREATE_ENABLED !== 'true') {
      return res.status(503).json({ok:false,code:'ACTION_REQUIRED',message:'SwapSpace order creation is not yet enabled'});
    }
    const rawIp = String(req.ip || req.socket.remoteAddress || '').replace(/^::ffff:/,'');
    if (swapSpaceEnabled() && !isIP(rawIp)) return res.status(400).json({ok:false,code:'INVALID_CLIENT_IP',message:'Client IP unavailable'});
    const result = swapSpaceEnabled() ? await SwapSpaceService.createExchange(body,rawIp) : await ChangeNowService.createExchange(body);

    if (!result.ok) {
      return res.status(400).json(result);
    }

    return res.json(result);
  } catch (err: any) {
    return res.status(500).json({
      ok: false,
      code: 'EXCHANGE_CREATE_FAILED',
      message: err?.message || 'Unexpected failure creating exchange',
    });
  }
});

/**
 * GET /api/exchange/status/:exchangeId
 * Polls status of a created exchange
 */
exchangeRouter.get('/status/:exchangeId', async (req, res) => {
  try {
    const { exchangeId } = req.params;
    if (!exchangeId?.trim()) {
      return res.status(400).json({
        ok: false,
        code: 'EXCHANGE_NOT_FOUND',
        message: 'Exchange ID is required',
      });
    }

    const result = swapSpaceEnabled() ? await SwapSpaceService.getExchangeStatus(exchangeId) : await ChangeNowService.getExchangeStatus(exchangeId);
    return res.json(result);
  } catch (err: any) {
    return res.status(500).json({
      ok: false,
      code: 'PROVIDER_UNAVAILABLE',
      message: err?.message || 'Failed to query exchange status',
    });
  }
});
