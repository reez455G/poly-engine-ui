const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const Redis = require('ioredis');
const pm2 = require('pm2');
const { Pool } = require('pg');

const app = express();
const PORT = 4175;
const ENGINE_PATH = process.env.ENGINE_PATH || '/opt/poly-engine-trade-late-down';
const redis = new Redis(); // Connect to native redis

let questDbPool = null;
let questDbPoolKey = '';

const ASSET_TICKER_META = {
    btc: { label: 'BTC', binanceSymbol: 'BTCUSDT', coinbaseProduct: 'BTC-USD' },
    eth: { label: 'ETH', binanceSymbol: 'ETHUSDT', coinbaseProduct: 'ETH-USD' },
    xrp: { label: 'XRP', binanceSymbol: 'XRPUSDT', coinbaseProduct: 'XRP-USD' },
    sol: { label: 'SOL', binanceSymbol: 'SOLUSDT', coinbaseProduct: 'SOL-USD' },
    doge: { label: 'DOGE', binanceSymbol: 'DOGEUSDT', coinbaseProduct: 'DOGE-USD' },
    bnb: { label: 'BNB', binanceSymbol: 'BNBUSDT', coinbaseProduct: 'BNB-USD' }
};

app.use(cors());
app.use(bodyParser.json());

// PM2 connection
pm2.connect((err) => {
    if (err) {
        console.error("Failed to connect to PM2 daemon programmatically:", err);
    } else {
        console.log("Connected to PM2 daemon programmatically");
    }
});

// PM2 integration helpers
function pm2Start(processId, script, args, env, cwd, autorestart = true) {
    return new Promise((resolve, reject) => {
        pm2.start({
            script: script,
            name: processId,
            args: args,
            cwd: cwd,
            env: env,
            autorestart: autorestart,
            exec_mode: 'fork'
        }, (err, proc) => {
            if (err) {
                reject(err);
            } else {
                resolve(proc);
            }
        });
    });
}

function pm2Stop(processId) {
    return new Promise((resolve) => {
        pm2.stop(processId, (err) => {
            resolve();
        });
    });
}

function pm2Delete(processId) {
    return new Promise((resolve) => {
        pm2.delete(processId, (err) => {
            resolve();
        });
    });
}

function getStrategySpecificEngineEnv(strategy, options = {}) {
    const { tradeAmount, prod } = options;
    if (strategy === 'probabilistic-edge-btc-5m-c-no') {
        return {
            MARKET_WINDOW: '5m',
            ENABLE_CNO_SIM: 'true',
            CNO_EDGE_THRESHOLD: '0.00',
            CNO_MIN_DOWN_ASK: '0.85',
            CNO_MAX_ENTRY_REMAINING_SEC: '60'
        };
    }
    if (strategy === 'probabilistic-edge-btc-5m-b-yes') {
        return {
            MARKET_WINDOW: '5m',
            ENABLE_BYES_SIM: 'true',
            BYES_EDGE_THRESHOLD: '0.05',
            BYES_MAX_ENTRY_REMAINING_SEC: '60'
        };
    }
    if (strategy === 'probabilistic-edge-btc-5m') {
        const env = {
            MARKET_WINDOW: '5m',
            PROB_EDGE_A_ONLY_GATE: 'false'
        };
        if (tradeAmount !== undefined && tradeAmount !== null && tradeAmount !== '') {
            env.PROB_EDGE_SHARES = String(tradeAmount);
        }
        if (prod === true || prod === 'true') {
            env.ENABLE_RESEARCH_PROD = 'true';
        }
        return env;
    }
    return {};
}

function getPm2Statuses() {
    return new Promise((resolve) => {
        pm2.list((err, list) => {
            if (err) {
                console.error("Failed to list PM2 processes:", err);
                resolve({});
                return;
            }
            const statuses = {};
            list.forEach(proc => {
                if (proc.name) {
                    statuses[proc.name] = proc.pm2_env ? proc.pm2_env.status : 'unknown';
                }
            });
            resolve(statuses);
        });
    });
}

// In-memory cache for PM2 statuses to reduce CPU usage and latency
let cachedPm2Statuses = {};
let pm2CacheLoaded = false;

async function updatePm2StatusesCache() {
    try {
        cachedPm2Statuses = await getPm2Statuses();
        pm2CacheLoaded = true;
    } catch (e) {
        console.error("Error updating PM2 cache:", e);
    }
}

// Initial cache load and update every 2 seconds
updatePm2StatusesCache();
setInterval(updatePm2StatusesCache, 2000);

async function syncProcessesWithPm2() {
    try {
        if (!pm2CacheLoaded) {
            // Skip synchronization if PM2 statuses have not been loaded yet
            return;
        }
        const configs = await getPersistedConfigs();
        let changed = false;
        
        for (const processId of Object.keys(configs)) {
            const pm2Status = cachedPm2Statuses[processId];
            const config = configs[processId];
            
            // Prevent race condition: skip cleanup if configuration was created in the last 10 seconds
            const ageMs = Date.now() - (config?.startTime || 0);
            if (ageMs < 10000) continue;
            
            // If the process is not running (either stopped, errored, or deleted/not found in pm2 list)
            if (!pm2Status || pm2Status !== 'online') {
                console.log(`Process ${processId} is not online (status: ${pm2Status || 'not found'}). Cleaning up...`);
                
                const state = getLatestState(config.strategy, config.asset);
                
                // Save to session history
                await saveSession({
                    processId,
                    asset: config.asset,
                    strategy: config.strategy,
                    config,
                    stats: state ? {
                        pnl: state.sessionPnl,
                        trades: state.completedMarkets?.length,
                        hourlyPnl: state.hourlyPnl,
                        hourlyProfitTarget: state.hourlyProfitTarget || config.hourlyProfitTarget,
                        hourlyEntryPaused: state.hourlyEntryPaused,
                        hourlyResetAtMs: state.hourlyResetAtMs,
                        hourlyResetCount: state.hourlyResetCount || 0
                    } : null,
                    endTime: Date.now(),
                    exitCode: pm2Status === 'stopped' ? 0 : 1
                });
                
                // Remove from configs
                delete configs[processId];
                changed = true;
                
                // Delete from PM2 so it doesn't clutter the list
                await pm2Delete(processId);
            }
        }
        
        if (changed) {
            await savePersistedConfigs(configs);
            // Instantly refresh cache
            await updatePm2StatusesCache();
        }
    } catch (e) {
        console.error("Error in syncProcessesWithPm2:", e);
    }
}

// Run synchronization every 5 seconds
setInterval(syncProcessesWithPm2, 5000);

async function getPersistedConfigs() {
    const data = await redis.get('poly_active_configs');
    return data ? JSON.parse(data) : {};
}

async function savePersistedConfigs(configs) {
    await redis.set('poly_active_configs', JSON.stringify(configs));
}

async function saveSession(session) {
    const sessionsData = await redis.get('poly_sessions');
    let sessions = sessionsData ? JSON.parse(sessionsData) : [];
    sessions.unshift({ ...session, id: Date.now() });
    await redis.set('poly_sessions', JSON.stringify(sessions.slice(0, 100)));
}

function getLatestState(strategy, asset) {
    const stateDir = path.join(ENGINE_PATH, 'state');
    try {
        if (!fs.existsSync(stateDir)) return null;
        
        const possibleFiles = [];
        if (asset) {
            possibleFiles.push(`early-bird-${strategy}-${asset}.json`);
            possibleFiles.push(`early-bird-${strategy}-${asset}-prod.json`);
            if (asset === 'btc') {
                possibleFiles.push(`early-bird-${strategy}.json`);
                possibleFiles.push(`early-bird-${strategy}-prod.json`);
            }
        } else {
            possibleFiles.push(`early-bird-${strategy}.json`);
            possibleFiles.push(`early-bird-${strategy}-prod.json`);
        }

        const existingFiles = possibleFiles
            .filter(filename => fs.existsSync(path.join(stateDir, filename)))
            .map(filename => ({
                name: filename,
                time: fs.statSync(path.join(stateDir, filename)).mtime.getTime()
            }))
            .sort((a, b) => b.time - a.time);

        if (existingFiles.length === 0) return null;
        const content = fs.readFileSync(path.join(stateDir, existingFiles[0].name), 'utf8');
        return JSON.parse(content);
    } catch (e) {
        return null;
    }
}

