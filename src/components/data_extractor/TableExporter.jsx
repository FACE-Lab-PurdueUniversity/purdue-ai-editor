import { useState } from 'react';
import {
  normalizeTableName,
  fetchAllRowsForExport,
  convertRowsToCsv,
  downloadCsvFile,
} from '../../services/dataExport';
import './TableExporter.css';

/**
 * TableExporter Component
 * Reusable component for configuring and exporting table data
 *
 * @param {string} tableName - Display name of the table being exported
 * @param {Array} columns - Array of column definitions: { key, label, default }
 * @param {string} startTime - Start time filter value (from parent)
 * @param {string} endTime - End time filter value (from parent)
 * @param {Array} emails - Parsed email list (from parent)
 */
function TableExporter({
  tableName,
  columns,
  startTime,
  endTime,
  emails,
}) {
  // Internal state for this table's column selection
  const [selectedColumns, setSelectedColumns] = useState(
    columns.filter(c => c.default).map(c => c.key)
  );

  // Export states
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState(null);
  const [exportResult, setExportResult] = useState(null);

  const toggleColumn = (columnKey) => {
    setSelectedColumns(prev =>
      prev.includes(columnKey)
        ? prev.filter(key => key !== columnKey)
        : [...prev, columnKey]
    );
  };

  const selectAllColumns = () => setSelectedColumns(columns.map(c => c.key));
  const selectDefaultColumns = () => setSelectedColumns(columns.filter(c => c.default).map(c => c.key));

  const handleExport = async () => {
    setExporting(true);
    setError(null);
    setExportResult(null);

    try {
      const table = normalizeTableName(tableName);
      const rows = await fetchAllRowsForExport({
        table,
        columns: selectedColumns,
        startTime,
        endTime,
        emails,
      });

      const csvText = convertRowsToCsv(rows, selectedColumns);
      downloadCsvFile(
        csvText,
        `${tableName.toLowerCase()}_export_${new Date().toISOString().split('T')[0]}.csv`
      );

      setExportResult({
        success: true,
        rowCount: rows.length,
      });
    } catch (err) {
      setError(`Export failed: ${err.message}`);
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="table-exporter">
      <h2 className="table-exporter-title">{tableName}</h2>

      {error && (
        <div className="admin-error-banner table-exporter-banner">
          {error}
        </div>
      )}

      {exportResult?.success && (
        <div className="admin-success-banner table-exporter-banner">
          Successfully exported {exportResult.rowCount} rows
        </div>
      )}

      <div className="admin-card">
        <div className="table-exporter-columns-header">
          <h3 className="admin-section-title">Columns</h3>
          <div className="table-exporter-column-actions">
            <button
              type="button"
              onClick={selectAllColumns}
              className="admin-text-button"
            >
              All
            </button>
            <span>|</span>
            <button
              type="button"
              onClick={selectDefaultColumns}
              className="admin-text-button"
            >
              Default
            </button>
          </div>
        </div>

        <div className="table-exporter-pills">
          {columns.map((col) => (
            <button
              key={col.key}
              type="button"
              onClick={() => toggleColumn(col.key)}
              className={`column-pill ${selectedColumns.includes(col.key) ? 'selected' : ''}`}
            >
              {col.label}
            </button>
          ))}
        </div>

        <div className="table-exporter-footer">
          <div className="table-exporter-count">
            {selectedColumns.length} column{selectedColumns.length !== 1 ? 's' : ''} selected
          </div>

          <button
            type="button"
            onClick={handleExport}
            disabled={exporting || selectedColumns.length === 0}
            className="table-exporter-export-btn"
          >
            {exporting ? (
              <span className="table-exporter-export-content">
                <svg className="spinner" width="16" height="16" viewBox="0 0 24 24">
                  <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" opacity="0.25" />
                  <path fill="currentColor" opacity="0.75" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
                Exporting...
              </span>
            ) : (
              'Export to CSV'
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

export default TableExporter;
