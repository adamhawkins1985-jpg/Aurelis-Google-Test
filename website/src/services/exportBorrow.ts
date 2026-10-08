/**
 * Utility to export the Aurelis DeFi Borrow page as:
 * 1. A standalone self-contained HTML file (opens and runs in any browser offline)
 * 2. A Markdown loan report for Discord / Telegram / Notion
 * 3. Browser file download helper
 */

export interface ExportBorrowParams {
  collateralAsset: string;
  collateralAmount: number;
  collateralPrice: number;
  collateralValue: number;
  receiveAsset: string;
  provider: string;
  network: string;
  borrowApr: number;
  maxBorrow: number;
  saferBorrow: number;
  monthlyInterest: number;
  liquidationPrice: number;
  dropToLiquidation: number;
  maxLtv: number;
  liquidationThreshold: number;
}

/**
 * Generate a complete, standalone, zero-dependency HTML file for the Borrow Desk
 */
export function generateStandaloneBorrowHtml(params: ExportBorrowParams): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Aurelis DeFi - Borrow Desk (${params.collateralAsset})</title>
  <style>
    :root {
      --bg-base: #06090e;
      --bg-panel: #0d131a;
      --bg-card: #121a24;
      --primary: #00F5A0;
      --accent: #00D2FF;
      --error: #FF3B69;
      --warning: #F59E0B;
      --text: #F1F5F9;
      --text-muted: #64748B;
      --border: rgba(255, 255, 255, 0.08);
      --font-mono: 'JetBrains Mono', 'SF Mono', Consolas, Menlo, monospace;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      background: var(--bg-base);
      color: var(--text);
      font-family: var(--font-mono);
      font-size: 12px;
      line-height: 1.5;
      padding: 16px;
      display: flex;
      justify-content: center;
    }
    .borrow-container {
      max-width: 1100px;
      width: 100%;
      display: flex;
      flex-direction: column;
      gap: 16px;
    }
    .card {
      background: var(--bg-panel);
      border: 1px solid var(--border);
      border-radius: 14px;
      padding: 18px;
      display: flex;
      flex-direction: column;
      gap: 12px;
    }
    .header-bar {
      display: flex;
      justify-content: space-between;
      align-items: center;
      flex-wrap: wrap;
      gap: 12px;
    }
    .badge {
      font-size: 10px;
      padding: 3px 8px;
      border-radius: 999px;
      font-weight: bold;
      text-transform: uppercase;
      background: rgba(0, 245, 160, 0.15);
      color: var(--primary);
      border: 1px solid rgba(0, 245, 160, 0.3);
    }
    .grid-2 {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(320px, 1fr));
      gap: 16px;
    }
    .metrics-grid {
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: 8px;
    }
    .metric-item {
      background: var(--bg-card);
      border: 1px solid var(--border);
      padding: 10px;
      border-radius: 8px;
    }
    .metric-label {
      font-size: 9px;
      color: var(--text-muted);
      text-transform: uppercase;
    }
    .metric-val {
      font-size: 13px;
      font-weight: bold;
      color: var(--text);
      margin-top: 2px;
    }
    .table-box {
      overflow-x: auto;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      text-align: left;
      font-size: 11px;
    }
    th {
      color: var(--text-muted);
      font-size: 9px;
      text-transform: uppercase;
      padding: 8px 10px;
      border-bottom: 1px solid var(--border);
    }
    td {
      padding: 10px;
      border-bottom: 1px solid var(--border);
    }
    .btn-action {
      background: var(--primary);
      color: #06090e;
      border: none;
      border-radius: 8px;
      padding: 10px 16px;
      font-weight: bold;
      font-size: 11px;
      cursor: pointer;
      font-family: inherit;
      box-shadow: 0 0 10px rgba(0,245,160,0.3);
    }
    .chip {
      background: var(--bg-card);
      border: 1px solid var(--border);
      color: var(--text-muted);
      padding: 3px 8px;
      border-radius: 6px;
      font-size: 10px;
      font-weight: bold;
    }
    .chip.active {
      background: var(--primary);
      color: #06090e;
      border-color: var(--primary);
    }
  </style>
