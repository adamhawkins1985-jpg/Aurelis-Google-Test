import React, { useEffect, useRef } from 'react';
import {
  CandlestickSeries,
  ColorType,
  createChart,
  CrosshairMode,
  HistogramSeries,
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
  timeframe: '5m' | '15m' | '1H' | '4H';
  bars: KrakenBar[];
  stop?: number;
  target?: number;
  onPrice?: (price: number) => void;
}

export const KrakenLiveChart: React.FC<KrakenLiveChartProps> = ({
  symbol,
  timeframe,
  bars,
  stop,
  target,
  onPrice,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const candleRef = useRef<ISeriesApi<'Candlestick'> | null>(null);
  const volumeRef = useRef<ISeriesApi<'Histogram'> | null>(null);
  const currentBarRef = useRef<KrakenBar | null>(null);
  const fitKeyRef = useRef('');

  useEffect(() => {
    if (!containerRef.current) return;
    const chart = createChart(containerRef.current, {
      autoSize: true,
      layout: {
        background: { type: ColorType.Solid, color: 'transparent' },
        textColor: '#75859a',
        fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
        fontSize: 10,
      },
      grid: {
        vertLines: { color: 'rgba(120,140,160,.10)' },
        horzLines: { color: 'rgba(120,140,160,.10)' },
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
      upColor: '#00e6a2',
      downColor: '#ff4f78',
      borderVisible: false,
      wickUpColor: '#00e6a2',
      wickDownColor: '#ff4f78',
      priceLineVisible: true,
      lastValueVisible: true,
      priceLineColor: '#00d2ff',
      priceLineStyle: LineStyle.Dotted,
    });

    const volume = chart.addSeries(HistogramSeries, {
      priceFormat: { type: 'volume' },
      priceScaleId: '',
      lastValueVisible: false,
      priceLineVisible: false,
    });
    volume.priceScale().applyOptions({ scaleMargins: { top: 0.82, bottom: 0 } });

    chartRef.current = chart;
    candleRef.current = candles;
    volumeRef.current = volume;

    return () => {
      // Other effects also have cleanups. Mark this chart disposed before removing
      // it so price-line cleanup never reaches the released lightweight-charts API.
      chartRef.current = null;
      candleRef.current = null;
      volumeRef.current = null;
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
        color: Number(b.close) >= Number(b.open) ? 'rgba(0,230,162,.35)' : 'rgba(255,79,120,.35)',
      }))
    );

    currentBarRef.current = { ...bars[bars.length - 1] };

    const key = symbol + ':' + timeframe;
    if (fitKeyRef.current !== key) {
      fitKeyRef.current = key;
      chartRef.current?.timeScale().fitContent();
    }
  }, [bars, symbol, timeframe]);

  useEffect(() => {
    if (!candleRef.current) return;
    const candle = candleRef.current;
    const lines: any[] = [];
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
  }, [stop, target]);

  useEffect(() => {
    const pair = (symbol === 'BTC' ? 'BTC' : symbol) + '/USD';
    const intervalSeconds: Record<string, number> = {
      '5m': 300,
      '15m': 900,
      '1H': 3600,
      '4H': 14400,
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
            color: next.close >= next.open ? 'rgba(0,230,162,.35)' : 'rgba(255,79,120,.35)',
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
      <div className="pointer-events-none absolute left-2 bottom-2 px-2 py-1 rounded bg-surface-canvas/75 border border-white/10 text-[8px] text-text-muted">
        Kraken live trades · drag to pan · wheel to zoom
      </div>
    </div>
  );
};