const HUB_NOTIFY_URL = 'http://localhost:4176/api/notify';

async function sendHubNotification(title, message, type = 'info') {
    try {
        await fetch(HUB_NOTIFY_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ title, message, type })
        });
    } catch (e) {}
}

app.post('/api/start', async (req, res) => {
    const { balance, maxLoss, maxProfit, tradeAmount, strategy, tickers, rounds, tickerSources, hourlyProfitTarget, prod, extraEnv } = req.body;
    if (!tickers || tickers.length === 0) return res.status(400).json({ error: 'No tickers' });

    const configs = await getPersistedConfigs();
    const startedIds = [];

    for (const asset of tickers) {
        const processId = `${asset}-${strategy}`;
        if (cachedPm2Statuses[processId] === 'online') {
            configs[processId] = { ...req.body, asset, processId, startTime: configs[processId]?.startTime || Date.now() };
            startedIds.push(processId);
            continue;
        }

        const args = ['index.ts', '--strategy', strategy];
        if (rounds && rounds !== '0') args.push('--rounds', rounds);
        if (prod === true || prod === 'true') args.push('--prod');

        // Keep strategy processes supervised even when --rounds is finite.
        // A stray SIGTERM/SIGINT or transient process exit should not leave the
        // dashboard showing a stale/stopped session with no new entries.
        const autorestart = true;

        const env = { 
            ...getQuestDbEngineEnv(),
            MARKET_ASSET: asset, 
            TICKER: tickerSources || 'binance,chainlink,coinbase', 
            MAX_SESSION_LOSS: maxLoss, 
            MAX_SESSION_PROFIT: maxProfit, 
            HOURLY_PROFIT_TARGET: hourlyProfitTarget || '0', 
            WALLET_BALANCE: balance,
            UI_BALANCE: balance,
            UI_TRADE_AMOUNT: tradeAmount,
            ...(extraEnv && typeof extraEnv === 'object' ? extraEnv : {}),
            ENABLE_RESEARCH_TRADING: 'true',
            ALLOW_RESEARCH_ARTIFACT_TRADING: 'true',
            ...getStrategySpecificEngineEnv(strategy, { tradeAmount, prod })
        };
        if (prod === true || prod === 'true') {
            env.FORCE_PROD = "true";
        }

        try {
            await pm2Start(
                processId,
                '/home/efsatu/.bun/bin/bun',
                args,
                env,
                ENGINE_PATH,
                autorestart
            );
            
            configs[processId] = { ...req.body, asset, processId, startTime: Date.now() };
            // Pre-populate cache to prevent race conditions with sync loop
            cachedPm2Statuses[processId] = 'online';
            startedIds.push(processId);
        } catch (e) {
            console.error(`Failed to start ${processId} via PM2:`, e);
        }
    }

    await savePersistedConfigs(configs);
    res.json({ status: 'started', ids: startedIds });
});

app.post('/api/stop', async (req, res) => {
    const { processId } = req.body;
    if (processId) {
        await pm2Stop(processId);
    } else {
        const configs = await getPersistedConfigs();
        for (const pid of Object.keys(configs)) {
            await pm2Stop(pid);
        }
    }
    res.json({ status: 'stopping' });
});

app.post('/api/restart', async (req, res) => {
    const { processId } = req.body;
    if (!processId) return res.status(400).json({ error: 'processId is required' });

    const configs = await getPersistedConfigs();
    const config = configs[processId];
    if (!config) return res.status(404).json({ error: 'Process config not found' });

    const args = ['index.ts', '--strategy', config.strategy];
    if (config.rounds && config.rounds !== '0') args.push('--rounds', config.rounds);
    if (config.prod === true || config.prod === 'true') args.push('--prod');

    // Keep strategy processes supervised even when --rounds is finite.
    // This mitigates accidental SIGTERM/SIGINT interruptions: PM2 will bring
    // the strategy back up instead of silently leaving it stopped.
    const autorestart = true;

    const env = {
        ...getQuestDbEngineEnv(),
        MARKET_ASSET: config.asset,
        TICKER: config.tickerSources || 'binance,chainlink,coinbase',
        MAX_SESSION_LOSS: config.maxLoss,
        MAX_SESSION_PROFIT: config.maxProfit,
        HOURLY_PROFIT_TARGET: config.hourlyProfitTarget || '0',
        WALLET_BALANCE: config.balance,
        UI_BALANCE: config.balance,
        UI_TRADE_AMOUNT: config.tradeAmount,
        ...(config.extraEnv && typeof config.extraEnv === 'object' ? config.extraEnv : {}),
        ENABLE_RESEARCH_TRADING: 'true',
        ALLOW_RESEARCH_ARTIFACT_TRADING: 'true',
        ...getStrategySpecificEngineEnv(config.strategy, { tradeAmount: config.tradeAmount, prod: config.prod })
    };
    if (config.prod === true || config.prod === 'true') {
        env.FORCE_PROD = "true";
    }

    try {
        await pm2Stop(processId);
        await pm2Delete(processId);
        await pm2Start(
            processId,
            '/home/efsatu/.bun/bin/bun',
            args,
            env,
            ENGINE_PATH,
            autorestart
        );

        configs[processId] = { ...config, startTime: Date.now(), restartedAt: Date.now() };
        cachedPm2Statuses[processId] = 'online';
        await savePersistedConfigs(configs);
        await updatePm2StatusesCache();
        res.json({ status: 'restarted', id: processId });
    } catch (e) {
        console.error(`Failed to restart ${processId}:`, e);
        res.status(500).json({ error: 'Failed to restart process', details: e.message });
    }
});

app.get('/api/status', async (req, res) => {
    const status = {};
    const configs = await getPersistedConfigs();
    
    Object.keys(configs).forEach(processId => {
        const config = configs[processId];
        const state = getLatestState(config.strategy, config.asset);
        status[processId] = {
            isRunning: cachedPm2Statuses[processId] === 'online',
            config: config,
            state: state || null
        };
    });

    res.json(status);
});

app.get('/api/history', async (req, res) => {
    const data = await redis.get('poly_sessions');
    res.json(data ? JSON.parse(data) : []);
});

app.get('/api/analytics/pnl-by-strategy', async (req, res) => {
    const where = analyticsFilters(req.query);
    const limit = parseAnalyticsLimit(req.query.limit, 100, 500);
    const sql = `
        SELECT
          strategy,
          asset,
          sum(pnl) AS total_pnl,
          avg(pnl) AS avg_pnl,
          count() AS markets,
          sum(CASE WHEN pnl > 0 THEN 1 ELSE 0 END) AS wins,
          sum(CASE WHEN pnl <= 0 THEN 1 ELSE 0 END) AS losses
        FROM market_results
        WHERE ${where}
        GROUP BY strategy, asset
        ORDER BY total_pnl DESC
        LIMIT ${limit}`;
    return questDbQuery(res, sql);
});

app.get('/api/analytics/orderbook-spread', async (req, res) => {
    const where = analyticsFilters(req.query);
    const limit = parseAnalyticsLimit(req.query.limit, 500, 2000);
    const sql = `
        SELECT
          timestamp,
          asset,
          strategy,
          side,
          avg(spread) AS avg_spread,
          min(spread) AS min_spread,
          max(spread) AS max_spread,
          avg(bid_liquidity) AS avg_bid_liquidity,
          avg(ask_liquidity) AS avg_ask_liquidity
        FROM orderbook_snapshots
        WHERE ${where}
        SAMPLE BY 5m
        ORDER BY timestamp DESC
        LIMIT ${limit}`;
    return questDbQuery(res, sql);
});

