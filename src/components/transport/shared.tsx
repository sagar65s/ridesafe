"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { LanguageSwitcher, useTranslation } from "@/i18n/provider";
import RideSafeLogo from "@/components/RideSafeLogo";
import { LogOut, RefreshCw } from "lucide-react";
import type { ReactNode } from "react";
import { formatRideSafeDate, formatRideSafeDateTime } from "@/lib/date-format";
export type Person = {
  id: string;
  name: string;
  phone?: string;
  email?: string;
  role: string;
  organization?: { name: string };
  personnelType?: string;
};
export type Stop = {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  order: number;
};
export type Child = {
  id: string;
  name: string;
  grade: string;
  studentCode?: string;
  parentId?: string;
  routeId?: string;
  busId?: string;
  pickupStopId?: string;
  dropoffStopId?: string;
  isSelfPickup?: boolean;
  selfPickupSession?: string | null;
  pickupStop?: Stop;
  dropoffStop?: Stop;
  route?: { id: string; name: string; stops: Stop[] };
  bus?: {
    plateNumber: string;
    busNumber?: string;
    driver?: Person;
    maintainer?: Person;
    organization?: { id: string; name: string; address?: string; phone?: string };
  };
};
export type Notice = {
  id: string;
  title: string;
  body: string;
  type: string;
  read: boolean;
  createdAt: string;
  metadata?: string;
};
export type Tracking = {
  id: string;
  name: string;
  tripId: string;
  busId: string;
  fresh: boolean;
  routeName: string;
  lastLatitude: number | null;
  lastLongitude: number | null;
  lastLocationUpdate?: string;
  currentSpeedKmH: number;
  driver: Person;
  maintainer?: Person;
  bus?: {
    id: string;
    plateNumber: string;
    busNumber?: string;
    capacity: number;
    organization?: { id: string; name: string; address?: string; phone?: string };
  };
  organization?: { id: string; name: string; address?: string; phone?: string };
  targets: {
    studentId: string;
    studentName: string;
    stopName?: string;
    action?: string | null;
    lastAction?: string | null;
    etaMins: number | null;
  }[];
};
export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly data: Record<string, unknown>,
  ) {
    super(message);
  }
}
export async function api(path: string, body?: object, method = "POST") {
  const response = await fetch(
    path,
    body === undefined
      ? { cache: "no-store" }
      : {
          method,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        },
  );
  const data = await response.json().catch(() => ({}));
  if (!response.ok)
    throw new ApiError(
      response.status === 401
        ? "Please sign in again"
        : data.error || "Unable to load data",
      response.status,
      data,
    );
  return data;
}
export function useAccount(role: string) {
  const [me, setMe] = useState<Person | null>(null),
    router = useRouter();
  useEffect(() => {
    api("/api/auth/me")
      .then((data) => {
        if (data.user.role !== role) router.replace("/");
        else setMe(data.user);
      })
      .catch(() => router.replace("/"));
  }, [role, router]);
  return me;
}
function activityMatches(section:string,type:string){return section==='messages'?type==='MESSAGE':section==='calendar'?type.includes('CALENDAR'):section==='maintenance'?type.includes('MAINTENANCE'):['alerts','overview'].includes(section)?type!=='MESSAGE':false}
export function useUnreadActivity(){
  const [types,setTypes]=useState<string[]>([])
  const load=useCallback(()=>api('/api/notifications').then(data=>setTypes((data.notifications||[]).filter((item:Notice)=>!item.read).map((item:Notice)=>item.type))).catch(()=>{}),[])
  useEffect(()=>{void load();const timer=window.setInterval(load,10000);return()=>window.clearInterval(timer)},[load])
  const has=useCallback((section:string)=>types.some(type=>activityMatches(section,type)),[types])
  const clear=useCallback(async(section:string)=>{const selected=types.filter(type=>activityMatches(section,type));if(!selected.length)return;await api('/api/notifications',{markAll:true,types:[...new Set(selected)]},'PATCH').catch(()=>{});setTypes(items=>items.filter(type=>!selected.includes(type)))},[types])
  return {has,clear,reload:load}
}
export function Workspace({
  me,
  title,
  children,
}: {
  me: Person | null;
  title: string;
  children: ReactNode;
}) {
  const { tx } = useTranslation(),
    router = useRouter();
  const logout = async () => {
    if ("serviceWorker" in navigator) {
      const registration = await navigator.serviceWorker.getRegistration();
      const subscription = await registration?.pushManager?.getSubscription();
      if (subscription) {
        await api(
          "/api/notifications/subscribe",
          { endpoint: subscription.endpoint },
          "DELETE",
        ).catch(() => {});
        await subscription.unsubscribe();
      }
    }
    await api("/api/auth/me", {});
    router.replace("/");
  };
  return (
    <div className="transport-shell">
      <header className="transport-header">
        <RideSafeLogo />
        <div className="transport-school" data-no-translate>
          {me?.organization?.name || "RideSafe"}
        </div>
        <LanguageSwitcher />
        <button
          className="icon-button logout-button"
          onClick={logout}
          aria-label={tx("Log out")}
        >
          <LogOut size={20} />
        </button>
      </header>
      <main className="transport-main">
        <div className="transport-heading">
          <div>
            <p className="eyebrow">{tx(title)}</p>
            <h1 data-no-translate>{me?.name || "RideSafe"}</h1>
          </div>
          <span className="date-label">
            {formatRideSafeDate(new Date())}
          </span>
        </div>
        {children}
      </main>
    </div>
  );
}
export function Empty({ text }: { text: string }) {
  const { tx } = useTranslation();
  return <div className="transport-empty">{tx(text)}</div>;
}
export function NoticeBar({
  message,
  retry,
}: {
  message: string;
  retry?: () => void;
}) {
  const { tx } = useTranslation();
  return message ? (
    <div className="notice-bar" role="status">
      {tx(message)}
      {retry && (
        <button onClick={retry}>
          <RefreshCw size={16} />
          {tx("Retry")}
        </button>
      )}
    </div>
  ) : null;
}
export function useHorn() {
  const context = useRef<AudioContext | null>(null),
    buffer = useRef<AudioBuffer | null>(null),
    arming = useRef<Promise<AudioBuffer> | null>(null);
  const [enabled, setEnabled] = useState(false);
  const enable = useCallback(async () => {
    if (!context.current) context.current = new AudioContext();
    await context.current.resume();
    if (!buffer.current) {
      if (!arming.current)
        arming.current = (async () => {
          const response = await fetch("/bus-horn.mp3");
          if (!response.ok)
            throw new Error("Arrival horn audio is unavailable");
          return context.current!.decodeAudioData(await response.arrayBuffer());
        })();
      try {
        buffer.current = await arming.current;
      } finally {
        arming.current = null;
      }
    }
    setEnabled(true);
  }, []);
  const play = useCallback(() => {
    if (
      !context.current ||
      !buffer.current ||
      context.current.state !== "running"
    )
      return false;
    const duration = Math.min(buffer.current.duration, 2.5);
    for (let i = 0; i < 3; i++) {
      const source = context.current.createBufferSource();
      source.buffer = buffer.current;
      source.connect(context.current.destination);
      source.start(
        context.current.currentTime + i * (duration + 0.4),
        0,
        duration,
      );
    }
    return true;
  }, []);
  useEffect(
    () => () => {
      void context.current?.close();
    },
    [],
  );
  return { enabled, enable, play };
}
export function formatDate(value: string, locale: string) {
  void locale;
  return formatRideSafeDateTime(value);
}
