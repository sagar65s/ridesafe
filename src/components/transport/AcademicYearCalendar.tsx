"use client";
import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useTranslation } from "@/i18n/provider";

export type CalendarEvent = {
  id: string;
  title: string;
  description?: string | null;
  startDate: string;
  endDate?: string | null;
  type: string;
  color?: string | null;
};

const DAY = 86400000;
function localDay(value: string) {
  return new Date(value).toLocaleDateString("en-CA", {
    timeZone: "Asia/Kuala_Lumpur",
  });
}
export default function AcademicYearCalendar({
  events,
}: {
  events: CalendarEvent[];
}) {
  const { tx, locale } = useTranslation(),
    currentYear = Number(localDay(new Date().toISOString()).slice(0, 4));
  const available = events
    .map((event) => Number(localDay(event.startDate).slice(0, 4)))
    .filter(Number.isFinite);
  const [year, setYear] = useState(
    available.includes(currentYear)
      ? currentYear
      : available.at(-1) || currentYear,
  );
  const today = localDay(new Date().toISOString());
  const months = useMemo(
    () =>
      Array.from({ length: 12 }, (_, month) => {
        const first = new Date(Date.UTC(year, month, 1)),
          days = new Date(Date.UTC(year, month + 1, 0)).getUTCDate(),
          offset = (first.getUTCDay() + 6) % 7;
        return {
          month,
          name: first.toLocaleDateString(
            locale === "ms" ? "ms-MY" : locale === "zh" ? "zh-CN" : "en-MY",
            { month: "long", timeZone: "UTC" },
          ),
          cells: Array.from({ length: 42 }, (_, index) =>
            index < offset || index >= offset + days
              ? null
              : index - offset + 1,
          ),
        };
      }),
    [year, locale],
  );
  const eventMap = useMemo(() => {
    const map = new Map<string, CalendarEvent[]>();
    for (const event of events) {
      let cursor = new Date(`${localDay(event.startDate)}T00:00:00Z`);
      const end = new Date(
        `${localDay(event.endDate || event.startDate)}T00:00:00Z`,
      );
      for (
        let guard = 0;
        cursor <= end && guard < 370;
        guard++, cursor = new Date(cursor.getTime() + DAY)
      ) {
        const key = cursor.toISOString().slice(0, 10);
        map.set(key, [...(map.get(key) || []), event]);
      }
    }
    return map;
  }, [events]);
  return (
    <div className="academic-year-calendar">
      <div className="calendar-year-controls">
        <button
          className="icon-button"
          onClick={() => setYear(year - 1)}
          aria-label={tx("Previous year")}
        >
          <ChevronLeft />
        </button>
        <strong>{year}</strong>
        <button
          className="icon-button"
          onClick={() => setYear(year + 1)}
          aria-label={tx("Next year")}
        >
          <ChevronRight />
        </button>
      </div>
      <div className="academic-month-grid">
        {months.map(({ month, name, cells }) => (
          <section className="academic-month" key={month}>
            <h3>{name}</h3>
            <div className="weekday-row">
              {["M", "T", "W", "T", "F", "S", "S"].map((day, index) => (
                <span key={`${day}${index}`}>{day}</span>
              ))}
            </div>
            <div className="month-days">
              {cells.map((day, index) => {
                if (!day) return <span key={`blank${index}`} />;
                const key = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`,
                  items = eventMap.get(key) || [],
                  weekend = index % 7 >= 5;
                return (
                  <span
                    key={key}
                    className={`${weekend ? "weekend " : ""}${key === today ? "today " : ""}${items.length ? "has-event" : ""}`}
                    title={items.map((item) => item.title).join(", ")}
                    aria-label={items.length ? `${key}: ${items.map((item) => `${item.type} - ${item.title}`).join(", ")}` : key}
                    style={items.length ? { borderBottom: `3px solid ${items[0].color || "#4f8cff"}` } : undefined}
                  >
                    {day}
                    <i>
                      {items.slice(0, 4).map((item) => (
                        <b
                          key={item.id}
                          style={{ background: item.color || "#4f8cff" }}
                        />
                      ))}
                    </i>
                  </span>
                );
              })}
            </div>
          </section>
        ))}
      </div>
      <div className="calendar-legend">
        <span>
          <i className="weekend" />
          {tx("Weekend")}
        </span>
        <span>
          <i className="event" />
          {tx("Event")}
        </span>
        <span>
          <i className="today" />
          {tx("Today")}
        </span>
      </div>
    </div>
  );
}