app.get('/api/analytics/hourly-performance', async (req, res) => {
    const where = analyticsFilters(req.query);
    const limit = parseAnalyticsLimit(req.query.limit, 500, 2000);
    const sql = `
        SELECT
          hour(timestamp) AS hour,
          strategy,
          asset,
          sum(pnl) AS total_pnl,
          avg(pnl) AS avg_pnl,
          count() AS markets,
          sum(CASE WHEN pnl > 0 THEN 1 ELSE 0 END) AS wins
        FROM market_results
        WHERE ${where}
        GROUP BY hour, strategy, asset
        ORDER BY total_pnl DESC
        LIMIT ${limit}`;
    return questDbQuery(res, sql);
});

app.get('/api/analytics/strategy-decisions', async (req, res) => {
    const decision = String(req.query.decision || '').trim().toLowerCase().replace(/[^a-z0-9_-]/g, '');
    const whereParts = [analyticsFilters(req.query)];
    if (decision) whereParts.push(`decision = '${decision}'`);
    const limit = parseAnalyticsLimit(req.query.limit, 100, 1000);
    const sql = `
        SELECT
          strategy,
          asset,
          decision,
          side,
          reason,
          count() AS count,
          avg(confidence) AS avg_confidence,
          avg(gap) AS avg_gap,
          avg(atr) AS avg_atr
        FROM strategy_decisions
        WHERE ${whereParts.join(' AND ')}
        GROUP BY strategy, asset, decision, side, reason
        ORDER BY count DESC
        LIMIT ${limit}`;
    return questDbQuery(res, sql);
});

app.get('/api/analytics/skip-reasons', async (req, res) => {
    req.query.decision = 'skip';
    const where = `${analyticsFilters(req.query)} AND decision = 'skip'`;
    const limit = parseAnalyticsLimit(req.query.limit, 100, 1000);
    const sql = `
        SELECT
          strategy,
          asset,
          side,
          reason,
          count() AS count,
          avg(confidence) AS avg_confidence,
          avg(gap) AS avg_gap
        FROM strategy_decisions
        WHERE ${where}
        GROUP BY strategy, asset, side, reason
        ORDER BY count DESC
        LIMIT ${limit}`;
    return questDbQuery(res, sql);
});

app.get('/api/analytics/agy-market-analyses', async (req, res) => {
    const limit = parseAnalyticsLimit(req.query.limit, 100, 1000);
    const sql = `
        SELECT
          timestamp,
          slug,
          asset,
          result_side,
          binance_pred_1_15s,
          binance_pred_15_45s,
          binance_pred_45_60s,
          binance_pred_1m_5m,
          chainlink_pred_1_15s,
          chainlink_pred_15_45s,
          chainlink_pred_45_60s,
          chainlink_pred_1m_5m,
          is_correct_1_15s,
          is_correct_15_45s,
          is_correct_45_60s,
          is_correct_1m_5m,
          open_price,
          binance_correct_count,
          chainlink_correct_count,
          analysis_text
        FROM agy_market_analyses
        ORDER BY timestamp DESC
        LIMIT ${limit}`;
    return questDbQuery(res, sql);
});

function safeIsoDate(value) {
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return null;
    return d.toISOString();
}

