"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  AlertTriangle,
  Bell,
  Bus,
  CheckCircle2,
  Gauge,
  History,
  LayoutDashboard,
  MapPin,
  MessageSquare,
  Navigation,
  Play,
  Radio,
  Send,
  ShieldCheck,
  UserRound,
  Users,
  Wrench,
  Trash2,
} from "lucide-react";
import { useTranslation as useLocaleText } from "@/i18n/provider";
import { useTranslation } from "@/i18n/provider";
import {
  api,
  ApiError,
  Child,
  Empty,
  formatDate,
  NoticeBar,
  Person,
  Stop,
  Tracking,
  useAccount,
  useUnreadActivity,
  Workspace,
} from "@/components/transport/shared";
import { nextAttendanceAction, transportModeLabel } from "@/lib/transport";
import MaintenanceTab from "@/components/admin/MaintenanceTab";
import MessagesTab from "@/components/admin/MessagesTab";
import NotificationsPanel from '@/components/transport/NotificationsPanel'

const BusMap = dynamic(() => import("@/components/BusMap"), { ssr: false });
const tabs = [
  { id: "dashboard", label: "Dashboard", icon: LayoutDashboard },
  { id: "trip", label: "Trip", icon: Navigation },
  { id: "attendance", label: "Student attendance", icon: Users },
  { id: "tracking", label: "Live location", icon: MapPin },
  { id: "broadcast", label: "Broadcast", icon: Send },
  { id: "messages", label: "Messages", icon: MessageSquare },
  { id: "notifications", label: "Notifications", icon: Bell },
  { id: "history", label: "Trip history", icon: History },
  { id: "maintenance", label: "Bus maintenance", icon: Wrench },
  { id: "emergency", label: "Emergency / issue", icon: AlertTriangle },
];

type RecordItem = {
  id: string;
  studentId: string;
  action: string;
  timestamp: string;
  stopId?: string;
};
type BroadcastItem = {
  id: string;
  title: string;
  body: string;
  createdAt: string;
  sentCount: number;
};
type BoardingRequest = {
  id: string;
  studentId: string;
  action: string;
  requestedAt: string;
  parent: { name: string };
};
type HistoryItem = {
  id: string;
  date: string;
  status: string;
  routeName: string;
  busNumber?: string;
  attendance: { studentName: string; action: string; timestamp: string }[];
};
type CrewData = {
  bus: {
    id: string;
    plateNumber: string;
    busNumber?: string;
    capacity: number;
    status: string;
    driver?: Person & { licenseNumber?: string; employmentStatus?: string };
    maintainer?: Person & { employmentStatus?: string };
    organization?: {
      id: string;
      name: string;
      address?: string;
      phone?: string;
    };
    route?: { id: string; name: string; stops: Stop[] };
  } | null;
  activeTrip: {
    id: string;
    date: string;
    serviceType: string;
    currentStopOrder: number;
    attendances: RecordItem[];
    attendanceRequests: BoardingRequest[];
  } | null;
  serviceType: string;
  students: Child[];
  setupIssues: string[];
  readyToStart: boolean;
};

