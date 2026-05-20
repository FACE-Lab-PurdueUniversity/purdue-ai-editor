import JSZip from 'jszip';
import { supabase } from './supabase';

const PAGE_SIZE = 1000;
const TIME_COLUMN_BY_TABLE = {
  sessions: 'start_time',
  conversations: 'start_time',
  user_profiles: 'created_at',
};

function getTimeColumn(table) {
  return TIME_COLUMN_BY_TABLE[table] || 'timestamp';
}

export function normalizeTableName(name) {
  return name.toLowerCase().replace(/ /g, '_');
}

export async function resolveUserIdsByEmails(emails) {
  if (!emails || emails.length === 0) {
    return null;
  }

  const normalizedEmails = [...new Set(emails.map((email) => email.toLowerCase()))];
  const { data, error } = await supabase
    .from('user_profiles')
    .select('user_id, email')
    .in('email', normalizedEmails);

  if (error) {
    throw new Error(`Failed to resolve emails: ${error.message}`);
  }

  return data.map((row) => row.user_id);
}

function formatCsvCell(value) {
  if (value === null || value === undefined) {
    return '';
  }

  const text = typeof value === 'object' ? JSON.stringify(value) : String(value);
  return `"${text.replace(/"/g, '""')}"`;
}

export function convertRowsToCsv(rows, columns) {
  const header = columns.map(formatCsvCell).join(',');
  const lines = rows.map((row) => columns.map((column) => formatCsvCell(row[column])).join(','));
  return [header, ...lines].join('\n');
}

function buildBaseQuery({ table, columns, startIso, endIso, userIds }) {
  const timeColumn = getTimeColumn(table);
  let query = supabase
    .from(table)
    .select(columns.join(','))
    .order(timeColumn, { ascending: true, nullsFirst: false });

  if (startIso) {
    query = query.gte(timeColumn, startIso);
  }

  if (endIso) {
    query = query.lte(timeColumn, endIso);
  }

  if (userIds && userIds.length > 0) {
    query = query.in('user_id', userIds);
  }

  return query;
}

export async function fetchAllRowsForExport({
  table,
  columns,
  startTime,
  endTime,
  emails,
}) {
  const startIso = startTime ? new Date(startTime).toISOString() : null;
  const endIso = endTime ? new Date(endTime).toISOString() : null;
  const userIds = await resolveUserIdsByEmails(emails);

  if (Array.isArray(userIds) && userIds.length === 0) {
    return [];
  }

  const allRows = [];
  let page = 0;

  while (true) {
    const from = page * PAGE_SIZE;
    const to = from + PAGE_SIZE - 1;
    const query = buildBaseQuery({ table, columns, startIso, endIso, userIds }).range(from, to);
    const { data, error } = await query;

    if (error) {
      throw new Error(`Failed to fetch ${table}: ${error.message}`);
    }

    allRows.push(...data);
    if (data.length < PAGE_SIZE) {
      break;
    }

    page += 1;
  }

  return allRows;
}

export function downloadCsvFile(csvText, fileName) {
  const blob = new Blob([csvText], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

function downloadBlob(blob, fileName) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export async function exportAllTablesAsZip({
  tables,
  startTime,
  endTime,
  emails,
  zipFileName,
}) {
  const zip = new JSZip();
  const summary = [];

  for (const { tableName, columns } of tables) {
    const table = normalizeTableName(tableName);
    const columnKeys = columns.map((c) => c.key);
    const rows = await fetchAllRowsForExport({
      table,
      columns: columnKeys,
      startTime,
      endTime,
      emails,
    });

    const csvText = convertRowsToCsv(rows, columnKeys);
    zip.file(`${normalizeTableName(tableName)}.csv`, csvText);
    summary.push({ tableName, rowCount: rows.length });
  }

  const blob = await zip.generateAsync({ type: 'blob' });
  downloadBlob(blob, zipFileName);

  return summary;
}