</head>
<body>
  <div class="borrow-container">
    <!-- Header -->
    <div class="card header-bar">
      <div>
        <div style="color: var(--primary); font-size: 10px; font-weight: bold; letter-spacing: 0.1em;">AURELIS DEFI / BORROW DESK</div>
        <h1 style="font-size: 18px; font-weight: bold; margin-top: 2px;">Collateral-Backed Borrowing</h1>
        <p style="color: var(--text-muted); font-size: 11px; margin-top: 2px;">Plan loans with zero-custody risk and real-time liquidation simulation.</p>
      </div>
      <div class="badge">Standalone Isolated Mode</div>
    </div>

    <!-- 2 Column: Config & Metrics -->
    <div class="grid-2">
      <div class="card">
        <div style="font-weight: bold; font-size: 13px; border-bottom: 1px solid var(--border); padding-bottom: 8px;">
          Collateral Configuration
        </div>
        <div style="display: flex; gap: 8px;">
          <div style="flex: 1; background: var(--bg-card); padding: 10px; border-radius: 8px; border: 1px solid var(--border);">
            <div style="font-size: 9px; color: var(--text-muted);">COLLATERAL</div>
            <div style="font-size: 13px; font-weight: bold; color: var(--primary);">${params.collateralAmount} ${params.collateralAsset}</div>
            <div style="font-size: 10px; color: var(--text-muted);">$${params.collateralPrice.toLocaleString()} / unit</div>
          </div>
          <div style="flex: 1; background: var(--bg-card); padding: 10px; border-radius: 8px; border: 1px solid var(--border);">
            <div style="font-size: 9px; color: var(--text-muted);">DEBT ASSET</div>
            <div style="font-size: 13px; font-weight: bold; color: var(--accent);">${params.receiveAsset}</div>
            <div style="font-size: 10px; color: var(--text-muted);">${params.provider} · ${params.network}</div>
          </div>
        </div>
        <div style="font-size: 11px; color: #94A3B8; line-height: 1.5; background: #080d14; padding: 10px; border-radius: 8px; border: 1px solid var(--border);">
          💡 <strong>Aurelis Intelligence:</strong> Your collateral value is <strong>$${params.collateralValue.toLocaleString(undefined, { minimumFractionDigits: 2 })}</strong>. A safer payment target of 50% LTV gives you a <strong>${params.dropToLiquidation.toFixed(1)}% price drop buffer</strong> before liquidation risk.
        </div>
      </div>

      <div class="card">
        <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid var(--border); padding-bottom: 8px;">
          <div style="font-weight: bold; font-size: 13px;">Risk & Loan Math</div>
          <span class="badge" style="background: rgba(0,245,160,0.1); border-color: rgba(0,245,160,0.25);">HEALTHY</span>
        </div>
        <div class="metrics-grid">
          <div class="metric-item">
            <div class="metric-label">Collateral Value</div>
            <div class="metric-val">$${params.collateralValue.toLocaleString(undefined, { minimumFractionDigits: 2 })}</div>
          </div>
          <div class="metric-item">
            <div class="metric-label">Max Borrow Capacity</div>
            <div class="metric-val" style="color: var(--primary);">$${params.maxBorrow.toLocaleString(undefined, { minimumFractionDigits: 2 })}</div>
          </div>
          <div class="metric-item">
            <div class="metric-label">Borrow Rate</div>
            <div class="metric-val" style="color: var(--accent);">${params.borrowApr.toFixed(2)}% APY</div>
          </div>
          <div class="metric-item">
            <div class="metric-label">Est. Interest / Mo</div>
            <div class="metric-val" style="color: var(--warning);">$${params.monthlyInterest.toFixed(2)} / mo</div>
          </div>
          <div class="metric-item">
            <div class="metric-label">Safer Borrow Target</div>
            <div class="metric-val">$${params.saferBorrow.toLocaleString(undefined, { minimumFractionDigits: 2 })}</div>
          </div>
          <div class="metric-item">
            <div class="metric-label">Liquidation Level</div>
            <div class="metric-val" style="color: var(--error);">$${params.liquidationPrice.toLocaleString(undefined, { minimumFractionDigits: 2 })} (-${params.dropToLiquidation.toFixed(1)}%)</div>
          </div>
        </div>
      </div>
    </div>

    <!-- Live Market Table -->
    <div class="card">
      <div style="font-weight: bold; font-size: 13px;">Live Protocol Markets</div>
      <div class="table-box">
        <table>
          <thead>
            <tr>
              <th>Provider</th>
              <th>Route</th>
              <th>Borrow APY</th>
              <th>Max LTV</th>
              <th>Liq. Threshold</th>
              <th>Custody</th>
            </tr>
          </thead>
          <tbody>
            <tr style="background: rgba(0,245,160,0.06);">
              <td><strong>Morpho Blue</strong> <span style="font-size: 9px; color: var(--text-muted);">(Base)</span></td>
              <td style="color: var(--accent); font-weight: bold;">ETH → USDC</td>
              <td style="color: var(--primary); font-weight: bold;">3.94%</td>
              <td>86%</td>
              <td>88%</td>
              <td>Isolated Non-custodial Vault</td>
            </tr>
            <tr>
              <td><strong>Aave v3</strong> <span style="font-size: 9px; color: var(--text-muted);">(Ethereum)</span></td>
              <td style="color: var(--accent); font-weight: bold;">ETH → USDC</td>
              <td style="color: var(--primary); font-weight: bold;">4.82%</td>
              <td>80%</td>
              <td>82.5%</td>
              <td>Shared Liquidity Pool</td>
            </tr>
            <tr>
              <td><strong>Aave v3</strong> <span style="font-size: 9px; color: var(--text-muted);">(Arbitrum)</span></td>
              <td style="color: var(--accent); font-weight: bold;">BTC → USDC</td>
              <td style="color: var(--primary); font-weight: bold;">4.25%</td>
              <td>75%</td>
              <td>80%</td>
              <td>Shared Liquidity Pool</td>
            </tr>
            <tr>
              <td><strong>Morpho Blue</strong> <span style="font-size: 9px; color: var(--text-muted);">(Ethereum)</span></td>
              <td style="color: var(--accent); font-weight: bold;">stETH → USDC</td>
              <td style="color: var(--primary); font-weight: bold;">3.85%</td>
              <td>91.5%</td>
              <td>93%</td>
              <td>Yield-bearing Collateral</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <!-- Footer -->
    <div style="font-size: 10px; color: var(--text-muted); text-align: center; padding: 8px;">
      ⓘ Rates are variable and driven by live onchain utilization. Exported from Aurelis DeFi Terminal.
    </div>
  </div>
