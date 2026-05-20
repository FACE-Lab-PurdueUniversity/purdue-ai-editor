/**
 * AI Usage Service
 * Handles fetching and calculating AI token usage and costs
 */

import { supabase } from './supabase';

const ET_TIMEZONE = 'America/New_York';
const DEFAULT_CAMPS_BUDGET = Number(import.meta.env.VITE_CAMPS_DAILY_BUDGET || 0.5);
const DEFAULT_STANDARD_BUDGET = Number(import.meta.env.VITE_STANDARD_DAILY_BUDGET || 0.125);

/**
 * Extract numeric value from app_config jsonb value
 */
function parseBudgetValue(val) {
  if (typeof val === 'number' && !Number.isNaN(val)) return val;
  if (typeof val === 'object' && val !== null && typeof val.value === 'number') return val.value;
  if (typeof val === 'string') return Number(val) || 0;
  return 0;
}

/**
 * Fetch budget limits from app_config table
 */
async function fetchBudgetConfig() {
  const { data, error } = await supabase
    .from('app_config')
    .select('key, value')
    .in('key', ['STANDARD_DAILY_BUDGET', 'CAMPS_DAILY_BUDGET']);

  if (error) {
    throw error;
  }

  const config = {
    STANDARD_DAILY_BUDGET: DEFAULT_STANDARD_BUDGET,
    CAMPS_DAILY_BUDGET: DEFAULT_CAMPS_BUDGET,
  };

  for (const row of data || []) {
    const num = parseBudgetValue(row.value);
    if (row.key === 'STANDARD_DAILY_BUDGET') config.STANDARD_DAILY_BUDGET = num;
    if (row.key === 'CAMPS_DAILY_BUDGET') config.CAMPS_DAILY_BUDGET = num;
  }

  return config;
}

/**
 * Parse timezone offset in minutes from short offset strings like GMT-5 or GMT-04:00
 */
function parseOffsetMinutes(offsetText) {
  const match = offsetText.match(/GMT([+-])(\d{1,2})(?::?(\d{2}))?/);
  if (!match) return -300;

  const sign = match[1] === '+' ? 1 : -1;
  const hours = Number(match[2] || 0);
  const minutes = Number(match[3] || 0);
  return sign * (hours * 60 + minutes);
}

/**
 * Get current Eastern date components
 */
function getEtDateParts(date = new Date()) {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: ET_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  const parts = formatter.formatToParts(date);
  const year = Number(parts.find((part) => part.type === 'year')?.value);
  const month = Number(parts.find((part) => part.type === 'month')?.value);
  const day = Number(parts.find((part) => part.type === 'day')?.value);
  return { year, month, day };
}

/**
 * Convert ET local date/time to UTC Date.
 * Uses a short iterative solve to ensure DST-safe conversion.
 */
function etLocalToUtc(year, month, day, hour = 0, minute = 0, second = 0) {
  const offsetFormatter = new Intl.DateTimeFormat('en-US', {
    timeZone: ET_TIMEZONE,
    timeZoneName: 'shortOffset',
  });

  let utcGuess = Date.UTC(year, month - 1, day, hour, minute, second);
  for (let i = 0; i < 3; i += 1) {
    const tzParts = offsetFormatter.formatToParts(new Date(utcGuess));
    const offsetText = tzParts.find((part) => part.type === 'timeZoneName')?.value || 'GMT-5';
    const offsetMinutes = parseOffsetMinutes(offsetText);
    utcGuess = Date.UTC(year, month - 1, day, hour, minute, second) - (offsetMinutes * 60 * 1000);
  }

  return new Date(utcGuess);
}

/**
 * Get start and end of current ET day in UTC.
 */
export function getDayBoundariesET() {
  const { year, month, day } = getEtDateParts();
  const dayStart = etLocalToUtc(year, month, day, 0, 0, 0);
  const nextLocalDate = new Date(Date.UTC(year, month - 1, day + 1));
  const dayEnd = etLocalToUtc(
    nextLocalDate.getUTCFullYear(),
    nextLocalDate.getUTCMonth() + 1,
    nextLocalDate.getUTCDate(),
    0,
    0,
    0,
  );

  return {
    dayStart,
    dayEnd,
  };
}

/**
 * Get next ET midnight countdown target.
 */
export function getNextDayET() {
  const { dayEnd } = getDayBoundariesET();
  return dayEnd;
}

/**
 * Get active user's daily spend in USD.
 */
export async function getDailySpend() {
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    throw new Error('User not authenticated');
  }

  const { dayStart, dayEnd } = getDayBoundariesET();

  const { data, error } = await supabase
    .from('ai_usage')
    .select('cost_usd')
    .eq('user_id', user.id)
    .gte('timestamp', dayStart.toISOString())
    .lt('timestamp', dayEnd.toISOString());

  if (error) {
    throw error;
  }

  return (data || []).reduce((sum, row) => sum + Number(row.cost_usd || 0), 0);
}

export async function getDailyBudgetLimit(accessLevel) {
  const config = await fetchBudgetConfig();
  return accessLevel === 'standard'
    ? config.STANDARD_DAILY_BUDGET
    : config.CAMPS_DAILY_BUDGET;
}

/**
 * Get daily budget usage summary.
 */
export async function getDailyBudgetUsage(accessLevel) {
  const spent = await getDailySpend();
  const limit = await getDailyBudgetLimit(accessLevel);
  const percentage = limit > 0 ? (spent / limit) * 100 : 0;

  return {
    spent,
    limit,
    percentage,
  };
}

/**
 * Get user's access level
 */
export async function getUserAccessLevel() {
  const { data: { user } } = await supabase.auth.getUser();
  
  if (!user) {
    throw new Error('User not authenticated');
  }
  
  return user.user_metadata?.access_level || 'standard';
}

/**
 * Format currency
 */
export function formatCurrency(amount) {
  return `$${amount.toFixed(4)}`;
}

/**
 * Format large numbers with commas
 */
export function formatNumber(num) {
  return num.toLocaleString();
}

