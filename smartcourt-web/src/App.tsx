import { useEffect, useState, type FormEvent } from "react";
import axios from "axios";
import {
  Calendar,
  Clock,
  Trash2,
  PlusCircle,
  RefreshCw,
  Send,
  ShieldCheck,
  User,
  Sparkles,
  Mail,
  CheckCircle2,
  AlertCircle,
  Copy,
  ClipboardPaste,
  ChevronLeft,
  ChevronRight,
  X,
  Phone,
  CreditCard,
  Repeat,
  Info,
  Search,
} from "lucide-react";

const API_BASE = "http://127.0.0.1:8000";

interface Court {
  id: number;
  name: string;
}

interface Booking {
  id: number;
  court_id: number;
  user_id: number;
  start_time: string;
  end_time: string;
  sport_type: string;
  comment?: string;
  user_email?: string;
  user_phone?: string;
  user_bank_account?: string;
}

interface CopiedBookingTemplate {
  sport_type: string;
  client_email: string;
  client_phone: string;
  client_bank_account: string;
  comment: string;
  startTimeStr: string;
  durationMins: number;
  court_id: number;
  sourceLabel: string;
}

interface SimulationResponse {
  sender: string;
  detected_intents: string[];
  extracted_date: string | null;
  date_status: string;
  extracted_time: string | null;
  duration_minutes: number;
  booking_id: number | null;
  action: string;
  generated_reply: {
    subject: string;
    body: string;
  } | null;
}

const SPORT_LABELS: Record<
  string,
  { label: string; short: string; badge: string; cardBg: string }
> = {
  beach_volleyball: {
    label: "🏐 Rannavõrkpall",
    short: "🏐 Rannavõrkpall",
    badge: "bg-amber-100 text-amber-800 border-amber-300",
    cardBg:
      "bg-gradient-to-br from-amber-50 to-orange-50 border-amber-400 text-amber-950 shadow-xs",
  },
  beach_tennis: {
    label: "🎾 Rannatennis",
    short: "🎾 Rannatennis",
    badge: "bg-emerald-100 text-emerald-800 border-emerald-300",
    cardBg:
      "bg-gradient-to-br from-emerald-50 to-teal-50 border-emerald-400 text-emerald-950 shadow-xs",
  },
  beach_football: {
    label: "⚽ Rannajalgpall",
    short: "⚽ Rannajalgpall",
    badge: "bg-sky-100 text-sky-800 border-sky-300",
    cardBg:
      "bg-gradient-to-br from-sky-50 to-blue-50 border-sky-400 text-sky-950 shadow-xs",
  },
};

// Half-hour slots from 08:00 to 21:30
const TIME_SLOTS = Array.from({ length: 28 }, (_, i) => {
  const totalMinutes = 8 * 60 + i * 30;
  const h = String(Math.floor(totalMinutes / 60)).padStart(2, "0");
  const m = String(totalMinutes % 60).padStart(2, "0");
  return `${h}:${m}`;
});

const DURATION_OPTIONS = [
  { value: 60, label: "1 tund (60 min)" },
  { value: 90, label: "1.5 tundi (90 min)" },
  { value: 120, label: "2 tundi (120 min)" },
  { value: 180, label: "3 tundi (180 min)" },
];

const getTodayStr = () => {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
};

const addDaysToDateStr = (dateStr: string, daysToAdd: number) => {
  const d = new Date(`${dateStr}T12:00:00`);
  d.setDate(d.getDate() + daysToAdd);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
};

const addMinutesToTime = (timeStr: string, minsToAdd: number): string => {
  const [h, m] = timeStr.split(":").map(Number);
  const total = h * 60 + m + minsToAdd;
  const endH = String(Math.floor(total / 60)).padStart(2, "0");
  const endM = String(total % 60).padStart(2, "0");
  return `${endH}:${endM}`;
};