function qdbLiteral(value) {
    return String(value).replace(/'/g, "''");
}

function num(value, fallback = 0) {
    const n = Number(value);
    return Number.isFinite(n) ? n : fallback;
}

function fmtUsd(value) {
    const n = num(value);
    return `${n >= 0 ? '+' : ''}${n.toFixed(4)} USDC`;
}

function fmtPct(value) {
    return `${num(value).toFixed(2)}%`;
}

function computeEquityStats(rows) {
    let equity = 0;
    let peak = 0;
    let maxDrawdown = 0;
    const equityCurve = [];
    for (const row of rows) {
        equity += num(row.pnl);
        peak = Math.max(peak, equity);
        maxDrawdown = Math.min(maxDrawdown, equity - peak);
        equityCurve.push({ timestamp: row.timestamp, slug: row.slug, pnl: num(row.pnl), equity: Number(equity.toFixed(4)) });
    }
    return { equity, maxDrawdown, equityCurve };
}

function simulateCapitalBacktest(markets, buyOrders, opts) {
    const costBySlug = new Map();
    for (const row of buyOrders) costBySlug.set(row.slug, Math.max(0, num(row.buy_cost)));

    let balance = Math.max(0, opts.initialBalance);
    const startBalance = balance;
    let peak = balance;
    let maxDrawdown = 0;
    let simulatedPnl = 0;
    let tradesTaken = 0;
    let skippedInsufficientBalance = 0;
    let stoppedReason = null;
    const curve = [];

    for (const row of markets) {
        if (stoppedReason) break;
        const actualPnl = num(row.pnl);
        const actualCost = costBySlug.get(row.slug) || Math.max(Math.abs(actualPnl), opts.tradeSize || 1);
        let stake = opts.tradeSize;
        if (opts.sizingMode === 'percent') stake = balance * (opts.tradeSize / 100);
        if (opts.sizingMode === 'actual') stake = actualCost;
        if (opts.compound && opts.sizingMode === 'fixed') stake = Math.min(opts.tradeSize, balance);
        stake = Math.max(0, stake);

        if (stake <= 0 || balance < stake) {
            skippedInsufficientBalance++;
            curve.push({ timestamp: row.timestamp, slug: row.slug, pnl: 0, balance: Number(balance.toFixed(4)), skipped: true });
            continue;
        }

        const scaledPnl = actualCost > 0 ? actualPnl * (stake / actualCost) : actualPnl;
        balance += scaledPnl;
        simulatedPnl += scaledPnl;
        tradesTaken++;
        peak = Math.max(peak, balance);
        maxDrawdown = Math.min(maxDrawdown, balance - peak);
        curve.push({ timestamp: row.timestamp, slug: row.slug, pnl: Number(scaledPnl.toFixed(4)), balance: Number(balance.toFixed(4)), skipped: false });

        if (opts.maxSessionLoss > 0 && startBalance - balance >= opts.maxSessionLoss) stoppedReason = 'max-session-loss';
        if (opts.maxSessionProfit > 0 && balance - startBalance >= opts.maxSessionProfit) stoppedReason = 'max-session-profit';
    }

    return {
        initialBalance: startBalance,
        endingBalance: balance,
        simulatedPnl,
        maxDrawdown,
        tradesTaken,
        skippedInsufficientBalance,
        stoppedReason,
        sizingMode: opts.sizingMode,
        tradeSize: opts.tradeSize,
        compound: !!opts.compound,
        equityCurve: curve.slice(-300),
    };
}

function buildBacktestReport({ params, summary, decisions, skipReasons, orderStats, spreadStats, configs, recentCandidates, equityStats }) {
    const lines = [];
    lines.push(`# QuestDB Backtest Summary`);
    lines.push(``);
    lines.push(`- **Strategy**: ${params.strategy}`);
    lines.push(`- **Asset**: ${params.asset}`);
    lines.push(`- **Window**: ${params.window}`);
    lines.push(`- **From**: ${params.from}`);
    lines.push(`- **To**: ${params.to}`);
    lines.push(``);
    lines.push(`## Metrics`);
    lines.push(`- **Strict PnL**: ${fmtUsd(summary.total_pnl)}`);
    lines.push(`- **Winrate**: ${fmtPct(summary.win_rate)} (Wins: ${summary.wins} / Losses: ${summary.losses})`);
    lines.push(`- **Total Markets Scanned**: ${summary.total_markets}`);
    lines.push(`- **Candidates Placed**: ${summary.entries}`);
    lines.push(`- **Strict Fills**: ${orderStats.filled_orders} / ${orderStats.total_orders}`);
    lines.push(`- **Resolved Strict Fills**: ${summary.non_zero_markets}`);
    lines.push(`- **Expectancy**: ${fmtUsd(summary.expectancy)}`);
    lines.push(`- **Profit Factor**: ${summary.profit_factor}`);
    lines.push(`- **Max Drawdown**: ${fmtUsd(equityStats.maxDrawdown)}`);
    lines.push(`- **Missed Winners**: ${summary.skips}`);
    lines.push(`- **False Entries**: ${summary.losses}`);
    lines.push(`- **Average Slippage**: n/a`);
    lines.push(`- **Order Fill Rate**: ${fmtPct(orderStats.fill_rate)}`);
    lines.push(`- **Average Spread**: ${spreadStats.avg_spread === null ? 'n/a' : Number(spreadStats.avg_spread).toFixed(4)}`);
    lines.push(``);
    lines.push(`## Decision Breakdown`);
    lines.push(`| Decision | Count | Avg Gap | Avg Confidence |`);
    lines.push(`|---|---:|---:|---:|`);
    for (const row of decisions) lines.push(`| ${row.decision} | ${row.count} | ${row.avg_gap ?? 'n/a'} | ${row.avg_confidence ?? 'n/a'} |`);
    lines.push(``);
    lines.push(`## Missed Winners Skip Reason Analysis`);
    lines.push(`| Skip Reason Filter | Count |`);
    lines.push(`|---|---:|`);
    for (const row of skipReasons) lines.push(`| ${row.reason} | ${row.count} |`);
    lines.push(``);
    lines.push(`## Recent Candidates Replay Details`);
    lines.push(`| Entry Time | Slug | Side | Ladder | Filled | Status | Outcome | PnL | Bid | Gap | Sec | Score |`);
    lines.push(`|---|---|---|---|---:|---|---|---:|---:|---:|---:|---:|`);
    for (const row of recentCandidates) lines.push(`| ${row.time} | ${row.slug} | ${row.side} | ${row.ladder} | ${row.filled} | ${row.status} | ${row.outcome} | ${row.pnl} | ${row.bid} | ${row.gap} | ${row.remain} | ${row.score} |`);
    lines.push(``);
    lines.push(`## Latest Config Snapshot`);
    lines.push('```json');
    lines.push(JSON.stringify(configs, null, 2));
    lines.push('```');
    return lines.join('\n');
}

app.post('/api/backtest/questdb', async (req, res) => {
    const { strategy, asset, window, from, to, initialBalance, tradeSize, sizingMode, maxSessionLoss, maxSessionProfit, compound } = req.body || {};
    if (!strategy || !asset || !window || !from || !to) {
        return res.status(400).json({ available: false, error: 'All parameters (strategy, asset, window, from, to) are required' });
    }

    const safeStrategy = String(strategy).replace(/[^a-zA-Z0-9_-]/g, '');
    const safeAsset = String(asset).toLowerCase().replace(/[^a-z0-9_-]/g, '');
    const safeWindow = String(window).replace(/[^a-zA-Z0-9_-]/g, '');
    const fromIso = safeIsoDate(from);
    const toIso = safeIsoDate(to);
    if (!fromIso || !toIso) return res.status(400).json({ available: false, error: 'Invalid from/to datetime' });

    const where = `timestamp BETWEEN '${qdbLiteral(fromIso)}' AND '${qdbLiteral(toIso)}' AND strategy = '${qdbLiteral(safeStrategy)}' AND asset = '${qdbLiteral(safeAsset)}' AND slug LIKE '%-${qdbLiteral(safeWindow)}-%'`;

    try {
        const pool = getQuestDbPool();
        const [summaryRes, equityRes, buyOrdersRes, decisionRes, skipRes, orderRes, spreadRes, configRes, decisionCandidateRes, candidateResultRes, candidateOrderRes, candidateIntentRes] = await Promise.all([
            pool.query(`
                SELECT
                  count() AS total_markets,
                  sum(pnl) AS total_pnl,
                  avg(pnl) AS expectancy,
                  sum(CASE WHEN pnl > 0 THEN 1 ELSE 0 END) AS wins,
                  sum(CASE WHEN pnl < 0 THEN 1 ELSE 0 END) AS losses,
                  sum(CASE WHEN pnl != 0 THEN 1 ELSE 0 END) AS non_zero_markets,
                  sum(CASE WHEN pnl > 0 THEN pnl ELSE 0 END) AS gross_profit,
                  -sum(CASE WHEN pnl < 0 THEN pnl ELSE 0 END) AS gross_loss
                FROM market_results
                WHERE ${where}`),
            pool.query(`SELECT timestamp, slug, pnl FROM market_results WHERE ${where} ORDER BY timestamp`),
            pool.query(`
                SELECT slug, sum(price * shares) AS buy_cost, sum(shares) AS buy_shares
                FROM orders
                WHERE ${where} AND action = 'buy' AND status = 'filled'
                GROUP BY slug`),
            pool.query(`
                SELECT decision, count() AS count, avg(gap) AS avg_gap, avg(confidence) AS avg_confidence
                FROM strategy_decisions
                WHERE ${where}
                GROUP BY decision
                ORDER BY count DESC`),
            pool.query(`
                SELECT reason, count() AS count, avg(gap) AS avg_gap, avg(confidence) AS avg_confidence
                FROM strategy_decisions
                WHERE ${where} AND decision = 'skip'
                GROUP BY reason
                ORDER BY count DESC
                LIMIT 20`),
            pool.query(`
                SELECT
                  count() AS total_orders,
                  sum(CASE WHEN status = 'filled' THEN 1 ELSE 0 END) AS filled_orders,
                  sum(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) AS failed_orders,
                  sum(CASE WHEN status = 'canceled' THEN 1 ELSE 0 END) AS canceled_orders
                FROM orders
                WHERE ${where}`),
            pool.query(`
                SELECT avg(spread) AS avg_spread, avg(bid_liquidity) AS avg_bid_liquidity, avg(ask_liquidity) AS avg_ask_liquidity
                FROM orderbook_snapshots
                WHERE ${where}`),
            pool.query(`SELECT * FROM strategy_config_snapshots WHERE ${where} ORDER BY timestamp DESC LIMIT 1`),
            pool.query(`
                SELECT timestamp, slug, decision, side, reason, gap, bid, ask, remaining_sec, confidence, regime
                FROM strategy_decisions
                WHERE ${where} AND decision IN ('enter', 'skip', 'exit', 'add', 'filled')
                ORDER BY timestamp DESC
                LIMIT 120`),
            pool.query(`
                SELECT timestamp, slug, result_side, pnl, trades
                FROM market_results
                WHERE ${where}
                ORDER BY timestamp DESC
                LIMIT 5000`),
            pool.query(`
                SELECT timestamp, slug, side, action, status, price, shares
                FROM orders
                WHERE ${where}
                ORDER BY timestamp DESC
                LIMIT 5000`),
            pool.query(`
                SELECT timestamp, slug, side, action, price, shares, order_type
                FROM order_intents
                WHERE ${where}
                ORDER BY timestamp DESC
                LIMIT 5000`)
        ]);

        const summary = summaryRes.rows[0] || {};
        const decisions = decisionRes.rows || [];
        const entries = decisions.filter(r => r.decision === 'enter').reduce((s, r) => s + num(r.count), 0);
        const skips = decisions.filter(r => r.decision === 'skip').reduce((s, r) => s + num(r.count), 0);
        const totalMarkets = num(summary.total_markets);
        const wins = num(summary.wins);
        const losses = num(summary.losses);
        const grossLoss = num(summary.gross_loss);
        const enrichedSummary = {
            total_markets: totalMarkets,
            total_pnl: num(summary.total_pnl),
            expectancy: num(summary.expectancy),
            wins,
            losses,
            non_zero_markets: num(summary.non_zero_markets),
            win_rate: totalMarkets > 0 ? (wins / totalMarkets) * 100 : 0,
            profit_factor: grossLoss > 0 ? (num(summary.gross_profit) / grossLoss).toFixed(2) : (num(summary.gross_profit) > 0 ? '∞' : '0.00'),
            entries,
            skips,
        };

        const orderStats = orderRes.rows[0] || {};
        const filledOrders = num(orderStats.filled_orders);
        const totalOrders = num(orderStats.total_orders);
        const enrichedOrderStats = {
            total_orders: totalOrders,
            filled_orders: filledOrders,
            failed_orders: num(orderStats.failed_orders),
            canceled_orders: num(orderStats.canceled_orders),
            fill_rate: totalOrders > 0 ? (filledOrders / totalOrders) * 100 : 0,
        };

        const spreadStats = spreadRes.rows[0] || {};
        const equityStats = computeEquityStats(equityRes.rows || []);
        const capital = simulateCapitalBacktest(equityRes.rows || [], buyOrdersRes.rows || [], {
            initialBalance: num(initialBalance, 100),
            tradeSize: num(tradeSize, 5),
            sizingMode: String(sizingMode || 'fixed'),
            maxSessionLoss: num(maxSessionLoss, 0),
            maxSessionProfit: num(maxSessionProfit, 0),
            compound: compound === true || compound === 'true',
        });
        const configRow = configRes.rows[0] || {};
        const configs = Object.fromEntries(Object.entries(configRow).filter(([k]) => k.startsWith('cfg_')).map(([k, v]) => [k.replace(/^cfg_/, ''), v]));
        const resultBySlug = new Map();
        for (const row of candidateResultRes.rows || []) {
            const cur = resultBySlug.get(row.slug) || { pnl: 0, outcome: 'UNKNOWN', trades: 0, timestamp: row.timestamp };
            cur.pnl += num(row.pnl);
            cur.trades += num(row.trades);
            if (row.result_side && row.result_side !== 'UNKNOWN') cur.outcome = row.result_side;
            resultBySlug.set(row.slug, cur);
        }

        const ordersBySlug = new Map();
        for (const row of candidateOrderRes.rows || []) {
            const cur = ordersBySlug.get(row.slug) || { filledShares: 0, orders: 0, statuses: new Set(), avgPriceNum: 0, avgPriceDen: 0 };
            cur.orders += 1;
            cur.statuses.add(row.status || 'unknown');
            if (row.status === 'filled') {
                const shares = num(row.shares);
                cur.filledShares += shares;
                cur.avgPriceNum += num(row.price) * shares;
                cur.avgPriceDen += shares;
            }
            ordersBySlug.set(row.slug, cur);
        }

        const intentsBySlug = new Map();
        for (const row of candidateIntentRes.rows || []) {
            if (!intentsBySlug.has(row.slug)) intentsBySlug.set(row.slug, row);
        }

        const seenCandidates = new Set();
        const recentCandidates = [];
        for (const row of decisionCandidateRes.rows || []) {
            const key = row.slug;
            if (seenCandidates.has(key)) continue;
            seenCandidates.add(key);
            const result = resultBySlug.get(row.slug) || {};
            const order = ordersBySlug.get(row.slug);
            const intent = intentsBySlug.get(row.slug);
            const avgFill = order?.avgPriceDen > 0 ? order.avgPriceNum / order.avgPriceDen : null;
            const status = row.decision === 'skip'
                ? `SKIP:${row.reason || 'unknown'}`
                : order
                  ? [...order.statuses].join(',')
                  : row.decision.toUpperCase();
            recentCandidates.push({
                time: row.timestamp ? new Date(row.timestamp).toLocaleString() : '—',
                slug: row.slug,
                side: row.side || intent?.side || result.outcome || 'UNKNOWN',
                ladder: intent ? `${intent.action || 'order'} ${Number(num(intent.shares)).toFixed(2)} @ ${Number(num(intent.price)).toFixed(2)}` : row.decision,
                filled: order ? Number(order.filledShares.toFixed(4)).toString() : '0',
                status,
                outcome: result.outcome || 'UNKNOWN',
                pnl: Number(num(result.pnl).toFixed(4)).toString(),
                bid: row.bid === null || row.bid === undefined ? (avgFill === null ? 'n/a' : avgFill.toFixed(2)) : Number(row.bid).toFixed(2),
                gap: row.gap === null || row.gap === undefined ? 'n/a' : Number(row.gap).toFixed(2),
                remain: row.remaining_sec === null || row.remaining_sec === undefined ? 'n/a' : Number(row.remaining_sec).toFixed(0),
                score: row.confidence === null || row.confidence === undefined ? (row.regime || 'n/a') : Number(row.confidence).toFixed(2),
            });
            if (recentCandidates.length >= 50) break;
        }

        if (recentCandidates.length === 0) {
            for (const row of candidateResultRes.rows || []) {
                if (recentCandidates.length >= 50) break;
                const result = resultBySlug.get(row.slug) || row;
                recentCandidates.push({
                    time: row.timestamp ? new Date(row.timestamp).toLocaleString() : '—',
                    slug: row.slug,
                    side: result.outcome || row.result_side || 'UNKNOWN',
                    ladder: 'market-result',
                    filled: row.trades ?? '0',
                    status: num(row.pnl) !== 0 ? 'RESOLVED' : 'NO_TRADE/FLAT',
                    outcome: result.outcome || row.result_side || 'UNKNOWN',
                    pnl: Number(num(result.pnl ?? row.pnl).toFixed(4)).toString(),
                    bid: 'n/a',
                    gap: 'n/a',
                    remain: 'n/a',
                    score: 'n/a',
                });
            }
        }

        const rawReport = buildBacktestReport({
            params: { strategy: safeStrategy, asset: safeAsset, window: safeWindow, from: fromIso, to: toIso },
            summary: enrichedSummary,
            decisions,
            skipReasons: skipRes.rows || [],
            orderStats: enrichedOrderStats,
            spreadStats,
            configs,
            recentCandidates,
            equityStats,
        });

        return res.json({
            available: true,
            mode: 'questdb-historical-analysis',
            pnl: fmtUsd(capital.simulatedPnl),
            historicalPnl: fmtUsd(enrichedSummary.total_pnl),
            endingBalance: `${capital.endingBalance.toFixed(2)} USDC`,
            capitalSim: capital,
            winRate: fmtPct(enrichedSummary.win_rate),
            wins: String(enrichedSummary.wins),
            losses: String(enrichedSummary.losses),
            totalMarkets: String(enrichedSummary.total_markets),
            candidates: String(enrichedSummary.entries),
            strictFills: String(enrichedOrderStats.filled_orders),
            resolvedFills: String(enrichedSummary.non_zero_markets),
            expectancy: fmtUsd(enrichedSummary.expectancy),
            profitFactor: enrichedSummary.profit_factor,
            maxDrawdown: fmtUsd(capital.maxDrawdown),
            missedWinners: String(enrichedSummary.skips),
            falseEntries: String(enrichedSummary.losses),
            averageSlippage: 'n/a',
            orderFillRate: fmtPct(enrichedOrderStats.fill_rate),
            averageSpread: spreadStats.avg_spread === null || spreadStats.avg_spread === undefined ? 'n/a' : Number(spreadStats.avg_spread).toFixed(4),
            avgBidLiquidity: spreadStats.avg_bid_liquidity === null || spreadStats.avg_bid_liquidity === undefined ? 'n/a' : Number(spreadStats.avg_bid_liquidity).toFixed(2),
            avgAskLiquidity: spreadStats.avg_ask_liquidity === null || spreadStats.avg_ask_liquidity === undefined ? 'n/a' : Number(spreadStats.avg_ask_liquidity).toFixed(2),
            skipReasons: (skipRes.rows || []).map(r => ({ reason: r.reason, count: String(r.count), avgGap: r.avg_gap, avgConfidence: r.avg_confidence })),
            decisionBreakdown: decisions,
            orderStats: enrichedOrderStats,
            configSnapshot: configs,
            equityCurve: equityStats.equityCurve.slice(-200),
            recentCandidates,
            rawReport,
            updatedAt: Date.now(),
        });
    } catch (e) {
        console.warn('[questdb] backtest query failed:', e.message);
        return res.json({ available: false, error: e.message || String(e) });
    }
});

async function fetchJsonWithTimeout(url, timeoutMs = 4000) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
        const response = await fetch(url, { signal: controller.signal });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return await response.json();
    } finally {
        clearTimeout(timeout);
    }
}

