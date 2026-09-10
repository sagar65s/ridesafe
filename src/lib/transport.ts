export const ACTIVE_TRIP_STATUSES = ['DRIVER_STARTED_ROUTE', 'BUS_EN_ROUTE']
export const crewWhere = (id: string) => ({ OR: [{ driverId: id }, { maintainerId: id }] })
export function distanceKm(a: { latitude: number; longitude: number }, b: { latitude: number; longitude: number }) {
  const radians = Math.PI / 180
  const dLat = (b.latitude - a.latitude) * radians, dLng = (b.longitude - a.longitude) * radians
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.latitude * radians) * Math.cos(b.latitude * radians) * Math.sin(dLng / 2) ** 2
  return 6371 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(Math.max(0, 1 - h)))
}
export function nextAttendanceAction(actions: string[]) {
  if (actions.includes('ABSENT') || actions.includes('DROPPED_OFF')) return null
  return actions.includes('PICKED_UP') ? 'DROPPED_OFF' : 'PICKED_UP'
}
