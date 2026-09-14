export const ACTIVE_TRIP_STATUSES = ['DRIVER_STARTED_ROUTE', 'BUS_EN_ROUTE']
export const SERVICE_TYPES = ['MORNING', 'PM', 'AFTER_SCHOOL'] as const
export type ServiceType = typeof SERVICE_TYPES[number]
export const crewWhere = (id: string) => ({ OR: [{ driverId: id }, { maintainerId: id }] })
export function isServiceType(value: unknown): value is ServiceType { return typeof value === 'string' && SERVICE_TYPES.includes(value as ServiceType) }
export function studentUsesBus(student: { isSelfPickup?: boolean; selfPickupSession?: string | null }, serviceType: ServiceType) {
  return !student.isSelfPickup || student.selfPickupSession !== serviceType
}
export function transportModeLabel(student: { isSelfPickup?: boolean; selfPickupSession?: string | null }) {
  if (!student.isSelfPickup) return 'Bus Transport (no self-pickup)'
  if (student.selfPickupSession === 'MORNING') return 'Morning Self-Pickup'
  if (student.selfPickupSession === 'PM') return 'PM Self-Pickup'
  if (student.selfPickupSession === 'AFTER_SCHOOL') return 'After School Activity'
  return 'Bus Transport (no self-pickup)'
}
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