app.get('/api/ticker-values', async (req, res) => {
    const requestedAssets = String(req.query.assets || 'btc')
        .split(',')
        .map((asset) => asset.trim().toLowerCase())
        .filter((asset) => ASSET_TICKER_META[asset]);
    const assets = requestedAssets.length ? [...new Set(requestedAssets)] : ['btc'];

    const rows = await Promise.all(assets.map(async (asset) => {
        const meta = ASSET_TICKER_META[asset];
        const row = {
            asset,
            label: meta.label,
            sources: {},
            spread: null,
            updatedAt: Date.now(),
            error: null
        };

        const [binanceResult, coinbaseResult] = await Promise.allSettled([
            fetchJsonWithTimeout(`https://api.binance.com/api/v3/ticker/price?symbol=${meta.binanceSymbol}`),
            fetchJsonWithTimeout(`https://api.exchange.coinbase.com/products/${meta.coinbaseProduct}/ticker`)
        ]);

        if (binanceResult.status === 'fulfilled') {
            const price = Number(binanceResult.value?.price);
            if (Number.isFinite(price)) row.sources.binance = price;
        }

        if (coinbaseResult.status === 'fulfilled') {
            const price = Number(coinbaseResult.value?.price);
            if (Number.isFinite(price)) row.sources.coinbase = price;
        }

        if (typeof row.sources.binance === 'number' && typeof row.sources.coinbase === 'number') {
            row.spread = Math.abs(row.sources.binance - row.sources.coinbase);
        }

        if (!Object.keys(row.sources).length) {
            row.error = 'No ticker source responded';
        }

        return row;
    }));

    res.json({ updatedAt: Date.now(), assets: rows });
});

