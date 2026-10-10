import { Router } from 'express';
import { ChangeNowService } from './changenow_service';
import { QuoteRequest, CreateExchangeRequest } from './exchange_models';

export const exchangeRouter = Router();

/**
 * GET /api/exchange/currencies
 * Returns the catalog of supported ChangeNOW assets and their networks
 */
exchangeRouter.get('/currencies', async (_req, res) => {
  try {
    const catalog = await ChangeNowService.getCurrencies();
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
    const { fromAsset, toAsset, amount }: QuoteRequest = req.body;

    if (!fromAsset?.currency || !toAsset?.currency) {
      return res.status(400).json({
        ok: false,
        code: 'UNSUPPORTED_ASSET',
        message: 'Both fromAsset and toAsset with currency are required',
      });
    }

    if (!amount || isNaN(Number(amount)) || Number(amount) <= 0) {
      return res.status(400).json({
        ok: false,
        code: 'BELOW_MINIMUM',
        message: 'A valid numeric amount greater than 0 is required',
      });
    }

    const fromNet = fromAsset.network || fromAsset.currency;
    const toNet = toAsset.network || toAsset.currency;

    const result = await ChangeNowService.getQuote(
      fromAsset.currency,
      fromNet,
      toAsset.currency,
      toNet,
      String(amount)
    );

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

    const result = await ChangeNowService.createExchange(body);

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

    const result = await ChangeNowService.getExchangeStatus(exchangeId);
    return res.json(result);
  } catch (err: any) {
    return res.status(500).json({
      ok: false,
      code: 'PROVIDER_UNAVAILABLE',
      message: err?.message || 'Failed to query exchange status',
    });
  }
});
