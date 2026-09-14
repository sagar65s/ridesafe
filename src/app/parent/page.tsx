"use client";
import { useTranslation as useLocaleText } from "@/i18n/provider";
import { TranslatedText } from "@/i18n/provider";
import { useCallback, useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import {
  Bell,
  CalendarDays,
  Bus,
  MapPin,
  Users,
  MessageSquare,
  History,
  Volume2,
  ShieldCheck,
  Send,
  Trash2,
  Phone,
  AlertTriangle,
  CreditCard,
  ExternalLink,
  LayoutDashboard,
  ClipboardCheck,
} from "lucide-react";
import { useTranslation } from "@/i18n/provider";
import {
  api,
  Child,
  Notice,
  Tracking,
  useAccount,
  useHorn,
  useUnreadActivity,
  Workspace,
  Empty,
  NoticeBar,
  formatDate,
} from "@/components/transport/shared";
import { transportMessage } from "@/lib/transport-copy";
import CalendarCard from "@/components/CalendarCard";
import ParentCalendar from "@/components/transport/ParentCalendar";
const BusMap = dynamic(() => import("@/components/BusMap"), { ssr: false });
const tabs = [
  { id: "dashboard", label: "Dashboard", icon: LayoutDashboard },
  { id: "children", label: "Children", icon: Users },
  { id: "tracking", label: "Live Tracking", icon: MapPin },
  { id: "attendance", label: "Attendance", icon: ClipboardCheck },
  { id: "calendar", label: "Academic Calendar", icon: CalendarDays },
  { id: "messages", label: "Messages", icon: MessageSquare },
  { id: "payments", label: "Payments", icon: CreditCard },
  { id: "alerts", label: "Alerts", icon: Bell },
  { id: "history", label: "History", icon: History },
];
type Message = {
  id: string;
  content: string;
  createdAt: string;
  read: boolean;
  sender: { id: string; name: string; role: string };
  recipient: { id: string; name: string; role: string };
  threadUser?: {id:string;name:string;role:string}|null;
};
type SchoolContact = { id:string; name:string; role:string };
type Payment = {
  id: string;
  amount: number;
  status: string;
  createdAt: string;
  dueDate?: string;
  checkoutUrl?: string;
};
type HistoryItem = {
  id: string;
  routeName: string;
  date: string;
  attendance: { studentName: string; action: string; timestamp: string }[];
};
type BoardingRequest = {
  id: string;
  studentId: string;
  action: "PICKED_UP" | "DROPPED_OFF";
  status: string;
  requestedAt: string;
  trip: { serviceType: string };
};
function safeCheckoutUrl(value?: string) {
  if (!value) return null;
  if (value.startsWith("/") && !value.startsWith("//")) return value;
  try {
    const parsed = new URL(value);
    return parsed.protocol === "https:" ? parsed.href : null;
  } catch {
    return null;
  }
}
export default function ParentDashboard() {
  const { tx: translateUi } = useLocaleText();

  const me = useAccount("PARENT"),
    { tx, locale } = useTranslation(),
    horn = useHorn();
  const activity=useUnreadActivity();
  const [tab, setTab] = useState("dashboard"),
    [children, setChildren] = useState<Child[]>([]),
    [tracking, setTracking] = useState<Tracking[]>([]),
    [notices, setNotices] = useState<Notice[]>([]);
  const displayNotice = (n: Notice) => {
    try {
      const m = JSON.parse(n.metadata || "{}");
      return m.studentName
        ? {
            ...n,
            ...transportMessage(
              locale,
              n.type,
              m.studentName,
              m.stopName || "",
              m.actorName || "",
            ),
          }
        : n;
    } catch {
      return n;
    }
  };
  const [messages, setMessages] = useState<Message[]>([]),
    [history, setHistory] = useState<HistoryItem[]>([]),
    [payments, setPayments] = useState<Payment[]>([]),
    [boardingRequests, setBoardingRequests] = useState<BoardingRequest[]>([]);
  const [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [text, setText] = useState(""),
    [contact, setContact] = useState(""),
    [contacts, setContacts] = useState<SchoolContact[]>([]),
    [pushEnabled, setPushEnabled] = useState(false);
  const [issue, setIssue] = useState({ subject: "", description: "" }),
    [arrival, setArrival] = useState("");
  const loading = useRef(false);
  const load = useCallback(async () => {
    if (!me || loading.current) return;
    loading.current = true;
    try {
      const [students, live, alerts, requests] = await Promise.all([
        api("/api/students"),
        api("/api/location"),
        api("/api/notifications"),
        api("/api/attendance/requests"),
      ]);
      setChildren(students.students || []);
      setTracking(live.drivers || []);
      setNotices(alerts.notifications || []);
      setBoardingRequests(requests.requests || []);
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to load data");
    } finally {
      loading.current = false;
    }
  }, [me]);
  useEffect(() => {
    if (!me) return;
    void load();
    const timer = setInterval(load, 10000);
    return () => clearInterval(timer);
  }, [load, me]);
  useEffect(() => {
    if (!me || typeof EventSource === "undefined") return;
    const stream = new EventSource("/api/location/stream");
    stream.onmessage = () => void load();
    return () => stream.close();
  }, [load, me]);
  useEffect(() => {
    if (!me) return;
    if (tab === "messages") {
      const refresh = () => {
        api("/api/messages")
          .then((d) => setMessages(d.messages || []))
          .catch((e) => setError(e.message));
        api("/api/messages/contacts")
          .then((d) => { const next=d.contacts||[]; setContacts(next); setContact(value=>value||next[0]?.id||""); })
          .catch((e) => setError(e.message));
      };
      refresh();
      const timer = setInterval(refresh, 5000);
      return () => clearInterval(timer);
    }
    if (tab === "history")
      api("/api/trips/history")
        .then((d) => setHistory(d.trips))
        .catch((e) => setError(e.message));
    if (tab === "payments")
      api(`/api/billing/${me.id}`)
        .then((d) => setPayments(d.payments))
        .catch((e) => setError(e.message));
  }, [tab, me]);
  // Browsers require one user gesture before a website may play sound. Arm the
  // horn silently on the parent's first tap/click/key press so the later
  // five-minute alert plays automatically without another button press.
  useEffect(() => {
    if (!me || horn.enabled) return;
    const arm = () => void horn.enable().catch(() => undefined);
    window.addEventListener("pointerdown", arm, { once: true, capture: true });
    window.addEventListener("keydown", arm, { once: true, capture: true });
    return () => {
      window.removeEventListener("pointerdown", arm, { capture: true });
      window.removeEventListener("keydown", arm, { capture: true });
    };
  }, [me, horn.enabled, horn.enable]);
  useEffect(() => {
    if (!me || !horn.enabled) return;
    const candidates = notices.filter((notice) => {
      if (notice.type !== "BUS_ETA_5_MIN") return false;
      try {
        const metadata = JSON.parse(notice.metadata || "{}");
        if (!metadata.studentId || !metadata.action) return false;
        if (
          metadata.expiresAt &&
          Date.now() > new Date(metadata.expiresAt).getTime()
        )
          return false;
        const target = tracking
          .flatMap((bus) => bus.targets)
          .find(
            (item) =>
              item.studentId === metadata.studentId &&
              item.action === metadata.action,
          );
        return Boolean(
          target &&
          target.etaMins !== null &&
          target.etaMins > 0 &&
          target.etaMins <= 5,
        );
      } catch {
        return false;
      }
    });
    const unplayed = candidates.filter(
      (notice) => !localStorage.getItem(`ridesafe-horn:${me.id}:${notice.id}`),
    );
    if (!unplayed.length || !horn.play()) return;
    for (const notice of unplayed)
      localStorage.setItem(`ridesafe-horn:${me.id}:${notice.id}`, "1");
    setArrival(unplayed[0].body);
  }, [notices, tracking, me, horn.enabled, horn.play]);
  const run = async (work: () => Promise<void>) => {
    setBusy(true);
    setError("");
    try {
      await work();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Network error");
    } finally {
      setBusy(false);
    }
  };
  const subscribe = () =>
    run(async () => {
      if (
        !("serviceWorker" in navigator) ||
        !("PushManager" in window) ||
        !("Notification" in window)
      )
        throw new Error("Background alerts unavailable");
      const key = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
      if (!key) throw new Error("Background alerts unavailable");
      if ((await Notification.requestPermission()) !== "granted")
        throw new Error("Background alerts unavailable");
      const registration =
        await navigator.serviceWorker.register("/ridesafe-sw.js");
      await navigator.serviceWorker.ready;
      const decoded = atob(key.replace(/-/g, "+").replace(/_/g, "/"));
      const applicationServerKey = Uint8Array.from(decoded, (char) =>
        char.charCodeAt(0),
      );
      const subscription =
        (await registration.pushManager.getSubscription()) ||
        (await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey,
        }));
      await api("/api/notifications/subscribe", subscription.toJSON());
      setPushEnabled(true);
    });
  return (
    <Workspace me={me} title={translateUi("Parent workspace")}>
      <NoticeBar message={error} retry={load} />
      <div className="portal-layout parent-portal">
        <nav
          className="transport-tabs portal-sidebar"
          aria-label={tx("Parent workspace")}
        >
          {tabs.map((item) => (
            <button
              key={item.id}
              className={tab === item.id ? "selected" : ""}
              onClick={() => {setTab(item.id);if(['messages','alerts','calendar'].includes(item.id))void activity.clear(item.id)}}
            >
              <item.icon size={20} />
              <span>{tx(item.label)}</span>
              {activity.has(item.id)&&<i className="nav-new-dot" aria-label={tx('New activity')}/>} 
              {item.id === "alerts" && notices.some((n) => !n.read) && <i />}
            </button>
          ))}
        </nav>
        <div className="portal-content">
          {arrival && (
            <div className="arrival-banner" role="alert">
              <Volume2 />
              <div>
                <strong>{tx("Bus arriving soon")}</strong>
                <p data-no-translate>{arrival}</p>
              </div>
              <button onClick={() => setArrival("")}>{tx("Close")}</button>
            </div>
          )}
          {tab === "dashboard" && (
            <>
              <section className="crew-route-card">
                <div className="bus-icon">
                  <Users size={34} />
                </div>
                <div>
                  <p className="eyebrow">{tx("Parent dashboard")}</p>
                  <h2>
                    {children.length}{" "}
                    {tx(children.length === 1 ? "child" : "children")}
                  </h2>
                  <p>
                    {tx("School transport, safety and payments in one place")}
                  </p>
                </div>
                <span
                  className={`status-pill ${tracking.some((item) => item.fresh) ? "green" : "amber"}`}
                >
                  {tx(
                    tracking.some((item) => item.fresh)
                      ? "Bus live"
                      : "No active trip",
                  )}
                </span>
              </section>
              <div className="attendance-counts">
                <div>
                  <span>{tx("Children")}</span>
                  <strong>{children.length}</strong>
                </div>
                <div>
                  <span>{tx("Active buses")}</span>
                  <strong>{tracking.length}</strong>
                </div>
                <div>
                  <span>{tx("Unread alerts")}</span>
                  <strong>{notices.filter((item) => !item.read).length}</strong>
                </div>
                <div>
                  <span>{tx("Pending confirmations")}</span>
                  <strong>
                    {
                      boardingRequests.filter(
                        (item) => item.status === "PENDING",
                      ).length
                    }
                  </strong>
                </div>
              </div>
              <div className="child-grid">
                {children.map((child) => (
                  <article className="journey-card" key={child.id}>
                    <div className="bus-title">
                      <div className="child-avatar">
                        {child.name.slice(0, 1)}
                      </div>
                      <div>
                        <h2 data-no-translate>{child.name}</h2>
                        <p data-no-translate>
                          {child.grade} · {child.studentCode}
                        </p>
                      </div>
                    </div>
                    <div className="info-row">
                      <span>{tx("Bus")}</span>
                      <strong data-no-translate>
                        {child.bus?.busNumber || child.bus?.plateNumber || "—"}
                      </strong>
                    </div>
                    <div className="info-row">
                      <span>{tx("Route")}</span>
                      <strong data-no-translate>
                        {child.route?.name || "—"}
                      </strong>
                    </div>
                    <div className="info-row">
                      <span>{tx("Driver")}</span>
                      <strong data-no-translate>
                        {child.bus?.driver?.name || "—"}
                      </strong>
                    </div>
                  </article>
                ))}
              </div>
            </>
          )}
          {tab === "calendar" && <ParentCalendar />}
          {tab === "tracking" && (
            <div className="journey-grid">
              <section>
                <div className="section-title">
                  <h2>{tx("Your child's journey")}</h2>
                  <span className="live-label">{tx("Live")}</span>
                </div>
                <div className="map-card">
                  <BusMap drivers={tracking.filter((bus) => bus.fresh)} />
                </div>
                {!tracking.length && (
                  <Empty text="Your assigned bus will appear when its trip starts." />
                )}
                {tracking.map((bus) => (
                  <article className="journey-card" key={bus.id}>
                    <div className="bus-title">
                      <div className="bus-icon">
                        <Bus />
                      </div>
                      <div>
                        <h3 data-no-translate>{bus.name}</h3>
                        <p data-no-translate>{bus.routeName}</p>
                      </div>
                      <span
                        className={`status-pill ${bus.fresh ? "green" : "amber"}`}
                      >
                        {tx(bus.fresh ? "Live" : "No recent GPS signal")}
                      </span>
                    </div>
                    {bus.targets.map((target) => (
                      <div className="arrival-row" key={target.studentId}>
                        <div>
                          <strong data-no-translate>
                            {target.studentName}
                          </strong>
                          <p>
                            <MapPin size={14} />
                            <span data-no-translate>
                              {target.stopName ||
                                tx("School assignment pending")}
                            </span>
                          </p>
                        </div>
                        <div className="eta-number">
                          {bus.fresh && target.etaMins !== null ? (
                            <>
                              {target.etaMins}
                              <small>{tx("min")}</small>
                            </>
                          ) : (
                            <small>{tx("Waiting for movement")}</small>
                          )}
                        </div>
                      </div>
                    ))}
                    <div className="crew-details">
                      <span>
                        {tx("Driver")}:{" "}
                        <b data-no-translate>{bus.driver.name}</b>
                      </span>
                      {bus.maintainer && (
                        <span>
                          {tx("Maintainer")}:{" "}
                          <b data-no-translate>{bus.maintainer.name}</b>
                        </span>
                      )}
                    </div>
                    <div className="crew-details">
                      <span>{tx("Bus")}: <b data-no-translate>{bus.bus?.busNumber || bus.bus?.plateNumber || bus.name}</b></span>
                      <span>{tx("Capacity")}: <b>{bus.bus?.capacity || "—"}</b></span>
                      <span>{tx("School")}: <b data-no-translate>{bus.organization?.name || bus.bus?.organization?.name || me?.organization?.name || "—"}</b></span>
                      {(bus.organization?.address || bus.bus?.organization?.address) && <span>{tx("Address")}: <b data-no-translate>{bus.organization?.address || bus.bus?.organization?.address}</b></span>}
                    </div>
                    {bus.lastLatitude !== null && bus.lastLongitude !== null && <p className="subtle" data-no-translate>{bus.lastLatitude.toFixed(6)}, {bus.lastLongitude.toFixed(6)} · {Math.round(bus.currentSpeedKmH || 0)} km/h</p>}
                    {bus.lastLocationUpdate && (
                      <p className="subtle">
                        {tx("Updated")}:{" "}
                        {formatDate(bus.lastLocationUpdate, locale)}
                      </p>
                    )}
                  </article>
                ))}
              </section>
              <aside>
                <div className="horn-card">
                  <div className="horn-symbol">
                    <Volume2 size={28} />
                  </div>
                  <h2>{tx("Automatic 5-minute arrival horn")}</h2>
                  <p>
                    {tx(
                      "After your first tap on this page, the horn is armed automatically and plays three times only when live tracking shows the bus is within five minutes of your child's assigned stop.",
                    )}
                  </p>
                  <button
                    className="transport-primary"
                    onClick={() =>
                      run(async () => {
                        await horn.enable();
                        horn.play();
                      })
                    }
                  >
                    {tx(horn.enabled ? "Test horn" : "Arm horn now")}
                  </button>
                  {horn.enabled && (
                    <span className="sound-status">
                      <ShieldCheck size={16} />
                      {tx("Horn enabled")}
                    </span>
                  )}
                  <p className="subtle">
                    {tx(
                      "Keep this page open for the custom horn. If the browser is closed or the phone is locked, the background push uses the phone's notification sound and a three-pulse vibration instead.",
                    )}
                  </p>
                  <button
                    className="transport-secondary"
                    disabled={busy || pushEnabled}
                    onClick={subscribe}
                  >
                    {tx(
                      pushEnabled
                        ? "Background alerts enabled"
                        : "Enable background alerts",
                    )}
                  </button>
                </div>
                <CalendarCard />
                <button
                  className="emergency-button"
                  disabled={busy}
                  onClick={() => {
                    if (
                      window.confirm(
                        tx("Send an emergency alert to the school?"),
                      )
                    )
                      void run(async () => {
                        await api("/api/emergency", {});
                        setError("Emergency alert sent");
                      });
                  }}
                >
                  <AlertTriangle />
                  {tx("Emergency SOS")}
                </button>
              </aside>
            </div>
          )}
          {tab === "children" && (
            <>
              <div className="section-title">
                <h2>{tx("Children")}</h2>
              </div>
              <div className="child-grid">
                {children.map((child) => (
                  <ChildCard
                    key={`${child.id}:${child.pickupStopId}:${child.dropoffStopId}`}
                    child={child}
                    busy={busy}
                    save={(body) =>
                      run(async () => {
                        await api(`/api/students/${child.id}`, body, "PATCH");
                        await load();
                      })
                    }
                  />
                ))}
                {!children.length && <Empty text="No students assigned" />}
              </div>
              <section className="journey-card">
                <h2>{tx("Report an issue")}</h2>
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    void run(async () => {
                      await api("/api/issues", {
                        ...issue,
                        category: "OTHER",
                        priority: "NORMAL",
                      });
                      setIssue({ subject: "", description: "" });
                      setError("Issue submitted");
                    });
                  }}
                >
                  <label>
                    {tx("Subject")}
                    <input
                      required
                      value={issue.subject}
                      maxLength={120}
                      onChange={(e) =>
                        setIssue({ ...issue, subject: e.target.value })
                      }
                    />
                  </label>
                  <label>
                    {tx("Details")}
                    <textarea
                      required
                      minLength={10}
                      maxLength={2000}
                      value={issue.description}
                      onChange={(e) =>
                        setIssue({ ...issue, description: e.target.value })
                      }
                    />
                  </label>
                  <button className="transport-primary" disabled={busy}>
                    {tx("Submit issue")}
                  </button>
                </form>
              </section>
            </>
          )}
          {tab === "attendance" && (
            <section>
              <div className="section-title">
                <h2>
                  <ClipboardCheck size={22} />
                  {tx("Parent attendance confirmation")}
                </h2>
              </div>
              <p className="subtle">
                {tx(
                  "Confirm boarding after placing your child on the assigned bus. Confirm arrival after the child reaches home. Assigned crew verifies the official bus attendance, and your school receives your confirmation.",
                )}
              </p>
              <div className="child-grid">
                {children.map((child) => {
                  const target = tracking
                    .flatMap((item) => item.targets)
                    .find((item) => item.studentId === child.id);
                  const action =
                    target?.action === "DROPPED_OFF" ||
                    target?.lastAction === "DROPPED_OFF"
                      ? "DROPPED_OFF"
                      : "PICKED_UP";
                  const request = boardingRequests.find(
                    (item) =>
                      item.studentId === child.id && item.action === action,
                  );
                  const active = Boolean(
                    target &&
                    (target.action || target.lastAction === "DROPPED_OFF"),
                  );
                  return (
                    <article className="journey-card" key={child.id}>
                      <div className="bus-title">
                        <div className="child-avatar">
                          {child.name.slice(0, 1)}
                        </div>
                        <div>
                          <h2 data-no-translate>{child.name}</h2>
                          <p data-no-translate>
                            {child.bus?.busNumber ||
                              child.bus?.plateNumber ||
                              "—"}{" "}
                            · {child.route?.name || "—"}
                          </p>
                        </div>
                        <span
                          className={`status-pill ${request?.status === "CONFIRMED" ? "green" : "amber"}`}
                        >
                          {tx(
                            request?.status === "CONFIRMED"
                              ? "Confirmed"
                              : request?.status === "PENDING"
                                ? "Crew verification pending"
                                : active
                                  ? action === "PICKED_UP"
                                    ? "Awaiting boarding"
                                    : "On the way home"
                                  : "No active trip",
                          )}
                        </span>
                      </div>
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
                      <button
                        className="transport-primary"
                        disabled={
                          busy ||
                          !active ||
                          request?.status === "PENDING" ||
                          request?.status === "CONFIRMED"
                        }
                        onClick={() =>
                          run(async () => {
                            const result = await api(
                              "/api/attendance/requests",
                              { studentId: child.id, action },
                            );
                            setBoardingRequests((previous) => [
                              result.request,
                              ...previous.filter(
                                (item) =>
                                  !(
                                    item.studentId === child.id &&
                                    item.action === action
                                  ),
                              ),
                            ]);
                            setError(
                              action === "PICKED_UP"
                                ? "Boarding confirmation sent to crew and school"
                                : "Home arrival confirmation sent to crew and school",
                            );
                          })
                        }
                      >
                        <ShieldCheck size={17} />
                        {tx(
                          action === "PICKED_UP"
                            ? "Confirm child boarded"
                            : "Confirm child arrived home",
                        )}
                      </button>
                      {request?.status === "REJECTED" && (
                        <p className="subtle">
                          {tx(
                            "The crew rejected the previous report. Check the child and submit again if needed.",
                          )}
                        </p>
                      )}
                    </article>
                  );
                })}
                {!children.length && <Empty text="No students assigned" />}
              </div>
            </section>
          )}
          {tab === "alerts" && (
            <section className="journey-card">
              <h2>{tx("Notifications")}</h2>
              {!notices.length && <Empty text="No alerts yet" />}
              {notices.map(displayNotice).map((n) => (
                <article
                  className={`alert-item ${n.read ? "" : "unread"}`}
                  key={n.id}
                >
                  <Bell size={20} />
                  <div>
                    <strong data-no-translate>{n.title}</strong>
                    <p data-no-translate>{n.body}</p>
                    <time>{formatDate(n.createdAt, locale)}</time>
                  </div>
                  {!n.read && (
                    <button
                      className="transport-secondary"
                      onClick={() =>
                        run(async () => {
                          await api(
                            "/api/notifications",
                            { id: n.id, read: true },
                            "PATCH",
                          );
                          await load();
                        })
                      }
                    >
                      {tx("Mark read")}
                    </button>
                  )}
                  <button className="icon-button" aria-label={tx("Delete")} onClick={() => { if (confirm(tx("Delete this item?"))) void run(async()=>{await api('/api/notifications',{id:n.id},'DELETE');setNotices(items=>items.filter(item=>item.id!==n.id))}) }}><Trash2 size={15}/></button>
                </article>
              ))}
            </section>
          )}
          {tab === "messages" && (
            <section className="journey-card">
              <h2>{tx("School contact")}</h2>
              <label>{tx("Chat with")}<select value={contact} onChange={e=>setContact(e.target.value)}>{contacts.map(item=><option key={item.id} value={item.id}>{tx(item.name)}</option>)}</select></label>
              <div className="message-list">
                {messages.map((m) => (
                  <div
                    className={`message-bubble ${m.sender.id === me?.id ? "mine" : ""}`}
                    key={m.id}
                  >
                    <strong data-no-translate>{m.sender.name}</strong><small>{m.sender.role === 'SCHOOL_ADMIN' ? tx('School Admin reply') : m.sender.role === 'ADMIN' ? tx('Admin reply') : tx('You')}</small>
                    <p data-no-translate>{m.content}</p>
                    <time>{formatDate(m.createdAt, locale)}</time>
                    {!m.read && m.recipient.id === me?.id && <button className="transport-secondary" onClick={()=>void run(async()=>{await api('/api/messages',{id:m.id},'PATCH');setMessages(items=>items.map(item=>item.id===m.id?{...item,read:true}:item))})}>{tx('Mark read')}</button>}
                    <button
                      className="icon-button"
                      aria-label={tx("Delete")}
                      onClick={() => {
                        if (confirm(tx("Delete this item?")))
                          void run(async () => {
                            await api("/api/messages", { id: m.id }, "DELETE");
                            setMessages(messages.filter((x) => x.id !== m.id));
                          });
                      }}
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                ))}
                {!messages.length && <Empty text="No messages yet" />}
              </div>
              <form
                className="message-compose"
                onSubmit={(e) => {
                  e.preventDefault();
                  void run(async () => {
                    await api("/api/messages", {
                      recipientId: contact,
                      content: text,
                    });
                    setText("");
                    setMessages((await api("/api/messages")).messages);
                  });
                }}
              >
                <input
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  placeholder={tx("Type a message")}
                  maxLength={2000}
                  required
                />
                <button
                  className="transport-primary"
                  disabled={busy || !contact}
                >
                  <Send size={18} />
                  {tx("Send")}
                </button>
              </form>
            </section>
          )}
          {tab === "payments" && (
            <section className="journey-card">
              <h2>
                <CreditCard size={22} />
                {tx("Payments and invoices")}
              </h2>
              <p className="subtle">
                {tx(
                  "Your school-issued transport invoices appear here. Malaysian online payment checkout can be connected without changing this page.",
                )}
              </p>
              {!payments.length && <Empty text="No invoices" />}
              {payments.map((payment) => {
                const checkout = safeCheckoutUrl(payment.checkoutUrl);
                return (
                  <article className="payment-card" key={payment.id}>
                    <div>
                      <strong>
                        <TranslatedText text={"RM "} />
                        <TranslatedText text={payment.amount.toFixed(2)} />
                      </strong>
                      <p>
                        {tx("Issued")}: {formatDate(payment.createdAt, locale)}
                        {payment.dueDate
                          ? ` · ${tx("Due")}: ${formatDate(payment.dueDate, locale)}`
                          : ""}
                      </p>
                    </div>
                    <span
                      className={`status-pill ${payment.status === "PAID" ? "green" : "amber"}`}
                    >
                      {tx(
                        payment.status === "PAID"
                          ? "Paid"
                          : payment.status === "PENDING_PROVIDER"
                            ? "Payment setup pending"
                            : "Pending",
                      )}
                    </span>
                    {payment.status !== "PAID" &&
                      (checkout ? (
                        <a
                          className="transport-primary"
                          href={checkout}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          {tx("Pay invoice")}
                          <ExternalLink size={16} />
                        </a>
                      ) : (
                        <button
                          className="transport-secondary"
                          disabled
                          title={tx(
                            "The school has not connected a payment checkout yet.",
                          )}
                        >
                          {tx("Payment setup pending")}
                        </button>
                      ))}
                  </article>
                );
              })}
              <details className="refund-policy">
                <summary>{tx("Refund Policy")}</summary>
                <ol>
                  <li>
                    <strong>{tx("Service-Based Refunds")}</strong>
                    <p>
                      {tx(
                        "All payments are generally non-refundable once service has commenced. A two month notice period is required for termination of service.",
                      )}
                    </p>
                  </li>
                  <li>
                    <strong>{tx("Before Work Commences")}</strong>
                    <p>
                      {tx(
                        "Refund requests made before any work begins may be eligible for a partial or full refund, subject to administrative and processing fees.",
                      )}
                    </p>
                  </li>
                  <li>
                    <strong>{tx("Change of Mind")}</strong>
                    <p>
                      {tx(
                        "Refunds will not be provided for change of mind, delays caused by clients, or misunderstandings of the service scope.",
                      )}
                    </p>
                  </li>
                  <li>
                    <strong>{tx("Duplicate Payments")}</strong>
                    <p>
                      {tx(
                        "Duplicate payments will be refunded after verification.",
                      )}
                    </p>
                  </li>
                  <li>
                    <strong>{tx("Exceptional Cases")}</strong>
                    <p>
                      {tx(
                        "Refunds may be considered on a case-by-case basis if the service cannot be delivered due to our fault.",
                      )}
                    </p>
                  </li>
                  <li>
                    <strong>{tx("Refund Processing")}</strong>
                    <p>
                      {tx(
                        "Approved refunds will be processed within 7–14 working days.",
                      )}
                    </p>
                  </li>
                  <li>
                    <strong>{tx("Contact")}</strong>
                    <p>
                      {tx(
                        "Contact us by email or WhatsApp. You can also use the Messages section to contact your school.",
                      )}
                    </p>
                  </li>
                </ol>
              </details>
            </section>
          )}
          {tab === "history" && (
            <section className="journey-card">
              <h2>{tx("Student attendance")}</h2>
              {!history.length && <Empty text="No attendance records" />}
              {history.map((trip) => (
                <article className="history-entry" key={trip.id}>
                  <h3 data-no-translate>{trip.routeName}</h3>
                  <button className="history-delete" onClick={()=>void run(async()=>{await api('/api/trips/history',{id:trip.id},'DELETE');setHistory(items=>items.filter(item=>item.id!==trip.id))})}><Trash2 size={15}/>{tx('Delete from history')}</button>
                  {trip.attendance.map((a, index) => (
                    <div className="attendance-history" key={index}>
                      <strong data-no-translate>{a.studentName}</strong>
                      <span>
                        {tx(
                          a.action === "PICKED_UP"
                            ? "Boarded"
                            : a.action === "DROPPED_OFF"
                              ? "Dropped off"
                              : "Absent",
                        )}
                      </span>
                      <time>{formatDate(a.timestamp, locale)}</time>
                    </div>
                  ))}
                </article>
              ))}
            </section>
          )}
        </div>
      </div>
    </Workspace>
  );
}
function ChildCard({
  child,
  busy,
  save,
}: {
  child: Child;
  busy: boolean;
  save: (body: object) => void;
}) {
  const { tx } = useTranslation(),
    [pickup, setPickup] = useState(child.pickupStopId || ""),
    [dropoff, setDropoff] = useState(child.dropoffStopId || "");
  return (
    <article className="journey-card">
      <div className="bus-title">
        <div className="child-avatar" data-no-translate>
          {child.name.slice(0, 1)}
        </div>
        <div>
          <h2 data-no-translate>{child.name}</h2>
          <p data-no-translate>
            {child.grade} · {child.studentCode}
          </p>
        </div>
      </div>
      {child.bus && (
        <p data-no-translate>
          {child.bus.busNumber || child.bus.plateNumber} · {child.route?.name}
        </p>
      )}
      {child.route?.stops.length ? (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            save({ pickupStopId: pickup, dropoffStopId: dropoff });
          }}
        >
          <p>{tx("Choose your child's assigned stops")}</p>
          {[
            ["Pickup stop", pickup, setPickup],
            ["Drop-off stop", dropoff, setDropoff],
          ].map(([label, value, setter]) => (
            <label key={label as string}>
              {tx(label as string)}
              <select
                required
                value={value as string}
                onChange={(e) =>
                  (setter as (s: string) => void)(e.target.value)
                }
              >
                <option value="">{tx("Choose a stop")}</option>
                {child.route!.stops.map((stop) => (
                  <option key={stop.id} value={stop.id} data-no-translate>
                    {stop.name}
                  </option>
                ))}
              </select>
            </label>
          ))}
          <button className="transport-primary" disabled={busy}>
            {tx("Save stops")}
          </button>
        </form>
      ) : (
        <Empty text="Contact the school to assign a bus and route." />
      )}
      {child.bus?.maintainer?.phone && (
        <a className="contact-link" href={`tel:${child.bus.maintainer.phone}`}>
          <Phone size={16} />
          {tx("Maintainer")}:{" "}
          <span data-no-translate>{child.bus.maintainer.name}</span>
        </a>
      )}
    </article>
  );
}