app.get('/api/strategies', (req, res) => {
    try {
        const indexTsPath = path.join(ENGINE_PATH, 'engine/strategy/index.ts');
        if (fs.existsSync(indexTsPath)) {
            const content = fs.readFileSync(indexTsPath, 'utf8');
            const match = content.match(/export const strategies:\s*Record<string,\s*Strategy>\s*=\s*\{([\s\S]*?)\};/);
            if (match) {
                const keysBlock = match[1];
                const keys = [];
                const keyRegex = /"([^"]+)"|'([^']+)'|([a-zA-Z0-9_-]+)\s*:/g;
                let keyMatch;
                while ((keyMatch = keyRegex.exec(keysBlock)) !== null) {
                    const key = keyMatch[1] || keyMatch[2] || keyMatch[3];
                    if (key) keys.push(key);
                }
                return res.json(keys);
            }
        }
        // Fallback
        const settingsPath = path.join(ENGINE_PATH, 'config/strategy-settings.json');
        if (fs.existsSync(settingsPath)) {
            const data = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
            return res.json(Object.keys(data));
        }
        return res.json(['simulation']);
    } catch (e) {
        console.error(e);
        return res.status(500).json({ error: 'Failed to read strategies' });
    }
});

function getEnvConfig() {
    const envPath = path.join(ENGINE_PATH, '.env');
    if (!fs.existsSync(envPath)) return {};
    const content = fs.readFileSync(envPath, 'utf8');
    const config = {};
    content.split('\n').forEach(line => {
        const match = line.match(/^\s*([A-Za-z0-9_]+)\s*=\s*(.*)\s*$/);
        if (match) {
            let val = match[2].trim();
            if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
                val = val.substring(1, val.length - 1);
            }
            config[match[1]] = val;
        }
    });
    return config;
}

function getQuestDbEngineEnv() {
    const envConfig = getEnvConfig();
    const read = (key, fallback) => process.env[key] || envConfig[key] || fallback;
    return {
        QUESTDB_ENABLED: read('QUESTDB_ENABLED', 'true'),
        QUESTDB_HOST: read('QUESTDB_HOST', '127.0.0.1'),
        QUESTDB_ILP_PORT: read('QUESTDB_ILP_PORT', '9009'),
        QUESTDB_HTTP_URL: read('QUESTDB_HTTP_URL', 'http://127.0.0.1:9000'),
        QUESTDB_PG_HOST: read('QUESTDB_PG_HOST', read('QUESTDB_HOST', '127.0.0.1')),
        QUESTDB_PG_PORT: read('QUESTDB_PG_PORT', '8812'),
        QUESTDB_PG_USER: read('QUESTDB_PG_USER', 'admin'),
        QUESTDB_PG_PASSWORD: read('QUESTDB_PG_PASSWORD', 'quest'),
        QUESTDB_PG_DATABASE: read('QUESTDB_PG_DATABASE', 'qdb'),
        QUESTDB_MAX_QUEUE_SIZE: read('QUESTDB_MAX_QUEUE_SIZE', '5000'),
        QUESTDB_RECONNECT_DELAY_MS: read('QUESTDB_RECONNECT_DELAY_MS', '5000'),
        QUESTDB_ORDERBOOK_SAMPLE_MS: read('QUESTDB_ORDERBOOK_SAMPLE_MS', '5000')
    };
}

function getQuestDbPgConfig() {
    const envConfig = getEnvConfig();
    const read = (key, fallback) => process.env[key] || envConfig[key] || fallback;
    return {
        host: read('QUESTDB_PG_HOST', read('QUESTDB_HOST', '127.0.0.1')),
        port: Number(read('QUESTDB_PG_PORT', '8812')),
        user: read('QUESTDB_PG_USER', 'admin'),
        password: read('QUESTDB_PG_PASSWORD', 'quest'),
        database: read('QUESTDB_PG_DATABASE', 'qdb'),
        connectionTimeoutMillis: Number(read('QUESTDB_PG_TIMEOUT_MS', '2000')),
        statement_timeout: Number(read('QUESTDB_PG_STATEMENT_TIMEOUT_MS', '5000')),
        idleTimeoutMillis: 10000,
        max: 3
    };
}

function getQuestDbPool() {
    const config = getQuestDbPgConfig();
    const key = JSON.stringify({ host: config.host, port: config.port, user: config.user, database: config.database });
    if (!questDbPool || questDbPoolKey !== key) {
        if (questDbPool) questDbPool.end().catch(() => {});
        questDbPool = new Pool(config);
        questDbPoolKey = key;
        questDbPool.on('error', (err) => console.warn('[questdb] PG pool error:', err.message));
    }
    return questDbPool;
}

function parseAnalyticsLimit(value, fallback = 100, max = 1000) {
    const parsed = Number(value);
    if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
    return Math.min(Math.floor(parsed), max);
}

function parseAnalyticsWindow(value, fallback = '7d') {
    const raw = String(value || fallback).trim().toLowerCase();
    const match = raw.match(/^(\d+)([hdw])$/);
    if (!match) return fallback;
    return raw;
}

function questDbDateFilter(window) {
    const match = parseAnalyticsWindow(window).match(/^(\d+)([hdw])$/);
    const amount = match ? Number(match[1]) : 7;
    const unit = match ? match[2] : 'd';
    return `timestamp > dateadd('${unit}', -${amount}, now())`;
}

function analyticsFilters(query, alias = '') {
    const prefix = alias ? `${alias}.` : '';
    const filters = [questDbDateFilter(query.window)];
    const safeAsset = String(query.asset || '').trim().toLowerCase().replace(/[^a-z0-9_-]/g, '');
    const safeStrategy = String(query.strategy || '').trim().replace(/[^a-zA-Z0-9_-]/g, '');
    if (safeAsset) filters.push(`${prefix}asset = '${safeAsset}'`);
    if (safeStrategy) filters.push(`${prefix}strategy = '${safeStrategy}'`);
    return filters.join(' AND ');
}

function sendQuestDbUnavailable(res, error) {
    return res.json({ available: false, error: error.message || String(error), rows: [] });
}

async function questDbQuery(res, sql, params = []) {
    try {
        const result = await getQuestDbPool().query(sql, params);
        return res.json({ available: true, rows: result.rows, updatedAt: Date.now() });
    } catch (e) {
        console.warn('[questdb] analytics query failed:', e.message);
        return sendQuestDbUnavailable(res, e);
    }
}

