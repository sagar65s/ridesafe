/** Archive storage is optional while a production database waits for its
 * committed migration. A missing archive must not hide real driver trips. */
export const ARCHIVE_MIGRATION_ERROR = 'Historical attendance uploads need a database update. Set DIRECT_URL to the same Neon database’s direct/unpooled URL, run npm run db:migrate, confirm npm run db:status has no pending migrations, then try again.'

export function isArchiveTableMissing(error:unknown):boolean {
  if(!error||typeof error!=='object')return false
  const details=error as {code?:unknown;meta?:{table?:unknown;modelName?:unknown};message?:unknown}
  return details.code==='P2021'&&[
    details.meta?.table,details.meta?.modelName,details.message,
  ].some(value=>typeof value==='string'&&value.includes('AttendanceImportRecord'))
}