export default function DriverDashboard() {
  const { tx: translateUi } = useLocaleText();
  const { tx, locale } = useTranslation();
  const me = useAccount("DRIVER");
  const activity=useUnreadActivity();
  const [tab, setTab] = useState("dashboard");
  const [serviceType, setServiceType] = useState("MORNING");
  const [data, setData] = useState<CrewData>({
    bus: null,
    activeTrip: null,
    serviceType: "MORNING",
    students: [],
    setupIssues: [],
    readyToStart: false,
  });
  const [tracking, setTracking] = useState<Tracking[]>([]);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [broadcasts, setBroadcasts] = useState<BroadcastItem[]>([]);
  const [broadcast, setBroadcast] = useState("");
  const [broadcastType, setBroadcastType] = useState("TRAFFIC");
  const [query, setQuery] = useState("");
  const [stopId, setStopId] = useState("");
  const [sharing, setSharing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [confirm, setConfirm] = useState<{
    child: Child;
    action: string;
  } | null>(null);
  const [actionError, setActionError] = useState("");
  const [gpsWarning, setGpsWarning] = useState<{
    distanceMetres?: number;
  } | null>(null);
  const watch = useRef<number | null>(null);
  const position = useRef<{
    latitude: number;
    longitude: number;
    timestamp: number;
  } | null>(null);
  const lastSent = useRef(0);
  const loading = useRef(false);
  const sequence = useRef(0);

  const load = useCallback(
    async (force = false) => {
      if (!me || (loading.current && !force)) return;
      const requestId = ++sequence.current;
      loading.current = true;
      try {
        const [status, live, trips, sent] = await Promise.all([
          api(`/api/driver/status?serviceType=${serviceType}`),
          api("/api/location").catch(() => ({ drivers: [] })),
          api("/api/trips/history").catch(() => ({ trips: [] })),
          api("/api/driver/broadcast").catch(() => ({ broadcasts: [] })),
        ]);
        if (requestId !== sequence.current) return;
        setData(status);
        setTracking(live.drivers || []);
        setHistory(trips.trips || []);
        setBroadcasts(sent.broadcasts || []);
        if (status.activeTrip?.serviceType)
          setServiceType(status.activeTrip.serviceType);
        setError("");
      } catch (cause) {
        if (requestId === sequence.current)
          setError(
            cause instanceof Error ? cause.message : "Unable to load crew data",
          );
      } finally {
        if (requestId === sequence.current) loading.current = false;
      }
    },
    [me, serviceType],
  );

  useEffect(() => {
    void load();
    const timer = window.setInterval(() => void load(), 8000);
    return () => window.clearInterval(timer);
  }, [load]);

  const stopSharing = useCallback(() => {
    if (watch.current !== null) navigator.geolocation.clearWatch(watch.current);
    watch.current = null;
    setSharing(false);
  }, []);
  const startSharing = useCallback(() => {
    if (watch.current !== null) return;
    if (!navigator.geolocation || !window.isSecureContext) {
      setError(
        "Automatic live location needs HTTPS and browser location permission.",
      );
      return;
    }
    watch.current = navigator.geolocation.watchPosition(
      (reading) => {
        position.current = {
          latitude: reading.coords.latitude,
          longitude: reading.coords.longitude,
          timestamp: reading.timestamp,
        };
        setSharing(true);
        if (Date.now() - lastSent.current >= 8000) {
          lastSent.current = Date.now();
          void api("/api/location", position.current)
            .then(() => {
              if (tab === "tracking") void load(true);
            })
            .catch((cause) => setError(cause.message));
        }
      },
      (locationError) => {
        const message =
          locationError.code === locationError.PERMISSION_DENIED
            ? "Location permission was denied. Allow location for this site and reload."
            : locationError.code === locationError.TIMEOUT
              ? "GPS timed out. Move near an open area and try again."
              : "The device could not provide a GPS position.";
        setError(message);
        stopSharing();
      },
      { enableHighAccuracy: true, maximumAge: 3000, timeout: 20000 },
    );
  }, [load, stopSharing, tab]);
  useEffect(() => {
    if (data.activeTrip) startSharing();
    else stopSharing();
  }, [data.activeTrip?.id, startSharing, stopSharing]);
  useEffect(
    () => () => {
      if (watch.current !== null)
        navigator.geolocation.clearWatch(watch.current);
    },
    [],
  );

  const run = async (work: () => Promise<void>) => {
    if (busy) return;
    setBusy(true);
    setError("");
    setSuccess("");
    try {
      await work();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Request failed");
    } finally {
      setBusy(false);
    }
  };
  const bus = data.bus;
  const records = data.activeTrip?.attendances || [];
  const status = (studentId: string) => {
    const actions = records
      .filter((item) => item.studentId === studentId)
      .map((item) => item.action);
    return actions.includes("ABSENT")
      ? "Absent"
      : actions.includes("DROPPED_OFF")
        ? "Dropped off"
        : actions.includes("PICKED_UP")
          ? "On board"
          : "Waiting";
  };
  const unresolvedCount = data.students.filter(
    (student) => !["Absent", "Dropped off"].includes(status(student.id)),
  ).length;
  const counts = ["Waiting", "On board", "Dropped off", "Absent"].map(
    (label) => ({
      label,
      count: data.students.filter((student) => status(student.id) === label)
        .length,
    }),
  );
  const roster = data.students.filter(
    (student) =>
      student.name.toLowerCase().includes(query.toLowerCase()) &&
      (!stopId ||
        student.pickupStopId === stopId ||
        student.dropoffStopId === stopId),
  );
  const selectedStop =
    confirm?.action === "DROPPED_OFF"
      ? confirm.child.dropoffStop
      : confirm?.child.pickupStop;
  const stops = bus?.route?.stops || [];
  const currentOrder = data.activeTrip?.currentStopOrder || 0;
  const nextStop = stops.find((stop) => stop.order > currentOrder);
  const allStopsCompleted = Boolean(stops.length && !nextStop);

  const submitAttendance = async (override = false) => {
    if (!confirm || !data.activeTrip || busy) return;
    setBusy(true);
    setActionError("");
    setGpsWarning(null);
    try {
      const gps =
        position.current && Date.now() - position.current.timestamp < 60000
          ? position.current
          : {};
      const result = await api("/api/attendance", {
        tripId: data.activeTrip.id,
        studentId: confirm.child.id,
        action: confirm.action,
        stopId: selectedStop?.id,
        confirmStop: true,
        ...gps,
        ...(override
          ? { gpsOverride: true, overrideReason: "CREW_VISUAL_CONFIRMATION" }
          : {}),
      });
      setData((previous) =>
        previous.activeTrip
          ? {
              ...previous,
              activeTrip: {
                ...previous.activeTrip,
                attendances: [
                  ...previous.activeTrip.attendances.filter(
                    (item) => item.id !== result.attendance.id,
                  ),
                  result.attendance,
                ],
                attendanceRequests:
                  previous.activeTrip.attendanceRequests.filter(
                    (item) =>
                      !(
                        item.studentId === confirm.child.id &&
                        item.action === confirm.action
                      ),
                  ),
              },
            }
          : previous,
      );
      setConfirm(null);
      setSuccess("Attendance saved and the parent was notified");
      await load(true);
    } catch (cause) {
      if (cause instanceof ApiError && cause.data.code === "GPS_MISMATCH") {
        setGpsWarning({
          distanceMetres: Number(cause.data.distanceMetres) || undefined,
        });
        setActionError(
          "GPS does not match the assigned stop. If you can physically see and verify the student, use the audited override below.",
        );
      } else
        setActionError(
          cause instanceof Error
            ? cause.message
            : "Unable to record attendance",
        );
    } finally {
      setBusy(false);
    }
  };

  return (
    <Workspace me={me} title={translateUi("Crew workspace")}>
      <NoticeBar message={error} retry={() => void load(true)} />
      <NoticeBar message={success} />
      <div className="portal-layout driver-portal">
        <nav
          className="transport-tabs portal-sidebar"
          aria-label={tx("Crew workspace")}
        >
          {tabs.map((item) => (
            <button
              key={item.id}
              className={tab === item.id ? "selected" : ""}
              onClick={() => {setTab(item.id);if(['messages','maintenance'].includes(item.id))void activity.clear(item.id);if(item.id==='notifications')void activity.clear('alerts')}}
            >
              <item.icon size={20} />
              <span>{tx(item.label)}</span>
              {(activity.has(item.id)||(item.id==='notifications'&&activity.has('alerts')))&&<i className="nav-new-dot" aria-label={tx('New activity')}/>} 
            </button>
          ))}
        </nav>
        <div className="portal-content">
          {!bus && (
            <NoticeBar message="Ask your School Admin to assign an active bus, route and students." />
          )}
          {data.setupIssues.map((issue) => (
            <NoticeBar key={issue} message={issue} />
          ))}

          {tab === "dashboard" && (
            <>
              <section className="crew-route-card">
                <div className="bus-icon">
                  <Bus size={34} />
                </div>
                <div>
                  <p className="eyebrow">{tx("Crew dashboard")}</p>
                  <h2 data-no-translate>
                    {bus?.busNumber ||
                      bus?.plateNumber ||
                      tx("School assignment pending")}
                  </h2>
                  <p data-no-translate>{bus?.route?.name || "—"}</p>
                </div>
                <span
                  className={`status-pill ${data.activeTrip ? "green" : "amber"}`}
                >
                  {tx(data.activeTrip ? "Trip active" : "Ready for next trip")}
                </span>
              </section>
              <div className="attendance-counts">
                {counts.map((item) => (
                  <div key={item.label}>
                    <span>{tx(item.label)}</span>
                    <strong>{item.count}</strong>
                  </div>
                ))}
              </div>
              <div className="driver-info-grid">
                <section className="journey-card">
                  <h2>
                    <UserRound size={21} />
                    {tx("Driver details")}
                  </h2>
                  <Info
                    label="Name"
                    value={bus?.driver?.name || bus?.maintainer?.name}
                  />
                  <Info label="Role" value={me?.personnelType || "DRIVER"} />
                  <Info
                    label="Phone"
                    value={bus?.driver?.phone || bus?.maintainer?.phone}
                  />
                  <Info
                    label="Email"
                    value={bus?.driver?.email || bus?.maintainer?.email}
                  />
                  <Info label="Licence" value={bus?.driver?.licenseNumber} />
                </section>
                <section className="journey-card">
                  <h2>
                    <Bus size={21} />
                    {tx("Bus details")}
                  </h2>
                  <Info label="Bus number" value={bus?.busNumber} />
                  <Info label="Plate number" value={bus?.plateNumber} />
                  <Info
                    label="Capacity"
                    value={bus?.capacity ? `${bus.capacity} seats` : undefined}
                  />
                  <Info label="Route" value={bus?.route?.name} />
                  <Info label="Stops" value={`${stops.length}`} />
                </section>
                <section className="journey-card">
                  <h2>
                    <ShieldCheck size={21} />
                    {tx("School details")}
                  </h2>
                  <Info
                    label="School"
                    value={bus?.organization?.name || me?.organization?.name}
                  />
                  <Info label="Address" value={bus?.organization?.address} />
                  <Info label="Phone" value={bus?.organization?.phone} />
                  <Info label="Maintainer" value={bus?.maintainer?.name} />
                </section>
              </div>
            </>
          )}

          {tab === "trip" && (
            <>
              <section className="crew-route-card">
                <div className="bus-icon">
                  <Navigation size={34} />
                </div>
                <div>
                  <p className="eyebrow">{tx("Today's route")}</p>
                  <h2 data-no-translate>
                    {bus?.route?.name || tx("School assignment pending")}
                  </h2>
                  <p>
                    {stops.length} {tx("stops")} ·{" "}
                    <span data-no-translate>{bus?.plateNumber || "—"}</span>
                  </p>
                </div>
                <div className="crew-trip-controls">
                  <label>
                    {tx("Transport service")}
                    <select
                      disabled={Boolean(data.activeTrip)}
                      value={serviceType}
                      onChange={(event) => setServiceType(event.target.value)}
                    >
                      <option value="MORNING">{tx("Morning")}</option>
                      <option value="PM">{tx("PM")}</option>
                      <option value="AFTER_SCHOOL">
                        {tx("After School Activity")}
                      </option>
                    </select>
                  </label>
                  {!data.activeTrip ? (
                    <button
                      className="transport-primary"
                      disabled={busy || !data.readyToStart}
                      onClick={() =>
                        run(async () => {
                          await api("/api/trips", {
                            busId: bus?.id,
                            routeId: bus?.route?.id,
                            serviceType,
                          });
                          await load(true);
                          setSuccess(
                            "Trip started. Automatic live location is now active.",
                          );
                        })
                      }
                    >
                      <Play size={18} />
                      {tx("Start trip")}
                    </button>
                  ) : (
                    <button
                      className="transport-primary"
                      disabled={
                        busy || unresolvedCount > 0 || !allStopsCompleted
                      }
                      onClick={() =>
                        run(async () => {
                          await api(
                            `/api/trips/${data.activeTrip!.id}`,
                            { status: "TRIP_COMPLETED" },
                            "PATCH",
                          );
                          stopSharing();
                          await load(true);
                          setSuccess(
                            "Trip completed. Live location sharing stopped.",
                          );
                        })
                      }
                    >
                      <CheckCircle2 size={18} />
                      {tx("Complete trip")}
                    </button>
                  )}
                </div>
              </section>
              {data.activeTrip && unresolvedCount > 0 && (
                <NoticeBar
                  message={`Complete attendance for ${unresolvedCount} student(s) before ending the trip.`}
                />
              )}
              <section className="journey-card">
                <div className="section-title">
                  <h2>
                    <MapPin size={21} />
                    {tx("Route stop progress")}
                  </h2>
                  <strong>
                    {Math.min(
                      stops.filter((stop) => stop.order <= currentOrder).length,
                      stops.length,
                    )}{" "}
                    / {stops.length}
                  </strong>
                </div>
                <ol className="trip-stop-progress">
                  {stops.map((stop, index) => {
                    const done = stop.order <= currentOrder,
                      active = nextStop?.id === stop.id;
                    return (
                      <li
                        key={stop.id}
                        className={`${done ? "completed" : ""} ${active ? "active" : ""}`}
                      >
                        <span>
                          {done ? <CheckCircle2 size={18} /> : stop.order}
                        </span>
                        <div>
                          <strong data-no-translate>{stop.name}</strong>
                          <small>
                            {tx(
                              done
                                ? "Completed"
                                : active
                                  ? "Next stop"
                                  : "Upcoming",
                            )}
                          </small>
                        </div>
                        {index < stops.length - 1 && <i />}
                      </li>
                    );
                  })}
                </ol>
                {data.activeTrip && nextStop && (
                  <button
                    className="transport-primary stop-complete-button"
                    disabled={busy}
                    onClick={() =>
                      run(async () => {
                        await api(
                          `/api/trips/${data.activeTrip!.id}`,
                          { completeStopId: nextStop.id },
                          "PATCH",
                        );
                        await load(true);
                        setSuccess(`${nextStop.name} completed`);
                      })
                    }
                  >
                    <CheckCircle2 size={18} />
                    {tx("Complete stop")}:{" "}
                    <span data-no-translate>{nextStop.name}</span>
                  </button>
                )}
                {data.activeTrip && allStopsCompleted && (
                  <div className="route-complete-banner">
                    <CheckCircle2 />
                    {tx(
                      "All route stops completed. Finish attendance and complete the trip.",
                    )}
                  </div>
                )}
                {!data.activeTrip && (
                  <Empty text="Start a trip to begin route stop progress." />
                )}
              </section>
            </>
          )}

          {tab === "attendance" && (
            <>
              <div className="attendance-counts">
                {counts.map((item) => (
                  <div key={item.label}>
                    <span>{tx(item.label)}</span>
                    <strong>{item.count}</strong>
                  </div>
                ))}
              </div>
              <section>
                <div className="section-title">
                  <h2>
                    <Users size={22} />
                    {tx("Student attendance")}
                  </h2>
                </div>
                <div className="roster-filters">
                  <input
                    placeholder={tx("Search students")}
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                  />
                  <select
                    value={stopId}
                    onChange={(event) => setStopId(event.target.value)}
                  >
                    <option value="">{tx("All stops")}</option>
                    {stops.map((stop) => (
                      <option value={stop.id} key={stop.id}>
                        {stop.order}. {stop.name}
                      </option>
                    ))}
                  </select>
                </div>
                {!data.activeTrip && (
                  <NoticeBar message="Start a trip to record attendance." />
                )}
                {!roster.length && <Empty text="No students assigned" />}
                <div className="driver-roster-grid">
                  {roster.map((child) => {
                    const action = nextAttendanceAction(
                      records
                        .filter((item) => item.studentId === child.id)
                        .map((item) => item.action),
                    );
                    const last = records
                      .filter((item) => item.studentId === child.id)
                      .at(-1);
                    const parentRequest =
                      data.activeTrip?.attendanceRequests.find(
                        (item) =>
                          item.studentId === child.id && item.action === action,
                      );
                    return (
                      <article
                        className="student-attendance-card"
                        key={child.id}
                      >
                        <div className="bus-title">
                          <div className="child-avatar">
                            {child.name.slice(0, 1)}
                          </div>
                          <div>
                            <h3 data-no-translate>{child.name}</h3>
                            <p data-no-translate>
                              {child.grade} · {child.studentCode}
                            </p>
                            <small>{tx(transportModeLabel(child))}</small>
                          </div>
                          <span
                            className={`status-pill ${status(child.id) === "On board" ? "green" : ""}`}
                          >
                            {tx(status(child.id))}
                          </span>
                        </div>
                        {parentRequest && (
                          <div className="parent-confirmation-request">
                            <ShieldCheck size={18} />
                            <span>
                              <strong>
                                {tx(
                                  parentRequest.action === "DROPPED_OFF"
                                    ? "Parent reported arrival home"
                                    : "Parent reported boarding",
                                )}
                              </strong>{" "}
                              ·{" "}
                              <span data-no-translate>
                                {parentRequest.parent.name}
                              </span>
                            </span>
                            <button
                              className="transport-secondary"
                              disabled={busy}
                              onClick={() =>
                                run(async () => {
                                  await api(
                                    "/api/attendance/requests",
                                    {
                                      id: parentRequest.id,
                                      status: "REJECTED",
                                    },
                                    "PATCH",
                                  );
                                  await load(true);
                                })
                              }
                            >
                              {tx("Reject")}
                            </button>
                          </div>
                        )}
                        <div className="stop-pair">
                          <p>
                            <MapPin size={16} />
                            {tx("Pickup stop")}:{" "}
                            <strong data-no-translate>
                              {child.pickupStop?.name || "—"}
                            </strong>
                          </p>
                          <p>
                            <MapPin size={16} />
                            {tx("Drop-off stop")}:{" "}
                            <strong data-no-translate>
                              {child.dropoffStop?.name || "—"}
                            </strong>
                          </p>
                        </div>
                        {last && (
                          <time>{formatDate(last.timestamp, locale)}</time>
                        )}
                        <div className="attendance-actions">
                          {action && (
                            <button
                              className="transport-primary"
                              disabled={busy || !data.activeTrip}
                              onClick={() => {
                                setActionError("");
                                setGpsWarning(null);
                                setConfirm({ child, action });
                              }}
                            >
                              {tx(
                                action === "PICKED_UP"
                                  ? "Confirm boarding"
                                  : "Confirm drop-off",
                              )}
                            </button>
                          )}
                          {action === "PICKED_UP" && (
                            <button
                              className="transport-secondary"
                              disabled={busy || !data.activeTrip}
                              onClick={() => {
                                setActionError("");
                                setGpsWarning(null);
                                setConfirm({ child, action: "ABSENT" });
                              }}
                            >
                              {tx("Mark absent")}
                            </button>
                          )}
                        </div>
                      </article>
                    );
                  })}
                </div>
              </section>
            </>
          )}

          {tab === "tracking" && (
            <section>
              <div className="section-title">
                <h2>
                  <Radio size={22} />
                  {tx("Automatic live location")}
                </h2>
                <span className={`status-pill ${sharing ? "green" : "amber"}`}>
                  {tx(
                    data.activeTrip
                      ? sharing
                        ? "Live location active"
                        : "Waiting for GPS permission"
                      : "Starts with the trip",
                  )}
                </span>
              </div>
              <div className="map-card">
                <BusMap drivers={tracking} />
              </div>
              {tracking.map((item) => (
                <article className="journey-card" key={item.id}>
                  <div className="bus-title">
                    <div className="bus-icon">
                      <Bus />
                    </div>
                    <div>
                      <h3 data-no-translate>{item.name}</h3>
                      <p data-no-translate>{item.routeName}</p>
                    </div>
                    <span
                      className={`status-pill ${item.fresh ? "green" : "amber"}`}
                    >
                      {tx(item.fresh ? "Live" : "No recent GPS signal")}
                    </span>
                  </div>
                  <div className="crew-details">
                    <span>
                      {tx("Driver")}:{" "}
                      <b data-no-translate>{item.driver.name}</b>
                    </span>
                    <span>
                      {tx("Bus")}:{" "}
                      <b data-no-translate>{bus?.plateNumber || "—"}</b>
                    </span>
                    <span>
                      <Gauge size={15} />{" "}
                      {Math.round(item.currentSpeedKmH || 0)} km/h
                    </span>
                    {item.lastLocationUpdate && (
                      <time>
                        {tx("Updated")}:{" "}
                        {formatDate(item.lastLocationUpdate, locale)}
                      </time>
                    )}
                  </div>
                </article>
              ))}
              {!tracking.length && (
                <Empty text="Start the trip and allow GPS to see this bus live." />
              )}
              <p className="subtle">
                {tx(
                  "Location starts automatically with the trip and stops automatically when the trip is completed.",
                )}
              </p>
            </section>
          )}

          {tab === "broadcast" && (
            <section className="journey-card">
              <h2>
                <Send size={21} />
                {tx("Broadcast to parents and school")}
              </h2>
              <form
                onSubmit={(event) => {
                  event.preventDefault();
                  void run(async () => {
                    await api("/api/driver/broadcast", {
                      tripId: data.activeTrip?.id,
                      type: broadcastType,
                      message: broadcast,
                    });
                    setBroadcast("");
                    await load(true);
                    setSuccess("Broadcast sent");
                  });
                }}
              >
                <label>
                  {tx("Broadcast type")}
                  <select
                    value={broadcastType}
                    onChange={(event) => setBroadcastType(event.target.value)}
                  >
                    <option value="TRAFFIC">{tx("Traffic")}</option>
                    <option value="BUS_DELAYED">{tx("Delay")}</option>
                    <option value="BREAKDOWN">{tx("Breakdown")}</option>
                    <option value="OTHER">{tx("Other")}</option>
                  </select>
                </label>
                <textarea
                  required
                  maxLength={500}
                  placeholder={tx("Type a message")}
                  value={broadcast}
                  onChange={(event) => setBroadcast(event.target.value)}
                />
                <button
                  className="transport-primary"
                  disabled={busy || !data.activeTrip}
                >
                  <Send size={18} />
                  {tx("Send broadcast")}
                </button>
              </form>
              <div className="broadcast-list">
                {broadcasts.map((item) => (
                  <article className="broadcast-history" key={item.id}>
                    <strong data-no-translate>{item.title}</strong>
                    <p data-no-translate>{item.body}</p>
                    <small>
                      {item.sentCount} {tx("recipients")} ·{" "}
                      {formatDate(item.createdAt, locale)}
                    </small>
                  </article>
                ))}
                {!broadcasts.length && <Empty text="No broadcasts sent" />}
              </div>
            </section>
          )}

          {tab === "history" && (
            <section className="journey-card">
              <h2>
                <History size={21} />
                {tx("Trip and attendance history")}
              </h2>
              {history.map((trip) => (
                <details key={trip.id} className="history-entry">
                  <summary>
                    <strong data-no-translate>{trip.routeName}</strong> ·{" "}
                    {formatDate(trip.date, locale)} ·{" "}
                    <span className="status-pill">
                      {tx(trip.status.replaceAll("_", " "))}
                    </span>
                  </summary>
                  <button className="history-delete" onClick={()=>void run(async()=>{await api('/api/trips/history',{id:trip.id},'DELETE');setHistory(items=>items.filter(item=>item.id!==trip.id))})}><Trash2 size={15}/>{tx('Delete from history')}</button>
                  {trip.attendance.map((item, index) => (
                    <div
                      className="attendance-history"
                      key={`${item.studentName}-${index}`}
                    >
                      <strong data-no-translate>{item.studentName}</strong>
                      <span>
                        {tx(
                          item.action === "PICKED_UP"
                            ? "Boarded"
                            : item.action === "DROPPED_OFF"
                              ? "Dropped off"
                              : "Absent",
                        )}
                      </span>
                      <time>{formatDate(item.timestamp, locale)}</time>
                    </div>
                  ))}
                </details>
              ))}
              {!history.length && <Empty text="No attendance records" />}
            </section>
          )}

          {tab === "messages" && <MessagesTab />}
          {tab === "notifications" && <NotificationsPanel />}
          {tab === "maintenance" && (
            <MaintenanceTab currentRole="DRIVER" />
          )}

          {tab === "emergency" && (
            <section className="journey-card emergency-panel">
              <AlertTriangle size={42} />
              <h2>{tx("Emergency / issue")}</h2>
              <p>
                {tx(
                  "Use this only for an urgent transport or safety issue. The school, Super Admin and affected parents will be alerted.",
                )}
              </p>
              <button
                className="emergency-button"
                disabled={busy}
                onClick={() => {
                  if (
                    window.confirm(tx("Send an emergency alert to the school?"))
                  )
                    void run(async () => {
                      await api("/api/emergency", {
                        latitude: position.current?.latitude,
                        longitude: position.current?.longitude,
                        source: "DRIVER",
                      });
                      setSuccess("Emergency alert sent");
                    });
                }}
              >
                <AlertTriangle />
                {tx("Send emergency SOS")}
              </button>
            </section>
          )}
        </div>
      </div>

      {confirm && (
        <div className="transport-modal-backdrop">
          <section
            className="transport-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="attendance-confirm"
          >
            <ShieldCheck size={34} />
            <h2 id="attendance-confirm">
              {tx(
                confirm.action === "ABSENT"
                  ? "Mark absent"
                  : confirm.action === "PICKED_UP"
                    ? "Confirm boarding"
                    : "Confirm drop-off",
              )}
            </h2>
            <h3 data-no-translate>{confirm.child.name}</h3>
            <p data-no-translate>{selectedStop?.name}</p>
            <p>
              {tx(
                confirm.action === "ABSENT"
                  ? "Confirm the student is not travelling on this service."
                  : "This records the attendance, assigned stop, crew member and GPS evidence, then notifies the parent.",
              )}
            </p>
            <NoticeBar message={actionError} />
            {gpsWarning && (
              <div className="gps-override-warning">
                <AlertTriangle />
                <div>
                  <strong>{tx("GPS stop mismatch")}</strong>
                  <p>
                    {gpsWarning.distanceMetres
                      ? `${gpsWarning.distanceMetres} metres from the assigned stop.`
                      : tx("The bus location is outside the stop radius.")}
                  </p>
                </div>
              </div>
            )}
            <div className="attendance-actions">
              <button
                className="transport-secondary"
                disabled={busy}
                onClick={() => {
                  setConfirm(null);
                  setGpsWarning(null);
                }}
              >
                {tx("Cancel")}
              </button>
              {gpsWarning ? (
                <button
                  className="transport-primary danger-confirm"
                  disabled={busy}
                  onClick={() => void submitAttendance(true)}
                >
                  <ShieldCheck size={17} />
                  {tx("Visually verified — confirm anyway")}
                </button>
              ) : (
                <button
                  className="transport-primary"
                  disabled={busy}
                  onClick={() => void submitAttendance()}
                >
                  {tx("Confirm")}
                </button>
              )}
            </div>
          </section>
        </div>
      )}
    </Workspace>
  );
}

function Info({
  label,
  value,
}: {
  label: string;
  value?: string | number | null;
}) {
  const { tx } = useTranslation();
  return (
    <div className="info-row">
      <span>{tx(label)}</span>
      <strong data-no-translate>{value || "—"}</strong>
    </div>
  );
}