app.get('/api/wallet-balance', async (req, res) => {
    try {
        const envConfig = getEnvConfig();
        const funderAddress = envConfig.POLY_FUNDER_ADDRESS;
        if (!funderAddress) {
            return res.status(404).json({ error: 'POLY_FUNDER_ADDRESS not found in .env' });
        }
        
        const padAddress = (addr) => {
            const clean = addr.startsWith('0x') ? addr.substring(2) : addr;
            return clean.toLowerCase().padStart(64, '0');
        };
        
        const getBalance = async (tokenAddress, ownerAddress) => {
            const data = "0x70a08231" + padAddress(ownerAddress);
            const body = {
                jsonrpc: "2.0",
                id: 1,
                method: "eth_call",
                params: [
                    {
                        to: tokenAddress,
                        data: data
                    },
                    "latest"
                ]
            };
            const rpcRes = await fetch("https://polygon-bor-rpc.publicnode.com", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(body)
            });
            const json = await rpcRes.json();
            if (json.error) {
                throw new Error(json.error.message || JSON.stringify(json.error));
            }
            return Number(BigInt(json.result)) / 1000000;
        };

        const USDCE = "0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174";
        const PUSD = "0xC011a7E12a19f7B1f670d46F03B03f3342E82DFB";

        const [usdce, pusd] = await Promise.all([
            getBalance(USDCE, funderAddress),
            getBalance(PUSD, funderAddress)
        ]);

        return res.json({
            address: funderAddress,
            usdce,
            pusd,
            balance: usdce + pusd
        });
    } catch (e) {
        console.error(e);
        return res.status(500).json({ error: 'Failed to fetch wallet balance: ' + e.message });
    }
});

const SETTINGS_FILE_PATH = path.join(ENGINE_PATH, 'config/strategy-settings.json');

app.get('/api/settings', (req, res) => {
    try {
        if (fs.existsSync(SETTINGS_FILE_PATH)) {
            const data = fs.readFileSync(SETTINGS_FILE_PATH, 'utf8');
            return res.json(JSON.parse(data));
        }
        return res.status(404).json({ error: 'Settings file not found' });
    } catch (e) {
        console.error(e);
        return res.status(500).json({ error: 'Failed to read settings' });
    }
});

app.post('/api/settings', (req, res) => {
    try {
        const settings = req.body;
        if (typeof settings !== 'object' || settings === null) {
            return res.status(400).json({ error: 'Invalid settings body' });
        }
        const dir = path.dirname(SETTINGS_FILE_PATH);
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }
        fs.writeFileSync(SETTINGS_FILE_PATH, JSON.stringify(settings, null, 2), 'utf8');
        return res.json({ status: 'success', settings });
    } catch (e) {
        console.error(e);
        return res.status(500).json({ error: 'Failed to write settings' });
    }
});

app.get('/api/history-detail', (req, res) => {
    const stateDir = path.join(ENGINE_PATH, 'state');
    let allHistory = [];
    try {
        if (fs.existsSync(stateDir)) {
            const files = fs.readdirSync(stateDir).filter(f => f.endsWith('.json'));
            files.forEach(f => {
                try {
                    const content = JSON.parse(fs.readFileSync(path.join(stateDir, f), 'utf8'));
                    if (content.completedMarkets && Array.isArray(content.completedMarkets)) {
                        allHistory = allHistory.concat(content.completedMarkets.map(m => ({
                            ...m,
                            sourceFile: f,
                            strategyName: m.strategyName || content.strategyName || f.replace('early-bird-', '').replace('.json', '')
                        })));
                    }
                } catch(e) {}
            });
        }
        const marketTs = (slug) => {
            const match = String(slug || '').match(/-(\d{10})$/);
            return match ? Number(match[1]) : 0;
        };
        const scoreMarket = (m) => {
            const orders = Array.isArray(m.orderHistory) ? m.orderHistory.length : 0;
            const pnl = Number(m.pnl || 0);
            return (orders > 0 ? 10_000 : 0) + orders * 100 + (pnl !== 0 ? 10 : 0);
        };
        const deduped = new Map();
        for (const market of allHistory) {
            const key = `${market.sourceFile || ''}:${market.strategyName || ''}:${market.slug || ''}`;
            const current = deduped.get(key);
            if (!current || scoreMarket(market) >= scoreMarket(current)) {
                deduped.set(key, market);
            }
        }
        allHistory = [...deduped.values()];
        allHistory.sort((a, b) => marketTs(b.slug) - marketTs(a.slug) || String(b.slug || '').localeCompare(String(a.slug || '')));
        res.json(allHistory);
    } catch (e) {
        res.status(500).json({ error: 'Failed' });
    }
});

app.get('/api/logs/:strategy/:slug', (req, res) => {
    const { strategy, slug } = req.params;
    const safeStrategy = strategy.replace(/[^a-zA-Z0-9_-]/g, '');
    const safeSlug = slug.replace(/[^a-zA-Z0-9_-]/g, '');
    const logFilePath = path.join(ENGINE_PATH, 'logs', `${safeStrategy}-${safeSlug}.log`);
    
    try {
        if (fs.existsSync(logFilePath)) {
            const content = fs.readFileSync(logFilePath, 'utf8');
            return res.send(content);
        }
        return res.status(404).send('Log file not found');
    } catch (e) {
        console.error(e);
        return res.status(500).send('Failed to read log file');
    }
});

app.post('/api/reset-state', async (req, res) => {
    const { strategy, asset } = req.body;
    if (!strategy) {
        return res.status(400).json({ error: 'Strategy name is required' });
    }
    // Sanitize inputs to prevent command injection
    const safeStrategy = strategy.replace(/[^a-zA-Z0-9_-]/g, '');
    const safeAsset = asset ? asset.replace(/[^a-zA-Z0-9_-]/g, '') : '';
    
    // Spawn 'bun scripts/reset-state.ts --strategy <strategy>'
    const args = ['scripts/reset-state.ts', '--strategy', safeStrategy];
    
    const child = spawn('/home/efsatu/.bun/bin/bun', args, {
        cwd: ENGINE_PATH,
        env: { ...process.env, MARKET_ASSET: safeAsset }
    });
    
    let stdout = '';
    let stderr = '';
    
    child.stdout.on('data', (data) => {
        stdout += data.toString();
    });
    
    child.stderr.on('data', (data) => {
        stderr += data.toString();
    });
    
    child.on('close', (code) => {
        if (code === 0) {
            res.json({ status: 'success', stdout });
        } else {
            console.error(`Reset state failed for ${safeStrategy} (${safeAsset || 'all'}). code: ${code}, stderr: ${stderr}`);
            res.status(500).json({ error: 'Reset script failed', stderr, stdout });
        }
    });
});

app.post('/api/run-diagnostic', async (req, res) => {
    const { strategy, startTime, asset } = req.body;
    if (!strategy) {
        return res.status(400).json({ error: 'Strategy name is required' });
    }
    // Sanitize inputs to prevent command injection
    const safeStrategy = strategy.replace(/[^a-zA-Z0-9_-]/g, '');
    const safeAsset = asset ? asset.replace(/[^a-zA-Z0-9_-]/g, '') : '';
    
    // Output path relative to ENGINE_PATH
    // If startTime is provided, output to a session-specific filename, otherwise full
    const isSessionDiagnostic = !!startTime;
    const suffix = isSessionDiagnostic ? '_session' : '_full';
    const assetSuffix = safeAsset ? `_${safeAsset}` : '';
    const outFilename = `docs/reports/MARKET_REGIME_DIAGNOSTIC_${safeStrategy}${assetSuffix}${suffix}.md`;
    const outPath = path.join(ENGINE_PATH, outFilename);
    
    // Build arguments
    const args = ['scripts/market-regime-diagnostic.ts', '--strategy', safeStrategy];
    if (isSessionDiagnostic) {
        // Convert to ISO string
        try {
            const isoStart = new Date(Number(startTime)).toISOString();
            args.push('--start', isoStart);
        } catch (e) {
            console.error(`Invalid startTime: ${startTime}`, e);
        }
    }
    args.push('--out', outFilename);
    
    const child = spawn('/home/efsatu/.bun/bin/bun', args, {
        cwd: ENGINE_PATH,
        env: { ...process.env, MARKET_ASSET: safeAsset }
    });
    
    let stdout = '';
    let stderr = '';
    
    child.stdout.on('data', (data) => {
        stdout += data.toString();
    });
    
    child.stderr.on('data', (data) => {
        stderr += data.toString();
    });
    
    child.on('close', (code) => {
        if (code === 0) {
            try {
                if (fs.existsSync(outPath)) {
                    const report = fs.readFileSync(outPath, 'utf8');
                    res.json({ status: 'success', report, stdout });
                } else {
                    res.json({ status: 'success', report: 'Report file was generated but could not be read.', stdout });
                }
            } catch (e) {
                res.status(500).json({ error: 'Failed to read generated report', details: e.message, stdout });
            }
        } else {
            console.error(`Diagnostic failed for ${safeStrategy} (${safeAsset || 'all'}). code: ${code}, stderr: ${stderr}`);
            res.status(500).json({ error: 'Diagnostic script failed', stderr, stdout });
        }
    });
});