export default function App() {
  const todayStr = getTodayStr();
  const [activeTab, setActiveTab] = useState<"admin" | "client">("admin");

  // Database states
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [courts, setCourts] = useState<Court[]>([]);
  const [loading, setLoading] = useState(false);
  const [apiError, setApiError] = useState<string | null>(null);

  // Selected date for timetable (never before today)
  const [selectedDate, setSelectedDate] = useState<string>(todayStr);

  // New court input
  const [newCourtName, setNewCourtName] = useState("");

  // Admin Bookings Table Filters (Future only + Name/Email + Date)
  const [tableSearchQuery, setTableSearchQuery] = useState<string>("");
  const [tableDateFilter, setTableDateFilter] = useState<string>("");
  const [showPastBookings, setShowPastBookings] = useState<boolean>(false);

  // Interactive Booking Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [bookingDate, setBookingDate] = useState<string>(todayStr);
  const [bookingCourtId, setBookingCourtId] = useState<number>(1);
  const [bookingStartTime, setBookingStartTime] = useState<string>("18:00");
  const [bookingDuration, setBookingDuration] = useState<number>(90);
  const [bookingSport, setBookingSport] = useState<string>("beach_volleyball");
  const [bookingEmail, setBookingEmail] = useState<string>("");
  const [bookingPhone, setBookingPhone] = useState<string>("");
  const [bookingBank, setBookingBank] = useState<string>("");
  const [bookingComment, setBookingComment] = useState<string>("");

  // Admin-only weekly recurring states
  const [repeatWeekly, setRepeatWeekly] = useState<boolean>(false);
  const [repeatUntil, setRepeatUntil] = useState<string>(
    addDaysToDateStr(todayStr, 28)
  );

  // Selected Booking Details Modal (Admin inspection)
  const [inspectedBooking, setInspectedBooking] = useState<Booking | null>(
    null
  );

  // Copy-Paste Clipboard States
  const [copiedSingle, setCopiedSingle] =
    useState<CopiedBookingTemplate | null>(null);
  const [copiedDayBatch, setCopiedDayBatch] = useState<{
    sourceDate: string;
    items: CopiedBookingTemplate[];
  } | null>(null);
  const [toastMsg, setToastMsg] = useState<string | null>(null);

  // Client AI Simulator state
  const [clientEmail, setClientEmail] = useState("");
  const [emailSubject, setEmailSubject] = useState("");
  const [emailBody, setEmailBody] = useState("");
  const [sendRealEmail, setSendRealEmail] = useState(false);
  const [aiResult, setAiResult] = useState<SimulationResponse | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const showToast = (msg: string) => {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(null), 4500);
  };

  const fetchDashboardData = async () => {
    setLoading(true);
    setApiError(null);
    try {
      const [bookingsRes, courtsRes] = await Promise.all([
        axios
          .get<Booking[]>(`${API_BASE}/bookings/details/`)
          .catch(() => axios.get<Booking[]>(`${API_BASE}/bookings/`)),
        axios.get<Court[]>(`${API_BASE}/courts/`),
      ]);

      const sorted = [...bookingsRes.data].sort(
        (a, b) =>
          new Date(a.start_time).getTime() - new Date(b.start_time).getTime()
      );
      setBookings(sorted);
      setCourts(courtsRes.data);

      if (
        courtsRes.data.length > 0 &&
        !courtsRes.data.some((c) => c.id === bookingCourtId)
      ) {
        setBookingCourtId(courtsRes.data[0].id);
      }
    } catch (err) {
      console.error("Failed to load data from API:", err);
      setApiError(
        "Ei saanud FastAPI serveriga (http://127.0.0.1:8000) ühendust. Veendu, et uvicorn töötab!"
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDashboardData();
  }, []);

  const getCourtName = (courtId: number) => {
    const found = courts.find((c) => c.id === courtId);
    return found ? found.name : `Väljak #${courtId}`;
  };

  const formatDate = (iso: string) => {
    const d = new Date(iso);
    return d.toLocaleDateString("et-EE", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    });
  };

  const formatTime = (iso: string) => {
    const d = new Date(iso);
    return d.toLocaleTimeString("et-EE", {
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const isSlotInPast = (dateStr: string, slotTime: string): boolean => {
    if (dateStr < todayStr) return true;
    if (dateStr > todayStr) return false;
    const now = new Date();
    const slotDt = new Date(`${dateStr}T${slotTime}:00`);
    return slotDt.getTime() <= now.getTime();
  };

  const shiftSelectedDate = (days: number) => {
    const nextDate = addDaysToDateStr(selectedDate, days);
    if (nextDate < todayStr) return;
    setSelectedDate(nextDate);
    setBookingDate(nextDate);
  };

  const isIntervalAvailable = (
    dateStr: string,
    courtId: number,
    startTimeStr: string,
    durationMins: number
  ): boolean => {
    if (isSlotInPast(dateStr, startTimeStr)) return false;

    const endTimeStr = addMinutesToTime(startTimeStr, durationMins);
    const reqStart = new Date(`${dateStr}T${startTimeStr}:00`).getTime();
    const reqEnd = new Date(`${dateStr}T${endTimeStr}:00`).getTime();

    for (const b of bookings) {
      if (b.court_id !== courtId) continue;
      if (!b.start_time.startsWith(dateStr)) continue;
      const bStart = new Date(b.start_time).getTime();
      const bEnd = new Date(b.end_time).getTime();
      if (reqStart < bEnd && reqEnd > bStart) {
        return false;
      }
    }
    return true;
  };

  const createBookingInDb = async (payload: {
    courtId: number;
    dateStr: string;
    startTimeStr: string;
    durationMins: number;
    sportType: string;
    emailStr: string;
    phoneStr?: string;
    bankStr?: string;
    commentStr?: string;
    repeatWeekly?: boolean;
    repeatUntil?: string;
    sendEmail?: boolean;
  }) => {
    const endTimeStr = addMinutesToTime(
      payload.startTimeStr,
      payload.durationMins
    );
    const startIso = `${payload.dateStr}T${payload.startTimeStr}:00`;
    const endIso = `${payload.dateStr}T${endTimeStr}:00`;

    return await axios.post(`${API_BASE}/bookings/manual/`, {
      court_id: payload.courtId,
      client_email: payload.emailStr,
      client_phone: payload.phoneStr || "",
      client_bank_account: activeTab === "admin" ? payload.bankStr || "" : "",
      start_time: startIso,
      end_time: endIso,
      sport_type: payload.sportType,
      comment: payload.commentStr || "",
      repeat_weekly:
        activeTab === "admin" ? Boolean(payload.repeatWeekly) : false,
      repeat_until:
        activeTab === "admin" && payload.repeatWeekly
          ? payload.repeatUntil
          : null,
      send_confirmation_email: payload.sendEmail ?? true,
    });
  };

  const handleModalBookingSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!bookingEmail.trim()) {
      alert("Palun sisesta e-posti aadress!");
      return;
    }
    setSubmitting(true);
    try {
      const res = await createBookingInDb({
        courtId: bookingCourtId,
        dateStr: bookingDate,
        startTimeStr: bookingStartTime,
        durationMins: bookingDuration,
        sportType: bookingSport,
        emailStr: bookingEmail.trim(),
        phoneStr: bookingPhone.trim(),
        bankStr: activeTab === "admin" ? bookingBank.trim() : "",
        commentStr: bookingComment.trim(),
        repeatWeekly: activeTab === "admin" && repeatWeekly,
        repeatUntil: repeatUntil,
      });

      const createdCount = res.data?.created_count || 1;
      setSelectedDate(bookingDate);
      setIsModalOpen(false);
      setBookingComment("");
      setRepeatWeekly(false);

      if (createdCount > 1) {
        showToast(
          `✅ Loodud ${createdCount} iganädalast broneeringut (${getCourtName(bookingCourtId)} kell ${bookingStartTime})!`
        );
      } else {
        showToast(
          `✅ Broneering kinnitatud: ${getCourtName(bookingCourtId)} (${bookingDate} kell ${bookingStartTime}–${addMinutesToTime(bookingStartTime, bookingDuration)})`
        );
      }
      await fetchDashboardData();
    } catch (err: any) {
      alert(
        err?.response?.data?.detail ||
          "Viga broneeringu lisamisel (kontrolli, kas aeg on vaba)."
      );
    } finally {
      setSubmitting(false);
    }
  };

  const handleGridCellClick = async (courtId: number, slotTime: string) => {
    if (isSlotInPast(selectedDate, slotTime)) return;
    const courtName = getCourtName(courtId);

    if (activeTab === "admin" && copiedSingle) {
      const endStr = addMinutesToTime(slotTime, copiedSingle.durationMins);
      const confirmPaste = window.confirm(
        `Kleebi kopeeritud broneering (${copiedSingle.sourceLabel})?\n\n` +
          `🏟️ Väljak: ${courtName}\n` +
          `📅 Kuupäev: ${selectedDate}\n` +
          `⏰ Kellaaeg: ${slotTime} – ${endStr}\n` +
          `👤 Klient: ${copiedSingle.client_email}`
      );
      if (confirmPaste) {
        try {
          await createBookingInDb({
            courtId,
            dateStr: selectedDate,
            startTimeStr: slotTime,
            durationMins: copiedSingle.durationMins,
            sportType: copiedSingle.sport_type,
            emailStr: copiedSingle.client_email,
            phoneStr: copiedSingle.client_phone,
            bankStr: copiedSingle.client_bank_account,
            commentStr: copiedSingle.comment,
          });
          showToast(`📋 Broneering kleebitud: ${courtName} kell ${slotTime}`);
          fetchDashboardData();
        } catch (err: any) {
          alert(err?.response?.data?.detail || "See aeg on juba hõivatud!");
        }
      }
      return;
    }

    setBookingDate(selectedDate);
    setBookingCourtId(courtId);
    setBookingStartTime(slotTime);
    setRepeatWeekly(false);
    setRepeatUntil(addDaysToDateStr(selectedDate, 28));

    if (isIntervalAvailable(selectedDate, courtId, slotTime, 90)) {
      setBookingDuration(90);
    } else {
      setBookingDuration(60);
    }
    setIsModalOpen(true);
  };

  const handleCopyBooking = (b: Booking) => {
    const startObj = new Date(b.start_time);
    const endObj = new Date(b.end_time);
    const durationMins = Math.round(
      (endObj.getTime() - startObj.getTime()) / 60000
    );
    const startTimeStr = formatTime(b.start_time);
    const emailStr = b.user_email || `kasutaja_${b.user_id}@smartcourt.ee`;

    setCopiedSingle({
      sport_type: b.sport_type,
      client_email: emailStr,
      client_phone: b.user_phone || "",
      client_bank_account: b.user_bank_account || "",
      comment: b.comment || "",
      startTimeStr,
      durationMins,
      court_id: b.court_id,
      sourceLabel: `${getCourtName(b.court_id)} ${startTimeStr} (${durationMins} min)`,
    });
    showToast(
      `📋 Kopeeritud! Vali kalendrist uus päev ja kliki "Kleebi samale ajale" või vabale lahtrile.`
    );
  };

  const handlePasteSingleToCurrentDate = async () => {
    if (!copiedSingle) return;
    try {
      await createBookingInDb({
        courtId: copiedSingle.court_id,
        dateStr: selectedDate,
        startTimeStr: copiedSingle.startTimeStr,
        durationMins: copiedSingle.durationMins,
        sportType: copiedSingle.sport_type,
        emailStr: copiedSingle.client_email,
        phoneStr: copiedSingle.client_phone,
        bankStr: copiedSingle.client_bank_account,
        commentStr: copiedSingle.comment,
      });
      showToast(
        `✅ Kleebitud kuupäevale ${selectedDate} (${copiedSingle.sourceLabel})!`
      );
      fetchDashboardData();
    } catch (err: any) {
      alert(
        err?.response?.data?.detail ||
          "Sellel kuupäeval ja kellaajal on väljak juba hõivatud või möödas!"
      );
    }
  };

  const handleCopyEntireDay = () => {
    const dayBookings = bookings.filter((b) =>
      b.start_time.startsWith(selectedDate)
    );
    if (dayBookings.length === 0) {
      alert("Valitud kuupäeval pole ühtegi broneeringut, mida kopeerida.");
      return;
    }
    const items: CopiedBookingTemplate[] = dayBookings.map((b) => {
      const startObj = new Date(b.start_time);
      const endObj = new Date(b.end_time);
      const durationMins = Math.round(
        (endObj.getTime() - startObj.getTime()) / 60000
      );
      return {
        sport_type: b.sport_type,
        client_email: b.user_email || `kasutaja_${b.user_id}@smartcourt.ee`,
        client_phone: b.user_phone || "",
        client_bank_account: b.user_bank_account || "",
        comment: b.comment || "",
        startTimeStr: formatTime(b.start_time),
        durationMins,
        court_id: b.court_id,
        sourceLabel: `${getCourtName(b.court_id)} ${formatTime(b.start_time)}`,
      };
    });

    setCopiedDayBatch({ sourceDate: selectedDate, items });
    showToast(
      `📅 Kopeeritud ${items.length} broneeringut kuupäevalt ${selectedDate}! Vali uus kuupäev ja vajuta "Kleebi päev".`
    );
  };

  const handlePasteEntireDay = async () => {
    if (!copiedDayBatch) return;
    if (copiedDayBatch.sourceDate === selectedDate) {
      alert("Vali kleepimiseks mõni teine kuupäev!");
      return;
    }
    let successCount = 0;
    let skippedCount = 0;

    setLoading(true);
    for (const item of copiedDayBatch.items) {
      try {
        await createBookingInDb({
          courtId: item.court_id,
          dateStr: selectedDate,
          startTimeStr: item.startTimeStr,
          durationMins: item.durationMins,
          sportType: item.sport_type,
          emailStr: item.client_email,
          phoneStr: item.client_phone,
          bankStr: item.client_bank_account,
          commentStr: item.comment,
        });
        successCount++;
      } catch {
        skippedCount++;
      }
    }
    await fetchDashboardData();
    setLoading(false);
    showToast(
      `✅ Kleebitud ${successCount} broneeringut kuupäevale ${selectedDate}` +
        (skippedCount > 0 ? ` (${skippedCount} vahele jäetud)` : "")
    );
  };

  const handleDeleteBooking = async (id: number) => {
    if (
      !window.confirm(`Kas oled kindel, et soovid broneeringu #${id} tühistada?`)
    ) {
      return;
    }
    try {
      await axios.delete(`${API_BASE}/bookings/${id}`);
      setBookings((prev) => prev.filter((b) => b.id !== id));
      if (inspectedBooking?.id === id) setInspectedBooking(null);
      showToast(`🗑️ Broneering #${id} tühistatud.`);
    } catch {
      alert("Viga broneeringu kustutamisel.");
    }
  };

  const handleCreateCourt = async (e: FormEvent) => {
    e.preventDefault();
    if (!newCourtName.trim()) return;
    try {
      await axios.post(`${API_BASE}/courts/`, {
        name: newCourtName.trim(),
      });
      setNewCourtName("");
      fetchDashboardData();
      showToast(`🏟️ Väljak "${newCourtName.trim()}" lisatud!`);
    } catch {
      alert("Väljaku lisamine ebaõnnestus.");
    }
  };

  const handleTriggerInboxCheck = async () => {
    setLoading(true);
    try {
      await axios.post(`${API_BASE}/process-emails/`);
      await fetchDashboardData();
      showToast("📨 Gmaili postkast kontrollitud!");
    } catch (err) {
      console.error("Inbox sync error:", err);
    } finally {
      setLoading(false);
    }
  };

  const handleClientAiSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!clientEmail.trim() || !emailBody.trim()) {
      alert("Palun täida e-posti aadress ja sõnumi sisu!");
      return;
    }
    setSubmitting(true);
    setAiResult(null);
    try {
      const res = await axios.post<SimulationResponse>(
        `${API_BASE}/simulate-email/`,
        {
          sender_email: clientEmail.trim(),
          subject: emailSubject.trim() || "Väljaku broneerimine",
          body: emailBody.trim(),
          send_real_email: sendRealEmail,
        }
      );
      setAiResult(res.data);
      fetchDashboardData();
    } catch {
      alert("Ühenduse viga FastAPI serveriga!");
    } finally {
      setSubmitting(false);
    }
  };

  const bookingsForSelectedDate = bookings.filter((b) =>
    b.start_time.startsWith(selectedDate)
  );

  const getCellState = (
    courtId: number,
    slotTime: string
  ):
    | { type: "free" }
    | { type: "past" }
    | { type: "covered" }
    | { type: "start"; booking: Booking; rowSpan: number; durationMins: number } => {
    const slotMs = new Date(`${selectedDate}T${slotTime}:00`).getTime();
    for (const b of bookingsForSelectedDate) {
      if (b.court_id !== courtId) continue;
      const startMs = new Date(b.start_time).getTime();
      const endMs = new Date(b.end_time).getTime();
      if (slotMs >= startMs && slotMs < endMs) {
        if (slotMs === startMs) {
          const durationMins = Math.max(
            30,
            Math.round((endMs - startMs) / 60000)
          );
          const span = Math.max(1, Math.round(durationMins / 30));
          return { type: "start", booking: b, rowSpan: span, durationMins };
        }
        return { type: "covered" };
      }
    }
    if (isSlotInPast(selectedDate, slotTime)) {
      return { type: "past" };
    }
    return { type: "free" };
  };

  // Filtered bookings for the Admin table (Future by default + Name/Email + Date)
  const nowMs = new Date().getTime();
  const upcomingTotalCount = bookings.filter(
    (b) => new Date(b.end_time).getTime() >= nowMs
  ).length;

  const filteredAdminBookings = bookings.filter((b) => {
    const endMs = new Date(b.end_time).getTime();
    if (!showPastBookings && endMs < nowMs) {
      return false;
    }

    if (tableDateFilter && !b.start_time.startsWith(tableDateFilter)) {
      return false;
    }

    if (tableSearchQuery.trim()) {
      const q = tableSearchQuery.toLowerCase().trim();
      const emailAndName = (
        b.user_email || `kasutaja #${b.user_id}`
      ).toLowerCase();
      const phone = (b.user_phone || "").toLowerCase();
      const court = getCourtName(b.court_id).toLowerCase();
      if (
        !emailAndName.includes(q) &&
        !phone.includes(q) &&
        !court.includes(q)
      ) {
        return false;
      }
    }

    return true;
  });

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 text-left">
      {/* Floating Toast Notification */}
      {toastMsg && (
        <div className="fixed bottom-5 right-5 z-50 bg-slate-900 text-white px-5 py-3 rounded-xl shadow-lg border border-slate-700 flex items-center gap-3 text-sm font-medium">
          <span>{toastMsg}</span>
          <button
            onClick={() => setToastMsg(null)}
            className="text-slate-400 hover:text-white cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* =====================================================================
          ADMIN BOOKING DETAILS INSPECTION MODAL (ON CLICKING ANY BOOKING)
         ===================================================================== */}
      {inspectedBooking && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 max-w-md w-full overflow-hidden">
            <div className="bg-slate-900 px-6 py-4 text-white flex items-center justify-between">
              <div>
                <span className="text-[11px] uppercase tracking-wider text-amber-400 font-bold block">
                  Broneeringu detailid #{inspectedBooking.id}
                </span>
                <h3 className="text-lg font-bold m-0">
                  🏟️ {getCourtName(inspectedBooking.court_id)}
                </h3>
              </div>
              <button
                onClick={() => setInspectedBooking(null)}
                className="p-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-white cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-4 text-sm">
              <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-2">
                <div className="flex justify-between">
                  <span className="text-slate-500">Kuupäev:</span>
                  <span className="font-bold text-slate-800">
                    📅 {formatDate(inspectedBooking.start_time)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Kellaaeg:</span>
                  <span className="font-bold text-slate-800">
                    ⏰ {formatTime(inspectedBooking.start_time)} –{" "}
                    {formatTime(inspectedBooking.end_time)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Spordiala:</span>
                  <span className="font-bold text-slate-800">
                    {SPORT_LABELS[inspectedBooking.sport_type]?.label ||
                      inspectedBooking.sport_type}
                  </span>
                </div>
              </div>

              <div className="bg-blue-50/60 p-4 rounded-xl border border-blue-200/80 space-y-2.5">
                <h4 className="text-xs font-bold uppercase tracking-wider text-blue-900 m-0">
                  👤 Kliendi ja makse andmed
                </h4>
                <div className="flex items-center gap-2 text-slate-700">
                  <Mail className="w-4 h-4 text-blue-600 shrink-0" />
                  <span className="font-semibold">
                    {inspectedBooking.user_email ||
                      `Kasutaja #${inspectedBooking.user_id}`}
                  </span>
                </div>
                <div className="flex items-center gap-2 text-slate-700">
                  <Phone className="w-4 h-4 text-blue-600 shrink-0" />
                  <span>
                    Telefon:{" "}
                    <strong>
                      {inspectedBooking.user_phone || "Pole märgitud"}
                    </strong>
                  </span>
                </div>
                <div className="flex items-center gap-2 text-slate-700">
                  <CreditCard className="w-4 h-4 text-blue-600 shrink-0" />
                  <span>
                    Pangakonto (IBAN):{" "}
                    <strong className="font-mono">
                      {inspectedBooking.user_bank_account || "Pole märgitud"}
                    </strong>
                  </span>
                </div>
              </div>

              {inspectedBooking.comment && (
                <div className="bg-amber-50 p-3.5 rounded-xl border border-amber-200 text-amber-950">
                  <span className="text-xs font-bold uppercase text-amber-700 block mb-1">
                    💬 Lisainfo / Märkus:
                  </span>
                  <p className="m-0 text-sm">{inspectedBooking.comment}</p>
                </div>
              )}

              <div className="flex items-center justify-between pt-3 border-t border-slate-100">
                <button
                  onClick={() => {
                    handleCopyBooking(inspectedBooking);
                    setInspectedBooking(null);
                  }}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold bg-indigo-50 text-indigo-700 hover:bg-indigo-100 cursor-pointer"
                >
                  <Copy className="w-3.5 h-3.5" />
                  Kopeeri broneering
                </button>
                <button
                  onClick={() => handleDeleteBooking(inspectedBooking.id)}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold bg-rose-600 text-white hover:bg-rose-700 cursor-pointer"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  Tühista broneering
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* =====================================================================
          INTERACTIVE BOOKING MODAL (OPENS WHEN CLICKING ANY FREE TIME SLOT)
         ===================================================================== */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 max-w-lg w-full overflow-hidden my-8">
            <div className="bg-gradient-to-r from-[#1e3c72] to-[#2a5298] px-6 py-4 text-white flex items-center justify-between">
              <div>
                <span className="text-[11px] uppercase tracking-wider text-amber-300 font-bold block">
                  SmartCourt Broneerimine
                </span>
                <h3 className="text-lg font-bold m-0">
                  Väljaku broneerimine ({getCourtName(bookingCourtId)})
                </h3>
              </div>
              <button
                onClick={() => setIsModalOpen(false)}
                className="p-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-white cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleModalBookingSubmit} className="p-6 space-y-4">
              <div className="bg-blue-50/80 border border-blue-200 rounded-xl p-3.5 text-xs text-blue-950 flex items-center justify-between">
                <div>
                  <span className="font-semibold block text-blue-900">
                    Valitud kokkuvõte:
                  </span>
                  <span>
                    🏟️ <b>{getCourtName(bookingCourtId)}</b> • 📅{" "}
                    <b>{bookingDate}</b> • ⏰{" "}
                    <b>
                      {bookingStartTime} –{" "}
                      {addMinutesToTime(bookingStartTime, bookingDuration)}
                    </b>
                  </span>
                </div>
                <span className="bg-emerald-100 text-emerald-800 font-bold px-2.5 py-1 rounded-full text-[11px]">
                  ● Vaba
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold uppercase text-slate-500 mb-1">
                    Kuupäev
                  </label>
                  <input
                    type="date"
                    required
                    min={todayStr}
                    value={bookingDate}
                    onChange={(e) => {
                      if (e.target.value >= todayStr) {
                        setBookingDate(e.target.value);
                      }
                    }}
                    className="w-full px-3.5 py-2.5 text-sm rounded-xl border border-slate-300 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold uppercase text-slate-500 mb-1">
                    Väljak (ainult aktiivsed)
                  </label>
                  <select
                    value={bookingCourtId}
                    onChange={(e) => setBookingCourtId(Number(e.target.value))}
                    className="w-full px-3.5 py-2.5 text-sm rounded-xl border border-slate-300 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    {courts.map((c) => (
                      <option key={c.id} value={c.id}>
                        🏟️ {c.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold uppercase text-slate-500 mb-1">
                    Algusaeg (vabad ajad)
                  </label>
                  <select
                    value={bookingStartTime}
                    onChange={(e) => setBookingStartTime(e.target.value)}
                    className="w-full px-3.5 py-2.5 text-sm rounded-xl border border-slate-300 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    {TIME_SLOTS.map((slot) => {
                      const past = isSlotInPast(bookingDate, slot);
                      const free = isIntervalAvailable(
                        bookingDate,
                        bookingCourtId,
                        slot,
                        60
                      );
                      return (
                        <option key={slot} value={slot} disabled={!free}>
                          {slot}{" "}
                          {past
                            ? "(Möödunud)"
                            : free
                              ? "(Vaba)"
                              : "(Hõivatud)"}
                        </option>
                      );
                    })}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold uppercase text-slate-500 mb-1">
                    Mängu kestus
                  </label>
                  <select
                    value={bookingDuration}
                    onChange={(e) => setBookingDuration(Number(e.target.value))}
                    className="w-full px-3.5 py-2.5 text-sm rounded-xl border border-slate-300 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    {DURATION_OPTIONS.map((opt) => {
                      const fits = isIntervalAvailable(
                        bookingDate,
                        bookingCourtId,
                        bookingStartTime,
                        opt.value
                      );
                      return (
                        <option
                          key={opt.value}
                          value={opt.value}
                          disabled={!fits}
                        >
                          {opt.label}{" "}
                          {fits
                            ? `→ kuni ${addMinutesToTime(bookingStartTime, opt.value)}`
                            : "(Ei mahu)"}
                        </option>
                      );
                    })}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold uppercase text-slate-500 mb-1">
                    Spordiala
                  </label>
                  <select
                    value={bookingSport}
                    onChange={(e) => setBookingSport(e.target.value)}
                    className="w-full px-3.5 py-2.5 text-sm rounded-xl border border-slate-300 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="beach_volleyball">🏐 Rannavõrkpall</option>
                    <option value="beach_tennis">🎾 Rannatennis</option>
                    <option value="beach_football">⚽ Rannajalgpall</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold uppercase text-slate-500 mb-1">
                    Kliendi e-post *
                  </label>
                  <input
                    type="email"
                    required
                    placeholder="klient@gmail.com"
                    value={bookingEmail}
                    onChange={(e) => setBookingEmail(e.target.value)}
                    className="w-full px-3.5 py-2.5 text-sm rounded-xl border border-slate-300 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                <div className={activeTab === "client" ? "sm:col-span-2" : ""}>
                  <label className="block text-xs font-semibold uppercase text-slate-500 mb-1">
                    Telefoninumber
                  </label>
                  <input
                    type="tel"
                    placeholder="+372 5555 5555"
                    value={bookingPhone}
                    onChange={(e) => setBookingPhone(e.target.value)}
                    className="w-full px-3.5 py-2.5 text-sm rounded-xl border border-slate-300 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                {activeTab === "admin" && (
                  <div>
                    <label className="block text-xs font-semibold uppercase text-slate-500 mb-1">
                      Pangakonto (IBAN)
                    </label>
                    <input
                      type="text"
                      placeholder="EE12 3456 7890 1234 5678"
                      value={bookingBank}
                      onChange={(e) => setBookingBank(e.target.value)}
                      className="w-full px-3.5 py-2.5 text-sm rounded-xl border border-slate-300 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                )}
              </div>

              {activeTab === "admin" && (
                <div className="bg-indigo-50/70 border border-indigo-200 rounded-xl p-3.5 space-y-3">
                  <label className="flex items-center gap-2.5 text-sm font-semibold text-indigo-950 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={repeatWeekly}
                      onChange={(e) => setRepeatWeekly(e.target.checked)}
                      className="w-4 h-4 rounded text-indigo-600"
                    />
                    <Repeat className="w-4 h-4 text-indigo-600" />
                    Korda igal nädalal samal ajal (ainult Adminile)
                  </label>

                  {repeatWeekly && (
                    <div className="flex items-center gap-3 pl-6">
                      <span className="text-xs font-semibold text-indigo-800">
                        Korda kuni kuupäevani:
                      </span>
                      <input
                        type="date"
                        min={bookingDate}
                        value={repeatUntil}
                        onChange={(e) => setRepeatUntil(e.target.value)}
                        className="px-3 py-1.5 text-xs font-semibold rounded-lg border border-indigo-300 bg-white text-indigo-950"
                      />
                    </div>
                  )}
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold uppercase text-slate-500 mb-1">
                  Lisainfo / küsimus administraatorile (valikuline)
                </label>
                <textarea
                  rows={2}
                  placeholder="Nt: Soovime laenutada 2 reketit / Kas parkimine on tasuta?"
                  value={bookingComment}
                  onChange={(e) => setBookingComment(e.target.value)}
                  className="w-full p-3 text-sm rounded-xl border border-slate-300 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2.5 rounded-xl text-sm font-semibold text-slate-600 hover:bg-slate-100 cursor-pointer"
                >
                  Loobu
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-6 py-2.5 rounded-xl text-sm font-semibold bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm cursor-pointer disabled:opacity-50"
                >
                  {submitting ? "Salvestan..." : "✓ Kinnita broneering"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Top Navbar */}
      <header className="bg-gradient-to-r from-[#1e3c72] to-[#2a5298] text-white shadow-md">
        <div className="max-w-7xl mx-auto px-6 py-4 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <img
              src="https://img.icons8.com/color/96/000000/volleyball.png"
              alt="SmartCourt"
              className="w-10 h-10"
            />
            <div className="text-left">
              <span className="text-xs uppercase tracking-widest text-amber-400 font-bold block">
                SmartCourt Arena
              </span>
              <h1 className="text-xl font-bold tracking-tight text-white m-0">
                Broneerimissüsteem & AI Haldus
              </h1>
            </div>
          </div>

          <div className="flex bg-slate-900/30 p-1 rounded-xl border border-white/15">
            <button
              onClick={() => setActiveTab("admin")}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition cursor-pointer ${
                activeTab === "admin"
                  ? "bg-white text-[#1e3c72] shadow-sm"
                  : "text-white/85 hover:text-white"
              }`}
            >
              <ShieldCheck className="w-4 h-4" />
              Administraatori vaade
            </button>
            <button
              onClick={() => setActiveTab("client")}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition cursor-pointer ${
                activeTab === "client"
                  ? "bg-amber-400 text-slate-900 shadow-sm"
                  : "text-white/85 hover:text-white"
              }`}
            >
              <User className="w-4 h-4" />
              Kliendi broneerimine
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-8 space-y-8">
        {apiError && (
          <div className="bg-rose-50 border border-rose-200 text-rose-800 px-5 py-4 rounded-2xl flex items-center justify-between gap-4">
            <div className="flex items-center gap-3 text-sm font-medium">
              <AlertCircle className="w-5 h-5 text-rose-600 shrink-0" />
              <span>{apiError}</span>
            </div>
            <button
              onClick={fetchDashboardData}
              className="bg-rose-600 text-white text-xs font-semibold px-3 py-1.5 rounded-lg hover:bg-rose-700 cursor-pointer shrink-0"
            >
              Proovi uuesti
            </button>
          </div>
        )}

        {/* =====================================================================
            LIVE MERGED COURT AVAILABILITY TIMETABLE (FOR BOTH ADMIN & CLIENT)
           ===================================================================== */}
        <section className="bg-white rounded-2xl shadow-xs border border-slate-200/80 overflow-hidden">
          <div className="p-6 border-b border-slate-100 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-500"></span>
                <h2 className="text-lg font-bold text-slate-800 m-0">
                  Väljakute saadavus ({selectedDate})
                </h2>
              </div>
              <p className="text-sm text-slate-500 mt-0.5">
                {activeTab === "admin"
                  ? "Kliki vabal rohelisel lahtril broneerimiseks või kliki olemasoleval broneeringul kliendi andmete (telefon, IBAN) vaatamiseks."
                  : "Kliki suvalisel rohelisel ● Vaba lahtril, et avada broneerimise aken!"}
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                onClick={() => shiftSelectedDate(-1)}
                disabled={selectedDate <= todayStr}
                className="p-2 rounded-xl border border-slate-200 hover:bg-slate-100 text-slate-600 cursor-pointer disabled:opacity-35 disabled:cursor-not-allowed"
                title="Eelmine päev"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>

              <input
                type="date"
                min={todayStr}
                value={selectedDate}
                onChange={(e) => {
                  if (e.target.value >= todayStr) {
                    setSelectedDate(e.target.value);
                    setBookingDate(e.target.value);
                  }
                }}
                className="px-3.5 py-1.5 text-sm font-semibold rounded-xl border border-slate-300 text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />

              <button
                onClick={() => shiftSelectedDate(1)}
                className="p-2 rounded-xl border border-slate-200 hover:bg-slate-100 text-slate-600 cursor-pointer"
                title="Järgmine päev"
              >
                <ChevronRight className="w-4 h-4" />
              </button>

              <button
                onClick={() => {
                  setSelectedDate(todayStr);
                  setBookingDate(todayStr);
                }}
                className="px-3 py-1.5 text-xs font-semibold rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 cursor-pointer"
              >
                Täna
              </button>

              {activeTab === "admin" && (
                <>
                  <button
                    onClick={handleCopyEntireDay}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-xl bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 cursor-pointer"
                  >
                    <Copy className="w-3.5 h-3.5" />
                    Kopeeri päev ({bookingsForSelectedDate.length})
                  </button>

                  {copiedDayBatch && (
                    <div className="inline-flex items-center gap-1 bg-indigo-50 p-1 rounded-xl border border-indigo-200">
                      <button
                        onClick={handlePasteEntireDay}
                        className="flex items-center gap-1.5 px-3 py-1 text-xs font-semibold rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white shadow-xs cursor-pointer"
                      >
                        <ClipboardPaste className="w-3.5 h-3.5" />
                        Kleebi päev ({copiedDayBatch.items.length} tk) siia
                      </button>
                      <button
                        onClick={() => {
                          setCopiedDayBatch(null);
                          showToast("✖️ Päeva kopeerimine tühistatud.");
                        }}
                        title={`Tühista kopeeritud päev (${copiedDayBatch.sourceDate})`}
                        className="flex items-center gap-1 px-2.5 py-1 text-xs font-semibold rounded-lg text-indigo-700 hover:bg-indigo-100 cursor-pointer"
                      >
                        <X className="w-3.5 h-3.5" />
                        Tühista
                      </button>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>

          {activeTab === "admin" && copiedSingle && (
            <div className="bg-amber-50 border-b border-amber-200 px-6 py-3 flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2 text-sm text-amber-900">
                <Copy className="w-4 h-4 text-amber-600 shrink-0" />
                <span>
                  Lõikelaual: <strong>{copiedSingle.sourceLabel}</strong> (
                  {copiedSingle.client_email})
                </span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={handlePasteSingleToCurrentDate}
                  className="flex items-center gap-1.5 bg-amber-500 hover:bg-amber-600 text-slate-950 font-semibold text-xs px-3.5 py-1.5 rounded-lg cursor-pointer"
                >
                  <ClipboardPaste className="w-3.5 h-3.5" />
                  Kleebi kuupäevale {selectedDate} (sama kell ja väljak)
                </button>
                <button
                  onClick={() => setCopiedSingle(null)}
                  className="text-xs text-amber-700 hover:underline px-2 py-1 cursor-pointer"
                >
                  Tühjenda
                </button>
              </div>
            </div>
          )}

          {/* Visual Timetable with Unified Merged Cells (rowSpan) */}
          <div className="overflow-x-auto max-h-[520px] overflow-y-auto">
            <table className="w-full border-collapse text-xs">
              <thead className="sticky top-0 z-10 bg-slate-100 border-b border-slate-200 text-slate-600 uppercase">
                <tr>
                  <th className="py-3 px-4 w-28 text-left font-bold border-r border-slate-200 bg-slate-100">
                    Kellaaeg
                  </th>
                  {courts.map((c) => (
                    <th
                      key={c.id}
                      className="py-3 px-4 text-left font-bold border-r border-slate-200 min-w-[200px]"
                    >
                      🏟️ {c.name}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {TIME_SLOTS.map((slot) => {
                  const nextSlot = addMinutesToTime(slot, 30);
                  return (
                    <tr key={slot} className="h-10">
                      <td className="py-2 px-4 font-mono font-semibold text-slate-500 border-r border-slate-200 bg-slate-50/70 whitespace-nowrap">
                        {slot} – {nextSlot}
                      </td>
                      {courts.map((court) => {
                        const cell = getCellState(court.id, slot);

                        if (cell.type === "covered") {
                          return null;
                        }

                        if (cell.type === "start") {
                          const { booking, rowSpan, durationMins } = cell;
                          const sportStyle =
                            SPORT_LABELS[booking.sport_type] ||
                            SPORT_LABELS.beach_volleyball;

                          return (
                            <td
                              key={court.id}
                              rowSpan={rowSpan}
                              onClick={() => {
                                if (activeTab === "admin") {
                                  setInspectedBooking(booking);
                                }
                              }}
                              className={`p-1.5 border-r border-slate-200 align-top bg-white ${
                                activeTab === "admin" ? "cursor-pointer" : ""
                              }`}
                            >
                              <div
                                className={`h-full w-full rounded-xl border-l-4 border p-3 flex flex-col justify-between transition ${sportStyle.cardBg} ${
                                  activeTab === "admin"
                                    ? "hover:brightness-95"
                                    : ""
                                }`}
                              >
                                <div className="flex items-start justify-between gap-2">
                                  <div>
                                    <span className="font-extrabold text-xs block">
                                      {sportStyle.short}
                                    </span>
                                    <span className="inline-flex items-center gap-1 text-[11px] font-bold mt-0.5 opacity-90">
                                      <Clock className="w-3 h-3" />
                                      {formatTime(booking.start_time)} –{" "}
                                      {formatTime(booking.end_time)} (
                                      {durationMins} min)
                                    </span>
                                  </div>

                                  {activeTab === "admin" && (
                                    <div
                                      className="flex items-center gap-1 shrink-0"
                                      onClick={(e) => e.stopPropagation()}
                                    >
                                      <button
                                        onClick={() =>
                                          handleCopyBooking(booking)
                                        }
                                        title="Kopeeri see broneering"
                                        className="p-1.5 rounded-lg bg-white/90 hover:bg-white text-slate-700 border border-slate-300/80 shadow-2xs cursor-pointer"
                                      >
                                        <Copy className="w-3.5 h-3.5" />
                                      </button>
                                      <button
                                        onClick={() =>
                                          handleDeleteBooking(booking.id)
                                        }
                                        title="Tühista broneering"
                                        className="p-1.5 rounded-lg bg-white/90 hover:bg-rose-600 hover:text-white text-rose-600 border border-rose-200 shadow-2xs cursor-pointer"
                                      >
                                        <Trash2 className="w-3.5 h-3.5" />
                                      </button>
                                    </div>
                                  )}
                                </div>

                                <div className="mt-2 pt-1.5 border-t border-black/5 flex items-center justify-between text-[11px]">
                                  <span className="font-medium truncate max-w-[175px]">
                                    {activeTab === "admin"
                                      ? `👤 ${booking.user_email || `Kasutaja #${booking.user_id}`}`
                                      : "🔒 Broneeritud"}
                                  </span>
                                  {activeTab === "admin" && (
                                    <span className="opacity-60 font-mono text-[10px]">
                                      #{booking.id}
                                    </span>
                                  )}
                                </div>
                              </div>
                            </td>
                          );
                        }

                        if (cell.type === "past") {
                          return (
                            <td
                              key={court.id}
                              className="py-2 px-3 border-r border-slate-100 bg-slate-100/70 text-slate-400 cursor-not-allowed select-none"
                            >
                              <span className="text-[11px] opacity-60">
                                ○ Möödunud
                              </span>
                            </td>
                          );
                        }

                        return (
                          <td
                            key={court.id}
                            onClick={() => handleGridCellClick(court.id, slot)}
                            className="py-2 px-3 border-r border-slate-100 bg-emerald-50/30 hover:bg-emerald-100/70 text-emerald-700 cursor-pointer transition group"
                          >
                            <div className="flex items-center justify-between">
                              <span className="text-[11px] font-medium opacity-75 group-hover:opacity-100">
                                ● Vaba
                              </span>
                              <span className="text-[10px] font-semibold opacity-0 group-hover:opacity-100 bg-emerald-600 text-white px-2 py-0.5 rounded-md shadow-2xs">
                                {activeTab === "admin" && copiedSingle
                                  ? "Kleebi siia"
                                  : "+ Broneeri"}
                              </span>
                            </div>
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>

        {/* =====================================================================
            ADMIN VIEW
           ===================================================================== */}
        {activeTab === "admin" ? (
          <div className="space-y-8">
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
              <div className="lg:col-span-7 bg-white p-6 rounded-2xl shadow-xs border border-slate-200/80 flex items-center justify-between gap-4">
                <div>
                  <h2 className="text-base font-bold text-slate-800 m-0">
                    ➕ Kiire broneeringu ja püsiaja lisamine
                  </h2>
                  <p className="text-xs text-slate-500 mt-1">
                    Kliki üleval tabelis rohelisel lahtril või ava broneerimise
                    aken (saab valida ka iganädalase korduse).
                  </p>
                </div>
                <button
                  onClick={() => {
                    setBookingDate(selectedDate);
                    setIsModalOpen(true);
                  }}
                  className="bg-[#1e3c72] hover:bg-[#162d57] text-white text-sm font-semibold py-2.5 px-5 rounded-xl transition cursor-pointer shrink-0"
                >
                  + Ava broneerimise aken
                </button>
              </div>

              <div className="lg:col-span-5 bg-white p-6 rounded-2xl shadow-xs border border-slate-200/80 flex flex-col justify-between space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="text-base font-bold text-slate-800 m-0">
                      Spordiväljakud ({courts.length}) & Postkast
                    </h2>
                    <p className="text-xs text-slate-500">
                      Tulevasi broneeringuid: {upcomingTotalCount} tk (kokku{" "}
                      {bookings.length})
                    </p>
                  </div>
                  <button
                    onClick={handleTriggerInboxCheck}
                    disabled={loading}
                    className="flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold py-2 px-3 rounded-xl transition cursor-pointer"
                  >
                    <RefreshCw
                      className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`}
                    />
                    Kontrolli Gmaili
                  </button>
                </div>

                <form onSubmit={handleCreateCourt} className="flex gap-2">
                  <input
                    type="text"
                    placeholder="Uue väljaku nimi..."
                    value={newCourtName}
                    onChange={(e) => setNewCourtName(e.target.value)}
                    className="flex-1 px-3 py-2 text-sm rounded-xl border border-slate-300 placeholder:text-slate-400"
                  />
                  <button
                    type="submit"
                    className="flex items-center gap-1.5 bg-slate-800 hover:bg-slate-900 text-white text-xs font-semibold px-4 py-2 rounded-xl cursor-pointer"
                  >
                    <PlusCircle className="w-4 h-4" />
                    Lisa väljak
                  </button>
                </form>
              </div>
            </div>

            {/* =================================================================
                UPCOMING BOOKINGS TABLE WITH NAME/EMAIL & DATE FILTERS
               ================================================================= */}
            <div className="bg-white rounded-2xl shadow-xs border border-slate-200/80 overflow-hidden">
              <div className="p-6 border-b border-slate-100 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2.5">
                    <h2 className="text-lg font-bold text-slate-800 m-0">
                      Tulevased kinnitatud broneeringud (
                      {filteredAdminBookings.length})
                    </h2>
                    <span className="text-[11px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200 px-2.5 py-0.5 rounded-full">
                      Aktiivsed & tulevased
                    </span>
                  </div>
                  <p className="text-sm text-slate-500 mt-0.5">
                    Filtreeri kliendi nime, e-posti või kuupäeva järgi. Kliki
                    real lisainfo ja IBAN-i vaatamiseks!
                  </p>
                </div>

                {/* Filter Controls: Search by Name/Email + Filter by Date */}
                <div className="flex flex-wrap items-center gap-2.5">
                  {/* Search by client name / email / phone */}
                  <div className="relative min-w-[230px]">
                    <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                    <input
                      type="text"
                      placeholder="Otsi nime, e-posti või tel järgi..."
                      value={tableSearchQuery}
                      onChange={(e) => setTableSearchQuery(e.target.value)}
                      className="w-full pl-9 pr-8 py-1.5 text-sm rounded-xl border border-slate-300 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                    {tableSearchQuery && (
                      <button
                        onClick={() => setTableSearchQuery("")}
                        className="absolute right-2.5 top-2.5 text-slate-400 hover:text-slate-600 cursor-pointer"
                        title="Tühjenda otsing"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    )}
                  </div>

                  {/* Filter by specific future date */}
                  <input
                    type="date"
                    min={todayStr}
                    value={tableDateFilter}
                    onChange={(e) => setTableDateFilter(e.target.value)}
                    className="px-3 py-1.5 text-sm rounded-xl border border-slate-300 text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    title="Filtreeri kuupäeva järgi"
                  />

                  {(tableSearchQuery || tableDateFilter) && (
                    <button
                      onClick={() => {
                        setTableSearchQuery("");
                        setTableDateFilter("");
                      }}
                      className="text-xs font-semibold text-rose-600 hover:bg-rose-50 px-2.5 py-1.5 rounded-xl border border-rose-200 cursor-pointer"
                    >
                      ✕ Tühjenda filtrid
                    </button>
                  )}

                  {/* Optional toggle to show past bookings if needed */}
                  <label className="flex items-center gap-1.5 text-xs font-medium text-slate-500 bg-slate-100 px-3 py-1.5 rounded-xl cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={showPastBookings}
                      onChange={(e) => setShowPastBookings(e.target.checked)}
                      className="w-3.5 h-3.5 rounded text-blue-600"
                    />
                    Näita ka möödunud
                  </label>

                  <button
                    onClick={fetchDashboardData}
                    className="p-2 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-xl cursor-pointer"
                    title="Värskenda andmeid"
                  >
                    <RefreshCw className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {filteredAdminBookings.length === 0 ? (
                <div className="p-10 text-center text-slate-400">
                  <Calendar className="w-10 h-10 mx-auto mb-2 stroke-1" />
                  <p className="font-medium text-slate-600">
                    Valitud filtritega tulevasi broneeringuid ei leitud
                  </p>
                  {(tableSearchQuery || tableDateFilter) && (
                    <button
                      onClick={() => {
                        setTableSearchQuery("");
                        setTableDateFilter("");
                      }}
                      className="mt-2 text-xs font-semibold text-blue-600 hover:underline cursor-pointer"
                    >
                      Näita kõiki tulevasi broneeringuid
                    </button>
                  )}
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="bg-slate-50 text-slate-500 text-xs uppercase tracking-wider border-b border-slate-200">
                        <th className="py-3.5 px-6">ID</th>
                        <th className="py-3.5 px-6">Väljak</th>
                        <th className="py-3.5 px-6">Spordiala</th>
                        <th className="py-3.5 px-6">Kuupäev</th>
                        <th className="py-3.5 px-6">Kellaaeg</th>
                        <th className="py-3.5 px-6">Klient & Kontakt</th>
                        <th className="py-3.5 px-6">Pangakonto (IBAN)</th>
                        <th className="py-3.5 px-6 text-right">Tegevus</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 text-sm">
                      {filteredAdminBookings.map((b) => {
                        const sportInfo =
                          SPORT_LABELS[b.sport_type] ||
                          SPORT_LABELS.beach_volleyball;
                        return (
                          <tr
                            key={b.id}
                            onClick={() => setInspectedBooking(b)}
                            className="hover:bg-blue-50/50 cursor-pointer transition"
                          >
                            <td className="py-3.5 px-6 font-mono text-xs text-slate-400">
                              #{b.id}
                            </td>
                            <td className="py-3.5 px-6 font-semibold text-slate-800">
                              🏟️ {getCourtName(b.court_id)}
                            </td>
                            <td className="py-3.5 px-6">
                              <span
                                className={`inline-block px-2.5 py-0.5 rounded-full text-xs font-semibold border ${sportInfo.badge}`}
                              >
                                {sportInfo.label}
                              </span>
                            </td>
                            <td className="py-3.5 px-6 font-medium text-slate-700">
                              📅 {formatDate(b.start_time)}
                            </td>
                            <td className="py-3.5 px-6 text-slate-700">
                              <span className="inline-flex items-center gap-1.5 font-medium bg-slate-100 px-2.5 py-1 rounded-lg">
                                <Clock className="w-3.5 h-3.5 text-slate-500" />
                                {formatTime(b.start_time)} –{" "}
                                {formatTime(b.end_time)}
                              </span>
                            </td>
                            <td className="py-3.5 px-6">
                              <div className="font-semibold text-slate-800">
                                {b.user_email || `Kasutaja #${b.user_id}`}
                              </div>
                              <div className="text-xs text-slate-500">
                                📞 {b.user_phone || "—"}
                              </div>
                            </td>
                            <td className="py-3.5 px-6 font-mono text-xs text-slate-600">
                              {b.user_bank_account || "—"}
                            </td>
                            <td
                              className="py-3.5 px-6 text-right space-x-2 whitespace-nowrap"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <button
                                onClick={() => setInspectedBooking(b)}
                                className="inline-flex items-center gap-1 text-xs font-semibold text-slate-600 hover:bg-slate-100 border border-slate-200 px-2.5 py-1.5 rounded-lg cursor-pointer"
                              >
                                <Info className="w-3.5 h-3.5" />
                                Vaata
                              </button>
                              <button
                                onClick={() => handleCopyBooking(b)}
                                className="inline-flex items-center gap-1 text-xs font-semibold text-indigo-600 hover:bg-indigo-50 border border-indigo-200 px-2.5 py-1.5 rounded-lg cursor-pointer"
                              >
                                <Copy className="w-3.5 h-3.5" />
                                Kopeeri
                              </button>
                              <button
                                onClick={() => handleDeleteBooking(b.id)}
                                className="inline-flex items-center gap-1 text-xs font-semibold text-rose-600 hover:bg-rose-600 hover:text-white border border-rose-200 px-2.5 py-1.5 rounded-lg cursor-pointer"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                                Tühista
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        ) : (
          /* =====================================================================
              CLIENT VIEW: ONLY TIMETABLE CLICK OR AI EMAIL SIMULATOR
             ===================================================================== */
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
            <div className="lg:col-span-5 bg-white p-6 rounded-2xl shadow-xs border border-slate-200/80">
              <div className="flex items-center gap-2.5 mb-2">
                <Sparkles className="w-5 h-5 text-amber-500" />
                <h2 className="text-lg font-bold text-slate-800 m-0">
                  Kirjuta vabas vormis e-kiri (AI Broneerimine)
                </h2>
              </div>
              <p className="text-sm text-slate-500 mb-5">
                Kliki üleval ajakavas rohelisel vabal kellaajal või kirjuta siia
                vabas vormis e-kiri!
              </p>

              <form onSubmit={handleClientAiSubmit} className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold uppercase text-slate-500 mb-1">
                    Sinu e-posti aadress
                  </label>
                  <div className="relative">
                    <Mail className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
                    <input
                      type="email"
                      required
                      placeholder="klient@gmail.com"
                      value={clientEmail}
                      onChange={(e) => setClientEmail(e.target.value)}
                      className="w-full pl-10 pr-4 py-2.5 text-sm rounded-xl border border-slate-300 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold uppercase text-slate-500 mb-1">
                    Pealkiri (Subject)
                  </label>
                  <input
                    type="text"
                    placeholder="Väljaku broneerimine"
                    value={emailSubject}
                    onChange={(e) => setEmailSubject(e.target.value)}
                    className="w-full px-3.5 py-2.5 text-sm rounded-xl border border-slate-300 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold uppercase text-slate-500 mb-1">
                    Sõnum / Broneeringu soov
                  </label>
                  <textarea
                    rows={4}
                    required
                    placeholder="Tere! Soovin broneerida rannavõrkpalli väljaku homme kell 18:00 kaheks tunniks."
                    value={emailBody}
                    onChange={(e) => setEmailBody(e.target.value)}
                    className="w-full p-3.5 text-sm rounded-xl border border-slate-300 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                <label className="flex items-center gap-2.5 text-sm text-slate-600 cursor-pointer select-none pt-1">
                  <input
                    type="checkbox"
                    checked={sendRealEmail}
                    onChange={(e) => setSendRealEmail(e.target.checked)}
                    className="w-4 h-4 rounded text-blue-600"
                  />
                  Saada ka päris e-kiri (SMTP kaudu)
                </label>

                <button
                  type="submit"
                  disabled={submitting}
                  className="w-full flex items-center justify-center gap-2 bg-gradient-to-r from-[#1e3c72] to-[#2a5298] hover:opacity-95 text-white font-semibold py-3 px-5 rounded-xl shadow-sm cursor-pointer disabled:opacity-50"
                >
                  <Send className="w-4 h-4" />
                  {submitting ? "AI töötleb päringut..." : "Saada AI e-kiri"}
                </button>
              </form>
            </div>

            <div className="lg:col-span-7 space-y-6">
              {!aiResult ? (
                <div className="bg-white p-12 rounded-2xl shadow-xs border border-slate-200/80 text-center text-slate-400 h-full flex flex-col items-center justify-center">
                  <Sparkles className="w-12 h-12 mb-3 text-slate-300 stroke-1" />
                  <p className="font-semibold text-slate-600">
                    Vali vaba aeg ülevalt tabelist või saada AI e-kiri
                  </p>
                  <p className="text-sm mt-1 max-w-md">
                    Siia ilmub automaatselt genereeritud kinnituskirja eelvaade.
                  </p>
                </div>
              ) : (
                <>
                  <div className="bg-white p-5 rounded-2xl shadow-xs border border-slate-200/80">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold uppercase tracking-wider text-slate-400">
                        NLP Mudeli Tulemus
                      </span>
                      <span className="inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-700">
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        {aiResult.action}
                      </span>
                    </div>
                  </div>
                  {aiResult.generated_reply && (
                    <div className="bg-white rounded-2xl shadow-xs border border-slate-200/80 overflow-hidden">
                      <div
                        className="p-2"
                        dangerouslySetInnerHTML={{
                          __html: aiResult.generated_reply.body,
                        }}
                      />
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}