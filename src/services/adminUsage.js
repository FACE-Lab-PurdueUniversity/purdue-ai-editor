import { supabase } from './supabase';

const PAGE_SIZE = 1000;

function toIsoDateKey(date) {
  return date.toISOString().split('T')[0];
}

function startOfDayUtc(date) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), 0, 0, 0, 0));
}

function endOfDayUtc(date) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), 23, 59, 59, 999));
}

export function buildTimeRange({ preset, customStartDate, customEndDate }) {
  const now = new Date();

  if (preset === 'custom') {
    if (!customStartDate || !customEndDate) {
      throw new Error('Please select both start and end dates.');
    }

    const start = startOfDayUtc(new Date(customStartDate));
    const end = endOfDayUtc(new Date(customEndDate));

    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
      throw new Error('Invalid custom date range.');
    }

    if (start > end) {
      throw new Error('Start date must be before end date.');
    }

    return { start, end };
  }

  const days = preset === 'past_month' ? 30 : 7;
  const end = endOfDayUtc(now);
  const start = startOfDayUtc(new Date(end.getTime() - (days - 1) * 24 * 60 * 60 * 1000));
  return { start, end };
}

function buildEmptyDailySpend(start, end) {
  const dailySpend = [];
  const cursor = startOfDayUtc(start);
  const last = startOfDayUtc(end);

  while (cursor <= last) {
    dailySpend.push({
      date: toIsoDateKey(cursor),
      costUsd: 0,
    });
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }

  return dailySpend;
}

async function fetchAiUsageRows(startIso, endIso) {
  const rows = [];
  let page = 0;

  while (true) {
    const from = page * PAGE_SIZE;
    const to = from + PAGE_SIZE - 1;

    const { data, error } = await supabase
      .from('ai_usage')
      .select('user_id, timestamp, cost_usd')
      .gte('timestamp', startIso)
      .lte('timestamp', endIso)
      .order('timestamp', { ascending: true })
      .range(from, to);

    if (error) {
      throw new Error(`Failed to load usage rows: ${error.message}`);
    }

    rows.push(...data);
    if (data.length < PAGE_SIZE) {
      break;
    }

    page += 1;
  }

  return rows;
}

async function fetchEmailMap(userIds) {
  if (userIds.length === 0) {
    return new Map();
  }

  const { data, error } = await supabase
    .from('user_profiles')
    .select('user_id, email')
    .in('user_id', userIds);

  if (error) {
    throw new Error(`Failed to load user profiles: ${error.message}`);
  }

  return new Map(data.map((row) => [row.user_id, row.email || '']));
}

export async function fetchAdminUsageAnalytics(rangeInput) {
  const { start, end } = buildTimeRange(rangeInput);
  const startIso = start.toISOString();
  const endIso = end.toISOString();
  const usageRows = await fetchAiUsageRows(startIso, endIso);
  const dailySpend = buildEmptyDailySpend(start, end);
  const dailyIndex = new Map(dailySpend.map((row, index) => [row.date, index]));
  const byUser = new Map();
  let totalSpend = 0;

  for (const row of usageRows) {
    const cost = Number(row.cost_usd || 0);
    const date = toIsoDateKey(new Date(row.timestamp));

    totalSpend += cost;

    const dayPos = dailyIndex.get(date);
    if (dayPos !== undefined) {
      dailySpend[dayPos].costUsd += cost;
    }

    if (!byUser.has(row.user_id)) {
      byUser.set(row.user_id, {
        userId: row.user_id,
        llmCalls: 0,
        costUsd: 0,
      });
    }

    const user = byUser.get(row.user_id);
    user.llmCalls += 1;
    user.costUsd += cost;
  }

  const userIds = Array.from(byUser.keys());
  const emailMap = await fetchEmailMap(userIds);

  const users = Array.from(byUser.values())
    .map((user) => ({
      ...user,
      email: emailMap.get(user.userId) || '',
    }))
    .sort((a, b) => b.costUsd - a.costUsd);

  return {
    range: { startIso, endIso },
    totalSpendUsd: totalSpend,
    dailySpend,
    users,
  };
}

export function formatUsd(value) {
  return `$${Number(value || 0).toFixed(4)}`;
}