app.get('/api/trader-analysis/report', (req, res) => {
    const jsonPath = path.join(ENGINE_PATH, 'docs/reports/TRADER_WALLET_ANALYSIS_latest.json');
    const mdPath = path.join(ENGINE_PATH, 'docs/reports/TRADER_WALLET_ANALYSIS_latest.md');
    try {
        const report = fs.existsSync(jsonPath) ? JSON.parse(fs.readFileSync(jsonPath, 'utf8')) : null;
        const markdown = fs.existsSync(mdPath) ? fs.readFileSync(mdPath, 'utf8') : '';
        res.json({ available: !!report, report, markdown, updatedAt: report?.generatedAt || null });
    } catch (e) {
        res.status(500).json({ available: false, error: e.message });
    }
});

function pidStatus(pidFile) {
    try {
        if (!fs.existsSync(pidFile)) return 'not_found';
        const pid = Number(fs.readFileSync(pidFile, 'utf8').trim());
        if (!Number.isFinite(pid)) return 'invalid_pid';
        try {
            process.kill(pid, 0);
            return 'online';
        } catch {
            return 'stopped';
        }
    } catch {
        return 'unknown';
    }
}

app.get('/api/trader-analysis/status', async (req, res) => {
    const statuses = cachedPm2Statuses || {};
    res.json({
        collector: statuses['trader-wallet-collector'] || pidStatus(path.join(ENGINE_PATH, 'state/trader-wallet-collector.pid')),
        heartbeat: statuses['trader-analysis-heartbeat'] || pidStatus(path.join(ENGINE_PATH, 'state/trader-analysis-heartbeat.pid')),
        updatedAt: Date.now()
    });
});

app.post('/api/backtest', async (req, res) => {
    const { strategy, asset, window, from, to } = req.body;
    if (!strategy || !asset || !window || !from || !to) {
        return res.status(400).json({ error: 'All parameters (strategy, asset, window, from, to) are required' });
    }

    const safeStrategy = strategy.replace(/[^a-zA-Z0-9_-]/g, '');
    const safeAsset = asset.replace(/[^a-zA-Z0-9_-]/g, '');
    const safeWindow = window.replace(/[^a-zA-Z0-9_-]/g, '');

    const reportFilename = `docs/reports/BACKTEST_${safeStrategy}_${safeAsset}_${Date.now()}.md`;
    const reportPath = path.join(ENGINE_PATH, reportFilename);

    const args = [
        'scripts/backtest-from-questdb.ts',
        '--strategy', safeStrategy,
        '--asset', safeAsset,
        '--window', safeWindow,
        '--from', from,
        '--to', to,
        '--out', reportFilename
    ];

    const child = spawn('/home/efsatu/.bun/bin/bun', args, {
        cwd: ENGINE_PATH,
        env: { ...process.env }
    });

    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (data) => { stdout += data.toString(); });
    child.stderr.on('data', (data) => { stderr += data.toString(); });

    child.on('close', (code) => {
        if (code !== 0) {
            console.error(`Backtest run failed. code: ${code}, stderr: ${stderr}`);
            return res.status(500).json({ error: 'Backtest runner failed', stderr, stdout });
        }

        try {
            if (!fs.existsSync(reportPath)) {
                return res.status(500).json({ error: 'Report file was not generated', stdout, stderr });
            }

            const report = fs.readFileSync(reportPath, 'utf8');

            try { fs.unlinkSync(reportPath); } catch (e) {}

            const parseMetric = (name) => {
                const regex = new RegExp(`-\\s+\\*\\*${name}\\*\\*:\\s*([^\\n]+)`, 'i');
                const match = report.match(regex);
                return match ? match[1].trim() : 'n/a';
            };

            const pnl = parseMetric('Strict PnL');
            const winRateStr = parseMetric('Winrate');
            const totalMarkets = parseMetric('Total Markets Scanned');
            const candidates = parseMetric('Candidates Placed');
            const strictFills = parseMetric('Strict Fills');
            const resolvedFills = parseMetric('Resolved Strict Fills');
            const expectancy = parseMetric('Expectancy');
            const profitFactor = parseMetric('Profit Factor');
            const maxDrawdown = parseMetric('Max Drawdown');
            const missedWinners = parseMetric('Missed Winners');
            const falseEntries = parseMetric('False Entries');
            const averageSlippage = parseMetric('Average Slippage');

            let wins = '0';
            let losses = '0';
            const winratePctMatch = winRateStr.match(/^([\d.]+%)/);
            const winratePct = winratePctMatch ? winratePctMatch[1] : '0.0%';
            const winsLossesMatch = winRateStr.match(/Wins:\s*(\d+)\s*\/\s*Losses:\s*(\d+)/i);
            if (winsLossesMatch) {
                wins = winsLossesMatch[1];
                losses = winsLossesMatch[2];
            }

            const skipReasonRows = [];
            const skipTableMatch = report.match(/## Missed Winners Skip Reason Analysis\r?\n\|[^\r\n]+\r?\n\|[^\r\n]+\r?\n([\s\S]*?)(?=\r?\n##|\r?\n\r?\n##|\r?\n$)/);
            if (skipTableMatch && skipTableMatch[1]) {
                const lines = skipTableMatch[1].split(/\r?\n/).filter(Boolean);
                for (const line of lines) {
                    if (line.includes('| ---') || line.includes('Skip Reason Filter')) continue;
                    const parts = line.split('|').map(p => p.trim()).filter(p => p !== '');
                    if (parts.length >= 2) {
                        skipReasonRows.push({ reason: parts[0], count: parts[1] });
                    }
                }
            }

            const candidatesRows = [];
            const candTableMatch = report.match(/## Recent Candidates Replay Details\r?\n\|[^\r\n]+\r?\n\|[^\r\n]+\r?\n([\s\S]*?)(?=\r?\n##|\r?\n\r?\n##|\r?\n$)/);
            if (candTableMatch && candTableMatch[1]) {
                const lines = candTableMatch[1].split(/\r?\n/).filter(Boolean);
                for (const line of lines) {
                    if (line.includes('| ---') || line.includes('Entry Time')) continue;
                    const parts = line.split('|').map(p => p.trim()).filter(p => p !== '');
                    if (parts.length >= 12) {
                        candidatesRows.push({
                            time: parts[0],
                            slug: parts[1],
                            side: parts[2],
                            ladder: parts[3],
                            filled: parts[4],
                            status: parts[5],
                            outcome: parts[6],
                            pnl: parts[7],
                            bid: parts[8],
                            gap: parts[9],
                            remain: parts[10],
                            score: parts[11]
                        });
                    }
                }
            }

            res.json({
                pnl,
                winRate: winratePct,
                wins,
                losses,
                totalMarkets,
                candidates,
                strictFills,
                resolvedFills,
                expectancy,
                profitFactor,
                maxDrawdown,
                missedWinners,
                falseEntries,
                averageSlippage,
                skipReasons: skipReasonRows,
                recentCandidates: candidatesRows,
                rawReport: report
            });

        } catch (e) {
            console.error('Error parsing backtest report:', e);
            res.status(500).json({ error: 'Failed to parse backtest report', details: e.message });
        }
    });
});

app.get('/api/changelog', (req, res) => {
    const changelogPath = path.join(__dirname, 'strategy-changelog.json');
    try {
        if (fs.existsSync(changelogPath)) {
            const data = fs.readFileSync(changelogPath, 'utf8');
            return res.json(JSON.parse(data));
        }
        return res.status(404).json({ error: 'Changelog file not found' });
    } catch (e) {
        console.error(e);
        return res.status(500).json({ error: 'Failed to read changelog' });
    }
});

app.listen(PORT, '0.0.0.0', () => {
    console.log(`Poly Engine Controller v3.0 (Redis Backend) running on http://0.0.0.0:${PORT}`);
});
