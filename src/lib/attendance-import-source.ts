/** Imported spreadsheet rows are school records, never crew-verified bus events. */
export const isImportedAttendance=(item:{dedupeKey?:string|null})=>item.dedupeKey?.startsWith('attendance-import:')===true

export const crewAttendanceFilter={dedupeKey:{not:{startsWith:'attendance-import:'}}} as const
