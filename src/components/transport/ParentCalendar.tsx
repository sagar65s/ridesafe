"use client";
import { useEffect, useState } from "react";
import { CalendarDays } from "lucide-react";
import { useTranslation } from "@/i18n/provider";
import { api, Empty, NoticeBar } from "./shared";
import AcademicYearCalendar, {
  type CalendarEvent,
} from "./AcademicYearCalendar";
import { formatRideSafeDate } from "@/lib/date-format";
type Event = CalendarEvent;
export default function ParentCalendar() {
  const { tx } = useTranslation();
  const [events, setEvents] = useState<Event[]>([]),
    [error, setError] = useState(""),
    [month, setMonth] = useState("");
  useEffect(() => {
    let active = true;
    const refresh = () =>
      api("/api/calendar")
        .then((data) => {
          if (active) {
            setEvents(data.events || []);
            setError("");
          }
        })
        .catch((e) => {
          if (active) setError(e.message);
        });
    void refresh();
    const timer = setInterval(refresh, 30000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, []);
  const format = (date: string) =>
    formatRideSafeDate(date);
  const visible = events.filter(
    (e) =>
      !month ||
      (e.startDate.slice(0, 7) <= month &&
        (e.endDate || e.startDate).slice(0, 7) >= month),
  );
  return (
    <section className="journey-card academic-calendar-card">
      <h2>
        <CalendarDays />
        {tx("Academic Calendar")}
      </h2>
      <p>{tx("School holidays, festivals and events")}</p>
      <NoticeBar message={error} />
      <AcademicYearCalendar events={events} />
      <label>
        {tx("Filter event list by month")}
        <input
          type="month"
          value={month}
          onChange={(e) => setMonth(e.target.value)}
        />
      </label>
      {!visible.length && <Empty text="No academic events scheduled yet." />}
      {visible.map((event) => (
        <article key={event.id} className="arrival-row">
          <div>
            <span className="status-pill amber">{tx(event.type)}</span>
            <h3>{event.title}</h3>
            <p>
              {format(event.startDate)}
              {event.endDate && ` — ${format(event.endDate)}`}
            </p>
            {event.description && <p>{event.description}</p>}
          </div>
        </article>
      ))}
    </section>
  );
}