</body>
</html>`;
}

/**
 * Generate a Markdown report ready to share on Discord, Telegram, or Notion
 */
export function generateBorrowReportMarkdown(params: ExportBorrowParams): string {
  return `🏦 **AURELIS DEFI — BORROW & LOAN REPORT** 🏦
Collateral: **${params.collateralAmount} ${params.collateralAsset}** (~$${params.collateralValue.toLocaleString(undefined, { minimumFractionDigits: 2 })})
Debt Asset: **${params.receiveAsset}**
Selected Route: **${params.provider} (${params.network})**

📊 **Execution & Risk Metrics:**
• Collateral Spot Price: **$${params.collateralPrice.toLocaleString()}**
• Max Borrow Capacity (${params.maxLtv}% LTV): **$${params.maxBorrow.toLocaleString(undefined, { minimumFractionDigits: 2 })} ${params.receiveAsset}**
• Safer Borrow Target (50% LTV): **$${params.saferBorrow.toLocaleString(undefined, { minimumFractionDigits: 2 })} ${params.receiveAsset}**
• Borrow APY: **${params.borrowApr.toFixed(2)}%** (Variable)
• Projected Interest: **$${params.monthlyInterest.toFixed(2)} / month**
• Liquidation Level: **$${params.liquidationPrice.toLocaleString(undefined, { minimumFractionDigits: 2 })}** (-${params.dropToLiquidation.toFixed(1)}% price drop cushion)
• Liquidation Threshold: **${params.liquidationThreshold}%**

🛡️ **Collateral & Security:**
Non-custodial smart contract custody. Collateral is safely locked onchain and can be withdrawn at any time upon debt repayment.

_Generated by Aurelis HUD DeFi Terminal_`;
}

/**
 * Trigger browser file download
 */
export function downloadFile(content: string, filename: string, mimeType: string) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
