/**
 * ============================================================================
 * Old 300 Reconciliation Types
 * ============================================================================
 *
 * This file documents the canonical object shapes used throughout the
 * reconciliation engine.
 *
 * The reconciliation engine is intentionally read-only.
 * Nothing in this module performs database writes.
 */

/**
 * ParsedMember
 *
 * Represents a unique member row from the spreadsheet.
 *
 * {
 *   spreadsheetName: string,
 *   realName: string | null,
 *   email: string | null,
 *   phone: string | null,
 *   homeAo: string | null,
 *   proudPapaName: string | null,
 *   sourceRow: number
 * }
 */

/**
 * ParsedAttendance
 *
 * {
 *   memberName: string,
 *   isQ: boolean,
 *   isFng: boolean,
 *   sourceRow: number
 * }
 */

/**
 * ParsedSession
 *
 * {
 *   sessionKey: string,
 *   date: string,
 *   aoName: string,
 *   attendees: ParsedAttendance[],
 *   sourceColumn: number
 * }
 */

/**
 * ReconciliationWarning
 *
 * {
 *   severity: "info" | "warning" | "error",
 *   code: string,
 *   message: string,
 *   sourceRow?: number,
 *   sourceColumn?: number
 * }
 */

/**
 * ParsedSpreadsheet
 *
 * {
 *   members: ParsedMember[],
 *   sessions: ParsedSession[],
 *   warnings: ReconciliationWarning[]
 * }
 */