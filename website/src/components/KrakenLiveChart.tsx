import React, { useEffect, useRef } from 'react';
import {
  CandlestickSeries,
  ColorType,
  createChart,
  CrosshairMode,
  HistogramSeries,
  LineSeries,
  LineStyle,
  type IChartApi,
  type ISeriesApi,
  type UTCTimestamp,
} from 'lightweight-charts';

type KrakenBar = {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume?: number;
};

interface KrakenLiveChartProps {
  symbol: string;
  timeframe: '5m' | '15m' | '30m' | '1H' | '4H' | '8h' | '12h' | '1d' | '3d' | '7d';
  bars: KrakenBar[];
  stop?: number;
  target?: number;
  support?: number;
  resistance?: number;
  showMovingAverages?: boolean;
  onPrice?: (price: number) => void;
}

export const KrakenLiveChart: React.FC<KrakenLiveChartProps> = ({
  symbol,
  timeframe,
  bars,
  stop,
  target,
  support,
  resistance,
  showMovingAverages = true,
  onPrice,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const candleRef = useRef<ISeriesApi<'Candlestick'> | null>(null);
  const volumeRef = useRef<ISeriesApi<'Histogram'> | null>(null);
  const ema20Ref = useRef<ISeriesApi<'Line'> | null>(null);
  const ema50Ref = useRef<ISeriesApi<'Line'> | null>(null);
  const paletteRef = useRef({ up: '#00e6a2', down: '#ff4f78' });
  const currentBarRef = useRef<KrakenBar | null>(null);
  const fitKeyRef = useRef('');

  useEffect(() => {
    if (!containerRef.current) return;
    const light = document.documentElement.getAttribute('data-theme') === 'light'
      || document.documentElement.classList.contains('theme-light')
      || document.body.classList.contains('theme-light')
      || !!containerRef.current.closest('[data-theme="light"], .theme-light');
    paletteRef.current = { up: light ? '#047857' : '#00e6a2', down: light ? '#be123c' : '#ff4f78' };
    const chart = createChart(containerRef.current, {
      autoSize: true,
      layout: {
        background: { type: ColorType.Solid, color: 'transparent' },
        textColor: light ? '#475569' : '#94a3b8',
        fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
        fontSize: 10,
      },
      grid: {
        vertLines: { color: light ? 'rgba(100,116,139,.13)' : 'rgba(120,140,160,.10)' },
        horzLines: { color: light ? 'rgba(100,116,139,.13)' : 'rgba(120,140,160,.10)' },
      },
      crosshair: { mode: CrosshairMode.Normal },
      rightPriceScale: { borderColor: 'rgba(120,140,160,.18)' },
      timeScale: {
        borderColor: 'rgba(120,140,160,.18)',
        timeVisible: true,
        secondsVisible: false,
        rightOffset: 6,
        barSpacing: 10,
        minBarSpacing: 2,
      },
      handleScroll: {
        mouseWheel: true,
        pressedMouseMove: true,
        horzTouchDrag: true,
        vertTouchDrag: false,
      },
      handleScale: {
        axisPressedMouseMove: true,
        mouseWheel: true,
        pinch: true,
      },
    });

    const candles = chart.addSeries(CandlestickSeries, {
      upColor: paletteRef.current.up,
      downColor: paletteRef.current.down,
      borderVisible: false,
      wickUpColor: paletteRef.current.up,
      wickDownColor: paletteRef.current.down,
      priceLineVisible: true,
      lastValueVisible: true,
      priceLineColor: light ? '#0284c7' : '#00d2ff',
      priceLineStyle: LineStyle.Dotted,
    });

    const volume = chart.addSeries(HistogramSeries, {
      priceFormat: { type: 'volume' },
      priceScaleId: '',
      lastValueVisible: false,
      priceLineVisible: false,
    });
    volume.priceScale().applyOptions({ scaleMargins: { top: 0.82, bottom: 0 } });

    const ema20 = chart.addSeries(LineSeries, {
      color: '#d97706', lineWidth: 2, priceLineVisible: false,
      lastValueVisible: true, title: 'EMA20', crosshairMarkerVisible: false,
    });
    const ema50 = chart.addSeries(LineSeries, {
      color: '#3b82f6', lineWidth: 2, priceLineVisible: false,
      lastValueVisible: true, title: 'EMA50', crosshairMarkerVisible: false,
    });
    chartRef.current = chart;
    candleRef.current = candles;
    volumeRef.current = volume;
    ema20Ref.current = ema20;
    ema50Ref.current = ema50;

    return () => {
      // Other effects also have cleanups. Mark this chart disposed before removing
      // it so price-line cleanup never reaches the released lightweight-charts API.
      chartRef.current = null;
      candleRef.current = null;
      volumeRef.current = null;
      ema20Ref.current = null;
      ema50Ref.current = null;
      chart.remove();
    };
  }, []);
  useEffect(() => {
    if (!candleRef.current || !volumeRef.current || !bars.length) return;

    const clean = bars
      .filter((b) => Number.isFinite(b.time) && Number.isFinite(b.close))
      .map((b) => ({
        time: Math.floor(b.time) as UTCTimestamp,
        open: Number(b.open),
        high: Number(b.high),
        low: Number(b.low),
        close: Number(b.close),
      }));

    candleRef.current.setData(clean);
    volumeRef.current.setData(
      bars.map((b) => ({
        time: Math.floor(b.time) as UTCTimestamp,
        value: Number(b.volume || 0),
        color: Number(b.close) >= Number(b.open) ? paletteRef.current.up+'66' : paletteRef.current.down+'66',
      }))
    );

    // Calculate complete rolling EMA lines from the same Kraken bars shown here.
    // The latest forming candle can shift the final line value, so this is
    // an illustrative overlay, not an additional independent bot signal.
    const emaData = (period: number) => {
      let running: number | null = null;
      const smoothing = 2 / (period + 1);
      const values: { time: UTCTimestamp; value: number }[] = [];
      for (let i = 0; i < bars.length; i++) {
        const close = Number(bars[i].close);
        if (!Number.isFinite(close) || close <= 0) continue;
        if (running === null) {
          if (i + 1 < period) continue;
          const seed = bars.slice(i + 1 - period, i + 1).map(x => Number(x.close));
          if (seed.some(x => !Number.isFinite(x) || x <= 0)) continue;
          running = seed.reduce((sum, n) => sum + n, 0) / period;
        } else running += (close - running) * smoothing;
        values.push({ time: Math.floor(bars[i].time) as UTCTimestamp, value: running });
      }
      return values;
    };
    ema20Ref.current?.setData(showMovingAverages ? emaData(20) : []);
    ema50Ref.current?.setData(showMovingAverages ? emaData(50) : []);
    currentBarRef.current = { ...bars[bars.length - 1] };

    const key = symbol + ':' + timeframe;
    if (fitKeyRef.current !== key) {
      fitKeyRef.current = key;
      chartRef.current?.timeScale().fitContent();
    }
  }, [bars, symbol, timeframe, showMovingAverages]);

  useEffect(() => {
    if (!candleRef.current) return;
    const candle = candleRef.current;
    const lines: any[] = [];
    if (support && support > 0) {
      lines.push(candle.createPriceLine({
        price: support, color: '#64748b', lineWidth: 1,
        lineStyle: LineStyle.Dashed, axisLabelVisible: true, title: 'SUPPORT',
      }));
    }
    if (resistance && resistance > 0) {
      lines.push(candle.createPriceLine({
        price: resistance, color: '#a855f7', lineWidth: 1,
        lineStyle: LineStyle.Dashed, axisLabelVisible: true, title: 'RESIST.',
      }));
    }
    if (stop && stop > 0) {
      lines.push(
        candle.createPriceLine({
          price: stop,
          color: '#ff4f78',
          lineWidth: 1,
          lineStyle: LineStyle.Dashed,
          axisLabelVisible: true,
          title: 'STOP',
        })
      );
    }
    if (target && target > 0) {
      lines.push(
        candle.createPriceLine({
          price: target,
          color: '#00e6a2',
          lineWidth: 1,
          lineStyle: LineStyle.Dashed,
          axisLabelVisible: true,
          title: 'TARGET',
        })
      );
    }
    return () => {
      if (candleRef.current !== candle) return;
      lines.forEach((line) => candle.removePriceLine(line));
    };
  }, [stop, target, support, resistance]);

  useEffect(() => {
    const pair = (symbol === 'BTC' ? 'BTC' : symbol) + '/USD';
    const intervalSeconds: Record<string, number> = {
      '5m': 300,
      '15m': 900,
      '30m': 1800,
      '1H': 3600,
      '4H': 14400,
      '8h': 28800,
      '12h': 43200,
      '1d': 86400,
      '3d': 259200,
      '7d': 604800,
    };
    const bucketSize = intervalSeconds[timeframe] || 300;
    const ws = new WebSocket('wss://ws.kraken.com/v2');

    ws.addEventListener('open', () => {
      ws.send(
        JSON.stringify({
          method: 'subscribe',
          params: { channel: 'trade', symbol: [pair], snapshot: false },
        })
      );
    });

    ws.addEventListener('message', (event) => {
      try {
        const msg = JSON.parse(String(event.data || ''));
        if (msg?.channel !== 'trade' || !Array.isArray(msg?.data)) return;

        for (const trade of msg.data) {
          const price = Number(trade?.price);
          const qty = Number(trade?.qty || 0);
          const tsMs = Date.parse(String(trade?.timestamp || ''));
          if (!Number.isFinite(price) || !Number.isFinite(tsMs)) continue;

          const epoch = Math.floor(tsMs / 1000);
          const bucket = Math.floor(epoch / bucketSize) * bucketSize;
          const previous = currentBarRef.current;
          let next: KrakenBar;

          if (previous && previous.time === bucket) {
            next = {
              ...previous,
              high: Math.max(previous.high, price),
              low: Math.min(previous.low, price),
              close: price,
              volume: Number(previous.volume || 0) + qty,
            };
          } else {
            const open = previous?.close ?? price;
            next = { time: bucket, open, high: price, low: price, close: price, volume: qty };
          }

          currentBarRef.current = next;
          candleRef.current?.update({
            time: bucket as UTCTimestamp,
            open: next.open,
            high: next.high,
            low: next.low,
            close: next.close,
          });
          volumeRef.current?.update({
            time: bucket as UTCTimestamp,
            value: Number(next.volume || 0),
            color: next.close >= next.open ? paletteRef.current.up+'66' : paletteRef.current.down+'66',
          });
          onPrice?.(price);
        }
      } catch {}
    });

    return () => ws.close();
  }, [symbol, timeframe, onPrice]);

  return (
    <div className="relative w-full h-72 sm:h-[340px] bg-surface-base/90 rounded-lg border border-white/5 overflow-hidden">
      <div ref={containerRef} className="absolute inset-0" />
      <div className="pointer-events-none absolute top-2 left-2 flex flex-wrap gap-2 bg-surface-canvas/80 rounded px-2 py-1 text-[9px] border border-white/10 text-text-secondary">
        <span>Kraken candles</span>
        {showMovingAverages && <><span className="text-amber-500">● EMA20</span><span className="text-blue-500">● EMA50</span></>}
        {support != null && <span className="text-text-secondary">● Support</span>}
        {resistance != null && <span className="text-purple-500">● Resistance</span>}
      </div>
    </div>
  );
};
