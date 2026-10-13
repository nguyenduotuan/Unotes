import { useEffect, useState, type FormEvent } from 'react'
import { addDays, addMonths, addWeeks, addYears, eachDayOfInterval, endOfMonth, endOfWeek, format, getDay, isSameDay, isSameMonth, isToday, parseISO, startOfMonth, startOfWeek, startOfYear, subMonths, subWeeks, subYears } from 'date-fns'
import { ArrowDownToLine, ArrowLeft, ArrowRight, BookOpen, BriefcaseBusiness, CalendarDays, Check, CheckCircle2, ChevronDown, ChevronLeft, ChevronRight, Circle, FileText, Filter, FolderOpen, GraduationCap, Heart, LoaderCircle, MessageCircle, Pencil, Plus, Send, Trash2, Upload, UserRound, X } from 'lucide-react'
import { api } from './api'
import type { CalendarEvent, Course, CourseCategory, CourseEventType, CourseLink, EventComment, EventOccurrenceException, SectionKey, SectionSpecialEvent, SectionWeeklyEvent, SectionWeeklyNote, Task, WeeklyCourseEvent, WeeklyNote } from './types'
import './planner.css'

type Page = 'calendar' | 'notes' | 'courses' | SectionKey
type CalendarView = 'week' | 'month' | 'year'
type SectionEventDraft = Omit<SectionWeeklyEvent, 'id' | 'created_at' | 'section'> & { id?: number }
type SectionEventFilter = `section-${SectionKey}`
type CalendarFilter = 'tasks' | CalendarEvent['event_type'] | SectionEventFilter
type TaskDraft = { title: string; description: string; due_date: string; priority: Task['priority']; course_id: string }
type CourseEditDraft = { title: string; code: string; color: string; category: CourseCategory; summary: string }
type CourseLinkDraft = Pick<CourseLink, 'label' | 'url'> & { draftId: string }
type WeeklyEventDraft = Omit<WeeklyCourseEvent, 'start_time' | 'end_time'> & { start_time: string; end_time: string }
type EventDraft = { title: string; category: 'course' | SectionKey; event_type: CourseEventType; one_time: boolean; course_id: string; weekday: string; event_date: string; start_time: string; end_time: string }
type CalendarEventEditDraft = { title: string; event_type: CourseEventType; one_time: boolean; weekday: string; event_date: string; start_time: string; end_time: string }
const palette = ['#397c68', '#ca7155', '#697fb1', '#c3963d', '#82699f', '#45899a', '#d94e50', '#6b8e99', '#c46c39', '#5a9b82']
const sectionNames: Record<SectionKey, string> = { work: 'Work', girlfriend: 'Girlfriend', personal: 'Personal' }
const sectionColors: Record<SectionKey, string> = { work: '#276E63', girlfriend: '#C04F78', personal: '#B86D2B' }
const monday = (date: Date) => startOfWeek(date, { weekStartsOn: 1 })
const dateKey = (date: Date) => format(date, 'yyyy-MM-dd')
const commentKindForEvent = (event: CalendarEvent): EventComment['event_kind'] => event.section
  ? event.event_date ? 'section-special' : 'section-weekly'
  : 'course'
const occurrenceKindForEvent = (event: CalendarEvent): EventOccurrenceException['event_kind'] => event.section ? 'section-weekly' : 'course'
const newCourseLinkDraft = (label = 'Course site', url = ''): CourseLinkDraft => ({ draftId: `${Date.now()}-${Math.random().toString(36).slice(2)}`, label, url })
const savedCourseLinkDrafts = (links: CourseLink[]): CourseLinkDraft[] => links.length
  ? links.map(({ id, label, url }) => ({ draftId: String(id), label, url }))
  : [newCourseLinkDraft()]

function App() {
  const [page, setPage] = useState<Page>('calendar')
  const [cursor, setCursor] = useState(new Date())
  const [calendarView, setCalendarView] = useState<CalendarView>(() => {
    const savedView = localStorage.getItem('unotes-calendar-view')
    return savedView === 'month' || savedView === 'year' ? savedView : 'week'
  })
  const [courses, setCourses] = useState<Course[]>([])
  const [tasks, setTasks] = useState<Task[]>([])
  const [events, setEvents] = useState<CalendarEvent[]>([])
  const [sectionEvents, setSectionEvents] = useState<SectionWeeklyEvent[]>([])
  const [sectionSpecialEvents, setSectionSpecialEvents] = useState<SectionSpecialEvent[]>([])
  const [eventOccurrenceExceptions, setEventOccurrenceExceptions] = useState<EventOccurrenceException[]>([])
  const [weekNotes, setWeekNotes] = useState<WeeklyNote[]>([])
  const [loadedNotesKey, setLoadedNotesKey] = useState('')
  const [courseFilter, setCourseFilter] = useState('all')
  const [selectedCourse, setSelectedCourse] = useState<number | null>(null)
  const [note, setNote] = useState<WeeklyNote | null>(null)
  const [sectionNote, setSectionNote] = useState<SectionWeeklyNote | null>(null)
  const [sectionSummary, setSectionSummary] = useState('')
  const [sectionSummaryDirty, setSectionSummaryDirty] = useState(false)
  const [sectionNoteLoadedKey, setSectionNoteLoadedKey] = useState('')
  const [sectionScheduleDraft, setSectionScheduleDraft] = useState<SectionEventDraft[]>([])
  const [editingSectionKey, setEditingSectionKey] = useState<SectionKey | null>(null)
  const [activeFilters, setActiveFilters] = useState<Set<CalendarFilter>>(() => new Set(['tasks', 'lecture', 'tutoring', 'deadline', 'meeting', 'personal', 'section-work', 'section-girlfriend', 'section-personal']))
  const [filtersExpanded, setFiltersExpanded] = useState(false)
  const [summary, setSummary] = useState('')
  const [summaryDirty, setSummaryDirty] = useState(false)
  const [courseSummary, setCourseSummary] = useState('')
  const [courseSummaryDirty, setCourseSummaryDirty] = useState(false)
  const [courseSummaryExpanded, setCourseSummaryExpanded] = useState(false)
  const [courseLinks, setCourseLinks] = useState<CourseLink[]>([])
  const [courseLinkDrafts, setCourseLinkDrafts] = useState<CourseLinkDraft[]>(() => [newCourseLinkDraft()])
  const [courseLinksDirty, setCourseLinksDirty] = useState(false)
  const [editCourseOpen, setEditCourseOpen] = useState(false)
  const [courseEditDraft, setCourseEditDraft] = useState<CourseEditDraft>({ title: '', code: '', color: palette[0], category: 'Grundkurse', summary: '' })
  const [courseScheduleDraft, setCourseScheduleDraft] = useState<WeeklyEventDraft[]>([])
  const [editScheduleDraft, setEditScheduleDraft] = useState<WeeklyEventDraft[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [dialog, setDialog] = useState<'task' | 'course' | 'event' | null>(null)
  const [selectedCalendarEvent, setSelectedCalendarEvent] = useState<CalendarEvent | null>(null)
  const [selectedOccurrenceDate, setSelectedOccurrenceDate] = useState('')
  const [eventEditDraft, setEventEditDraft] = useState<CalendarEventEditDraft>({ title: '', event_type: 'lecture', one_time: true, weekday: '0', event_date: '', start_time: '', end_time: '' })
  const [eventComments, setEventComments] = useState<EventComment[]>([])
  const [eventCommentsLoading, setEventCommentsLoading] = useState(false)
  const [eventCommentDraft, setEventCommentDraft] = useState('')
  const [taskDraft, setTaskDraft] = useState<TaskDraft>({ title: '', description: '', due_date: dateKey(new Date()), priority: 'medium', course_id: '' })
  const [courseDraft, setCourseDraft] = useState<{ title: string; code: string; color: string; category: CourseCategory }>({ title: '', code: '', color: palette[0], category: 'Grundkurse' })
  const [eventDraft, setEventDraft] = useState<EventDraft>({ title: '', category: 'course', event_type: 'lecture', one_time: true, course_id: '', weekday: String((new Date().getDay() + 6) % 7), event_date: dateKey(new Date()), start_time: '09:00', end_time: '10:00' })
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(() => new Set(['Grundkurse', 'Nebenfächer', 'Wahlfächer', 'Seminare']))

  const weekStart = monday(cursor)
  const weekKey = dateKey(weekStart)
  const sectionKey: SectionKey | null = page === 'work' || page === 'girlfriend' || page === 'personal' ? page : null
  const sectionNoteRequestKey = sectionKey ? `${sectionKey}:${weekKey}` : ''
  const sectionNoteLoading = Boolean(sectionKey && sectionNoteLoadedKey !== sectionNoteRequestKey)
  const sectionScheduleEditing = sectionKey !== null && editingSectionKey === sectionKey
  const notesRequestKey = `${weekKey}:${courses.map((item) => item.id).join(',')}`
  const notesLoading = page === 'notes' && loadedNotesKey !== notesRequestKey
  const course = courses.find((item) => item.id === selectedCourse) ?? courses[0] ?? null
  const courseId = course?.id
  const visibleTasks = tasks.filter((task) => activeFilters.has('tasks') && (courseFilter === 'all' || task.course_id === Number(courseFilter)))
  const allCalendarEvents: CalendarEvent[] = [...events, ...sectionEvents.map((event) => ({
    ...event,
    event_type: 'section' as const,
    course_id: null,
    event_date: null,
  })), ...sectionSpecialEvents.map((event) => ({
    ...event,
    event_type: 'section' as const,
    course_id: null,
    weekday: null,
  }))]
  const visibleEvents = allCalendarEvents.filter((event) => activeFilters.has(event.section ? `section-${event.section}` : event.event_type) && (event.section !== undefined || courseFilter === 'all' || event.course_id === Number(courseFilter)))
  const eventEditIsOneTime = Boolean(selectedCalendarEvent && (selectedCalendarEvent.section
    ? selectedCalendarEvent.event_date
    : selectedCalendarEvent.event_type === 'personal' || eventEditDraft.one_time))
  const selectedOccurrenceCancelled = Boolean(selectedCalendarEvent && eventOccurrenceExceptions.some((exception) =>
    exception.event_kind === occurrenceKindForEvent(selectedCalendarEvent)
    && exception.event_id === selectedCalendarEvent.id
    && exception.occurrence_date === selectedOccurrenceDate))
  const visibleOpenTasks = visibleTasks.filter((task) => !task.is_completed).sort((a, b) => a.due_date.localeCompare(b.due_date))
  const rangeLabel = calendarView === 'week'
    ? `${format(weekStart, 'MMM d')} – ${format(addDays(weekStart, 6), 'MMM d, yyyy')}`
    : calendarView === 'month'
      ? format(cursor, 'MMMM yyyy')
      : format(cursor, 'yyyy')

  function moveCalendar(amount: number) {
    setCursor((current) => calendarView === 'week'
      ? (amount < 0 ? subWeeks(current, 1) : addWeeks(current, 1))
      : calendarView === 'month'
        ? (amount < 0 ? subMonths(current, 1) : addMonths(current, 1))
        : (amount < 0 ? subYears(current, 1) : addYears(current, 1)))
  }

  function chooseDate(date: Date) {
    setCursor(date)
    chooseCalendarView('week')
  }

  function chooseMonth(date: Date) {
    setCursor(date)
    chooseCalendarView('month')
  }

  function chooseCalendarView(view: CalendarView) {
    setCalendarView(view)
    localStorage.setItem('unotes-calendar-view', view)
  }

  async function refresh() {
    const [nextCourses, nextTasks, nextEvents, nextSectionEvents, nextSectionSpecialEvents, nextExceptions] = await Promise.all([api.courses(), api.tasks(), api.calendarEvents(), api.sectionEvents(), api.sectionSpecialEvents(), api.eventOccurrenceExceptions()])
    setCourses(nextCourses)
    setTasks(nextTasks)
    setEvents(nextEvents)
    setSectionEvents(nextSectionEvents)
    setSectionSpecialEvents(nextSectionSpecialEvents)
    setEventOccurrenceExceptions(nextExceptions)
    setSelectedCourse((current) => current ?? nextCourses[0]?.id ?? null)
  }

  useEffect(() => {
    let active = true
    Promise.all([api.courses(), api.tasks(), api.calendarEvents(), api.sectionEvents(), api.sectionSpecialEvents(), api.eventOccurrenceExceptions()]).then(([nextCourses, nextTasks, nextEvents, nextSectionEvents, nextSectionSpecialEvents, nextExceptions]) => {
      if (!active) return
      setCourses(nextCourses)
      setTasks(nextTasks)
      setEvents(nextEvents)
      setSectionEvents(nextSectionEvents)
      setSectionSpecialEvents(nextSectionSpecialEvents)
      setEventOccurrenceExceptions(nextExceptions)
      setSelectedCourse(nextCourses[0]?.id ?? null)
    }).catch((reason: unknown) => {
      if (active) setError(reason instanceof Error ? reason.message : 'Could not connect to the app.')
    }).finally(() => {
      if (active) setLoading(false)
    })
    return () => { active = false }
  }, [])

  useEffect(() => {
    if (!courseId) return
    let active = true
    api.weeklyNote(courseId, weekKey).then((nextNote) => {
      if (active) { setNote(nextNote); setSummary(nextNote.summary); setSummaryDirty(false) }
    }).catch((reason: unknown) => setError(reason instanceof Error ? reason.message : 'Could not load the weekly note.'))
    return () => { active = false }
  }, [courseId, weekKey])

  useEffect(() => {
    if (!sectionKey) return
    let active = true
    api.sectionWeeklyNote(sectionKey, weekKey).then((nextNote) => {
      if (!active) return
      setSectionNote(nextNote)
      setSectionSummary(nextNote.summary)
      setSectionSummaryDirty(false)
    }).catch((reason: unknown) => {
      if (active) setError(reason instanceof Error ? reason.message : 'Could not load this week’s notes.')
    }).finally(() => {
      if (active) setSectionNoteLoadedKey(sectionNoteRequestKey)
    })
    return () => { active = false }
  }, [sectionKey, sectionNoteRequestKey, weekKey])

  useEffect(() => {
    if (page !== 'notes') return
    let active = true
    Promise.all(courses.map((item) => api.weeklyNote(item.id, weekKey))).then((notes) => {
      if (active) setWeekNotes(notes.filter((item) => item.summary.trim() || item.attachments.length))
    }).catch((reason: unknown) => {
      if (active) {
        setWeekNotes([])
        setError(reason instanceof Error ? reason.message : 'Could not load this week’s notes.')
      }
    }).finally(() => {
      if (active) setLoadedNotesKey(notesRequestKey)
    })
    return () => { active = false }
  }, [page, courses, weekKey, notesRequestKey])

  useEffect(() => {
    if (!course) return
    setCourseSummary(course.summary ?? '')
    setCourseSummaryDirty(false)
    setCourseSummaryExpanded(false)
  }, [course?.id])

  useEffect(() => {
    if (!courseId) return
    let active = true
    setCourseLinks([])
    setCourseLinkDrafts([newCourseLinkDraft()])
    setCourseLinksDirty(false)
    api.courseLinks(courseId).then((links) => {
      if (!active) return
      setCourseLinks(links)
      setCourseLinkDrafts(savedCourseLinkDrafts(links))
    }).catch((reason: unknown) => {
      if (active) setError(reason instanceof Error ? reason.message : 'Could not load course links.')
    })
    return () => { active = false }
  }, [courseId])

  useEffect(() => {
    if (dialog === 'course') setCourseScheduleDraft([])
  }, [dialog])

  useEffect(() => {
    const sync = () => {
      if (document.visibilityState === 'hidden') return
      Promise.all([api.courses(), api.tasks(), api.calendarEvents(), api.sectionEvents(), api.sectionSpecialEvents(), api.eventOccurrenceExceptions()]).then(([nextCourses, nextTasks, nextEvents, nextSectionEvents, nextSectionSpecialEvents, nextExceptions]) => {
        setCourses(nextCourses)
        setTasks(nextTasks)
        setEvents(nextEvents)
        setSectionEvents(nextSectionEvents)
        setSectionSpecialEvents(nextSectionSpecialEvents)
        setEventOccurrenceExceptions(nextExceptions)
        setSelectedCourse((current) => current ?? nextCourses[0]?.id ?? null)
      }).catch((reason: unknown) => setError(reason instanceof Error ? reason.message : 'Could not sync your semester.'))
      if (courseId) api.weeklyNote(courseId, weekKey).then((nextNote) => {
        setNote(nextNote)
        if (!summaryDirty) setSummary(nextNote.summary)
      }).catch((reason: unknown) => setError(reason instanceof Error ? reason.message : 'Could not sync the weekly note.'))
      if (sectionKey) api.sectionWeeklyNote(sectionKey, weekKey).then((nextNote) => {
        setSectionNote(nextNote)
        if (sectionNoteLoadedKey === sectionNoteRequestKey && !sectionSummaryDirty) setSectionSummary(nextNote.summary)
      }).catch((reason: unknown) => setError(reason instanceof Error ? reason.message : 'Could not sync this section’s note.'))
    }
    window.addEventListener('focus', sync)
    document.addEventListener('visibilitychange', sync)
    const interval = window.setInterval(sync, 30_000)
    return () => {
      window.removeEventListener('focus', sync)
      document.removeEventListener('visibilitychange', sync)
      window.clearInterval(interval)
    }
  }, [courseId, weekKey, summaryDirty, sectionKey, sectionNoteLoadedKey, sectionNoteRequestKey, sectionSummaryDirty])

  async function runAction(action: () => Promise<unknown>) {
    setBusy(true); setError('')
    try { await action(); await refresh() }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Something went wrong.') }
    finally { setBusy(false) }
  }

  async function saveSummary() {
    if (!course) return
    setSaving(true); setError('')
    try {
      setNote(await api.saveWeeklyNote(course.id, weekKey, summary))
      setSummaryDirty(false)
    }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not save your summary.') }
    finally { setSaving(false) }
  }

  async function saveSectionSummary() {
    if (!sectionKey) return
    setSaving(true); setError('')
    try {
      const saved = await api.saveSectionWeeklyNote(sectionKey, weekKey, sectionSummary)
      setSectionNote(saved)
      setSectionNoteLoadedKey(sectionNoteRequestKey)
      setSectionSummaryDirty(false)
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not save this week’s note.') }
    finally { setSaving(false) }
  }

  function openSectionScheduleEditor() {
    if (!sectionKey) return
    setSectionScheduleDraft(sectionEvents.filter((event) => event.section === sectionKey).map(({ id, title, weekday, start_time, end_time }) => ({ id, title, weekday, start_time, end_time })))
    setEditingSectionKey(sectionKey)
  }

  async function saveSectionSchedule() {
    if (!sectionKey) return
    const invalidEvent = sectionScheduleDraft.some((item) => !item.title.trim() || (item.start_time === null) !== (item.end_time === null) || (item.start_time && item.end_time && item.end_time <= item.start_time))
    if (invalidEvent) {
      setError('Give every recurring event a title and valid start and end times, or leave both times blank.')
      return
    }
    setSaving(true); setError('')
    try {
      const updated = await api.saveSectionEvents(sectionKey, sectionScheduleDraft.map((item) => ({ ...item, title: item.title.trim(), start_time: item.start_time || null, end_time: item.end_time || null })))
      setSectionEvents((current) => [...current.filter((item) => item.section !== sectionKey), ...updated])
      setEditingSectionKey(null)
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not save the weekly schedule.') }
    finally { setSaving(false) }
  }

  async function saveCourseSummary() {
    if (!course) return
    setSaving(true); setError('')
    try {
      const updated = await api.updateCourse(course.id, { summary: courseSummary })
      setCourses((current) => current.map((c) => c.id === course.id ? { ...c, ...updated } : c))
      setCourseSummaryDirty(false)
    }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not save the course summary.') }
    finally { setSaving(false) }
  }

  function openCourseEditor() {
    if (!course) return
    setCourseEditDraft({ title: course.title, code: course.code ?? '', color: course.color, category: course.category, summary: courseSummary })
    setCourseLinkDrafts(savedCourseLinkDrafts(courseLinks))
    setCourseLinksDirty(false)
    setEditScheduleDraft(events.filter((item) => item.course_id === course.id && item.weekday !== null && item.event_type !== 'personal').map((item) => ({
      id: item.id,
      title: item.title,
      event_type: item.event_type as CourseEventType,
      weekday: item.weekday!,
      start_time: item.start_time ?? '',
      end_time: item.end_time ?? '',
    })))
    setEditCourseOpen(true)
  }

  async function saveCourseSettings(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!course) return
    if (courseLinkDrafts.some((link) => Boolean(link.label.trim()) !== Boolean(link.url.trim()))) {
      setError('Each course link needs both a label and a URL.')
      return
    }
    await runAction(async () => {
      const updated = await api.updateCourse(course.id, {
        title: courseEditDraft.title.trim(),
        code: courseEditDraft.code.trim() || null,
        color: courseEditDraft.color,
        category: courseEditDraft.category,
        summary: courseEditDraft.summary,
        weekly_events: serializeWeeklyEvents(editScheduleDraft),
      })
      const links = await api.saveCourseLinks(course.id, courseLinkDrafts
        .filter((link) => link.label.trim() && link.url.trim())
        .map((link) => ({ label: link.label.trim(), url: link.url.trim() })))
      setCourses((current) => current.map((item) => item.id === updated.id ? updated : item))
      setCourseLinks(links)
      setCourseLinkDrafts(savedCourseLinkDrafts(links))
      setCourseLinksDirty(false)
      setCourseSummary(updated.summary)
      setCourseSummaryDirty(false)
      setEditCourseOpen(false)
    })
  }

  async function addTask(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    await runAction(async () => {
      await api.createTask({ title: taskDraft.title.trim(), description: taskDraft.description.trim(), due_date: taskDraft.due_date, priority: taskDraft.priority, course_id: taskDraft.course_id ? Number(taskDraft.course_id) : null })
      setDialog(null)
    })
  }

  function openEventDialog() {
    setEventDraft({
      title: '',
      category: 'course',
      event_type: 'lecture',
      one_time: true,
      course_id: course?.id.toString() ?? '',
      weekday: String((cursor.getDay() + 6) % 7),
      event_date: dateKey(cursor),
      start_time: '09:00',
      end_time: '10:00',
    })
    setDialog('event')
  }

  async function addCalendarEvent(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    await runAction(async () => {
      if (eventDraft.category === 'course') {
        await api.createCalendarEvent({
          title: eventDraft.title.trim(),
          event_type: eventDraft.event_type,
          course_id: Number(eventDraft.course_id),
          weekday: eventDraft.one_time ? null : Number(eventDraft.weekday),
          event_date: eventDraft.one_time ? eventDraft.event_date : null,
          start_time: eventDraft.start_time || null,
          end_time: eventDraft.end_time || null,
        })
      } else {
        await api.createSectionSpecialEvent(eventDraft.category, {
          title: eventDraft.title.trim(),
          event_date: eventDraft.event_date,
          start_time: eventDraft.start_time || null,
          end_time: eventDraft.end_time || null,
        })
      }
      setDialog(null)
    })
  }

  async function deleteCalendarEvent(event: CalendarEvent) {
    if (!window.confirm(`Remove ${event.title || eventTypeLabels[event.event_type]}?`)) return
    await runAction(() => event.section
      ? event.event_date ? api.deleteSectionSpecialEvent(event.id) : api.deleteSectionEvent(event.id)
      : api.deleteCalendarEvent(event.id))
  }

  function openCalendarEvent(event: CalendarEvent, occurrenceDate: string) {
    setSelectedCalendarEvent(event)
    setSelectedOccurrenceDate(occurrenceDate)
    setEventEditDraft({
      title: event.title,
      event_type: event.event_type === 'lecture' || event.event_type === 'tutoring' || event.event_type === 'deadline' || event.event_type === 'meeting' ? event.event_type : 'lecture',
      one_time: Boolean(event.event_date || event.event_type === 'personal'),
      weekday: String(event.weekday ?? 0),
      event_date: event.event_date ?? '',
      start_time: event.start_time ?? '',
      end_time: event.end_time ?? '',
    })
    setEventCommentDraft('')
  }

  async function toggleSelectedOccurrence() {
    if (!selectedCalendarEvent || !selectedOccurrenceDate) return
    const kind = occurrenceKindForEvent(selectedCalendarEvent)
    await runAction(() => selectedOccurrenceCancelled
      ? api.restoreEventOccurrence(kind, selectedCalendarEvent.id, selectedOccurrenceDate)
      : api.cancelEventOccurrence(kind, selectedCalendarEvent.id, selectedOccurrenceDate))
  }

  useEffect(() => {
    if (!selectedCalendarEvent) {
      setEventComments([])
      return
    }
    let active = true
    setEventCommentsLoading(true)
    api.eventComments(commentKindForEvent(selectedCalendarEvent), selectedCalendarEvent.id).then((comments) => {
      if (active) setEventComments(comments)
    }).catch((reason: unknown) => {
      if (active) setError(reason instanceof Error ? reason.message : 'Could not load event comments.')
    }).finally(() => {
      if (active) setEventCommentsLoading(false)
    })
    return () => { active = false }
  }, [selectedCalendarEvent])

  async function saveCalendarEvent(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!selectedCalendarEvent) return
    if ((eventEditDraft.start_time === '') !== (eventEditDraft.end_time === '')) {
      setError('Provide both a start and end time, or leave both blank.')
      return
    }
    if (eventEditDraft.start_time && eventEditDraft.end_time <= eventEditDraft.start_time) {
      setError('End time must be later than start time.')
      return
    }
    await runAction(async () => {
      const selected = selectedCalendarEvent
      const start_time = eventEditDraft.start_time || null
      const end_time = eventEditDraft.end_time || null
      if (selected.section) {
        if (selected.event_date) {
          await api.updateSectionSpecialEvent(selected.id, {
            title: eventEditDraft.title.trim(),
            event_date: eventEditDraft.event_date,
            start_time,
            end_time,
          })
        } else {
          await api.updateSectionEvent(selected.id, {
            title: eventEditDraft.title.trim(),
            weekday: Number(eventEditDraft.weekday),
            start_time,
            end_time,
          })
        }
      } else {
        const isOneTime = selected.event_type === 'personal' || eventEditDraft.one_time
        await api.updateCalendarEvent(selected.id, {
          title: eventEditDraft.title.trim(),
          event_type: eventEditDraft.event_type,
          course_id: selected.course_id,
          weekday: isOneTime ? null : Number(eventEditDraft.weekday),
          event_date: isOneTime ? eventEditDraft.event_date : null,
          start_time,
          end_time,
        })
      }
      setSelectedCalendarEvent({
        ...selected,
        title: eventEditDraft.title.trim(),
        event_type: selected.section || selected.event_type === 'personal' ? selected.event_type : eventEditDraft.event_type,
        weekday: selected.section || !eventEditIsOneTime ? Number(eventEditDraft.weekday) : null,
        event_date: eventEditIsOneTime ? eventEditDraft.event_date : null,
        start_time,
        end_time,
      })
    })
  }

  async function addEventComment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!selectedCalendarEvent || !eventCommentDraft.trim()) return
    await runAction(async () => {
      await api.createEventComment(commentKindForEvent(selectedCalendarEvent), selectedCalendarEvent.id, eventCommentDraft.trim())
      setEventCommentDraft('')
      setEventComments(await api.eventComments(commentKindForEvent(selectedCalendarEvent), selectedCalendarEvent.id))
    })
  }

  async function deleteTask(task: Task) {
    if (!window.confirm(`Delete ${task.title}?`)) return
    await runAction(() => api.deleteTask(task.id))
  }

  function toggleFilter(filter: CalendarFilter) {
    setActiveFilters((current) => {
      const next = new Set(current)
      if (next.has(filter)) next.delete(filter)
      else next.add(filter)
      return next
    })
  }

  async function addCourse(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const hasInvalidSchedule = courseScheduleDraft.some((item) => (
      item.event_type !== 'deadline' && (!item.start_time || !item.end_time || item.end_time <= item.start_time)
    ))
    if (hasInvalidSchedule) {
      setError('Add valid times to every weekly event before creating the course.')
      return
    }
    await runAction(async () => {
      const created = await api.createCourse({ ...courseDraft, code: courseDraft.code.trim() || null, weekly_events: serializeWeeklyEvents(courseScheduleDraft) })
      setSelectedCourse(created.id)
      setCourseDraft({ title: '', code: '', color: palette[0], category: 'Grundkurse' })
      setCourseScheduleDraft([])
      setDialog(null)
      setPage('courses')
    })
  }

  async function uploadFiles(files: FileList | null) {
    if (!files?.length || !course) return
    setBusy(true); setError('')
    try {
      const activeNote = note?.id ? note : await api.saveWeeklyNote(course.id, weekKey, summary)
      for (const file of Array.from(files)) await api.upload(activeNote.id!, file)
      setNote(await api.weeklyNote(course.id, weekKey))
      setSummaryDirty(false)
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not upload the file.') }
    finally { setBusy(false) }
  }

  async function removeAttachment(id: number) {
    if (!course) return
    await runAction(async () => { await api.deleteAttachment(id); setNote(await api.weeklyNote(course.id, weekKey)) })
  }

  const courseFor = (courseId: number | null) => courses.find((item) => item.id === courseId)

  return <div className="app-shell">
    <aside className="sidebar">
      <a className="brand" href="#calendar" onClick={() => setPage('calendar')}><span className="brand-mark"><GraduationCap size={21} /></span><span>Unotes<small>SEMESTER PLANNER</small></span></a>
      <div className="sidebar-section-label">WORKSPACE</div>
      <nav className="primary-nav" aria-label="Main navigation">
        <button className={page === 'calendar' ? 'nav-item active' : 'nav-item'} onClick={() => setPage('calendar')}><CalendarDays size={18} /> Calendar <span className="nav-count">{visibleOpenTasks.length}</span></button>
        <button className={page === 'notes' ? 'nav-item active' : 'nav-item'} onClick={() => setPage('notes')}><FileText size={18} /> Notes</button>
        <button className={page === 'courses' ? 'nav-item active' : 'nav-item'} onClick={() => setPage('courses')}><BookOpen size={18} /> Courses</button>
        <button className={page === 'work' ? 'nav-item section-nav active' : 'nav-item section-nav'} onClick={() => setPage('work')}><BriefcaseBusiness size={17} /><span className="section-nav-dot" style={{ backgroundColor: sectionColors.work }} />Work</button>
        <button className={page === 'girlfriend' ? 'nav-item section-nav active' : 'nav-item section-nav'} onClick={() => setPage('girlfriend')}><Heart size={17} /><span className="section-nav-dot" style={{ backgroundColor: sectionColors.girlfriend }} />Girlfriend</button>
        <button className={page === 'personal' ? 'nav-item section-nav active' : 'nav-item section-nav'} onClick={() => setPage('personal')}><UserRound size={17} /><span className="section-nav-dot" style={{ backgroundColor: sectionColors.personal }} />Personal</button>
      </nav>
      <div className="sidebar-bottom"><div className="sync-indicator"><span /> Shared across your devices</div><span className="sidebar-caption">Open this address on your phone over Wi-Fi to share your semester.</span></div>
    </aside>

    <main className="main-area">
      <header className="topbar"><div className="mobile-brand"><GraduationCap size={19} /> Unotes</div><div className="breadcrumbs"><span>SEMESTER</span><ChevronRight size={14} /><strong>{sectionKey ? sectionNames[sectionKey] : page === 'calendar' ? 'Calendar' : page === 'notes' ? 'Notes' : 'Courses'}</strong></div><div className="topbar-right"><span className="today-label">{format(new Date(), 'EEEE, MMMM d')}</span><button className="button button-primary button-compact" onClick={openEventDialog}><Plus size={16} /> Add event</button></div></header>
      {error && <div className="error-banner" role="alert"><span>{error}</span><button onClick={() => setError('')} aria-label="Dismiss error"><X size={16} /></button></div>}
      {loading ? <div className="loading-state"><LoaderCircle className="spin" size={22} /> Loading your semester…</div> : page === 'calendar' ? <div className="page-content">
        <div className="page-heading calendar-page-heading"><div><div className="eyebrow">YOUR SEMESTER, IN ONE PLACE</div><h1>{calendarView === 'week' ? 'Plan the week.' : calendarView === 'month' ? 'See the month.' : 'Look ahead.'}</h1><p>Keep the coursework moving, one deadline at a time.</p></div><div className="calendar-controls"><div className="view-picker" role="group" aria-label="Calendar view"><span>VIEW</span>{(['week', 'month', 'year'] as const).map((view) => <button key={view} className={calendarView === view ? 'selected' : ''} aria-pressed={calendarView === view} onClick={() => chooseCalendarView(view)}>{view[0].toUpperCase() + view.slice(1)}</button>)}</div><div className="week-switcher"><button className="icon-button" onClick={() => moveCalendar(-1)} aria-label={`Previous ${calendarView}`}><ChevronLeft size={19} /></button><span className="week-range">{rangeLabel}</span><button className="icon-button" onClick={() => moveCalendar(1)} aria-label={`Next ${calendarView}`}><ChevronRight size={19} /></button><button className="button button-light today-button" onClick={() => setCursor(new Date())}>Today</button></div></div></div>
        <div className="calendar-filters"><button type="button" className="filter-toggle" aria-expanded={filtersExpanded} aria-controls="calendar-filter-options" onClick={() => setFiltersExpanded((expanded) => !expanded)}><Filter size={15} /><span>SHOW</span><ChevronDown className={filtersExpanded ? 'expanded' : ''} size={14} /></button>{filtersExpanded && <div className="filter-options" id="calendar-filter-options">{([['tasks', 'Tasks'], ['lecture', 'Lectures'], ['tutoring', 'Tutoring'], ['deadline', 'Deadlines'], ['meeting', 'Meetings'], ['personal', 'Personal'], ['section-work', 'Work'], ['section-girlfriend', 'Girlfriend'], ['section-personal', 'Personal plan']] as const).map(([filter, label]) => <label className={`filter-option filter-${filter}`} key={filter}><input type="checkbox" checked={activeFilters.has(filter)} onChange={() => toggleFilter(filter)} /><span>{label}</span></label>)}</div>}<label className="course-filter"><span>COURSE</span><select aria-label="Filter by course" value={courseFilter} onChange={(event) => setCourseFilter(event.target.value)}><option value="all">All courses</option>{courses.map((item) => <option key={item.id} value={item.id}>{item.code ? `${item.code} · ${item.title}` : item.title}</option>)}</select><ChevronDown size={14} /></label>{calendarView === 'week' && <button className="button button-light add-event-button" onClick={() => window.print()} title="Print or save this week as PDF"><FileText size={14} /> Export PDF</button>}<button className="button button-light add-event-button" onClick={openEventDialog}><Plus size={15} /> Add event</button></div>
        <CalendarDisplay view={calendarView} cursor={cursor} tasks={visibleTasks} events={visibleEvents} courses={courses} occurrenceExceptions={eventOccurrenceExceptions} onSelectDate={chooseDate} onSelectMonth={chooseMonth} onSelectEvent={openCalendarEvent} onToggleTask={(task) => runAction(() => api.updateTask(task.id, { is_completed: !task.is_completed }))} onDeleteTask={deleteTask} onDeleteEvent={deleteCalendarEvent} onAddTask={(date) => { setTaskDraft({ title: '', description: '', due_date: dateKey(date), priority: 'medium', course_id: '' }); setDialog('task') }} />
        <div className="dashboard-lower"><section className="task-section"><div className="section-title-row"><div><div className="section-kicker">IN YOUR QUEUE</div><h2>Upcoming work</h2></div><span className="quiet-count">{visibleOpenTasks.length} open</span></div>{visibleOpenTasks.length ? <div className="task-list">{visibleOpenTasks.slice(0, 7).map((task) => { const taskCourse = courseFor(task.course_id); const due = parseISO(task.due_date); return <div className="task-row" key={task.id}><button className="task-check" aria-label={`Mark ${task.title} complete`} onClick={() => runAction(() => api.updateTask(task.id, { is_completed: true }))}><Circle size={19} /></button><div className="task-main"><strong>{task.title}</strong><span><i style={{ backgroundColor: taskCourse?.color ?? '#87918b' }} />{taskCourse?.code || taskCourse?.title || 'Personal'}{task.description && <span className="task-description"> · {task.description}</span>}</span></div><span className={`priority priority-${task.priority}`}>{task.priority}</span><time className={due < new Date(new Date().setHours(0, 0, 0, 0)) ? 'overdue' : ''}>{format(due, 'MMM d')}</time><button className="icon-button small task-delete" title="Delete task" aria-label={`Delete ${task.title}`} onClick={() => deleteTask(task)}><Trash2 size={15} /></button></div> })}</div> : <div className="empty-inline"><CheckCircle2 size={19} /> No tasks match these filters.</div>}</section>
          <section className="weekly-card"><div className="section-title-row"><div><div className="section-kicker">NOTES</div><h2>This week, in class</h2></div><button className="text-link" onClick={() => setPage('courses')}>Open notes <ArrowRight size={14} /></button></div>{course ? <><label className="select-wrap"><span className="course-dot" style={{ backgroundColor: course.color }} /><select aria-label="Course for weekly notes" value={course.id} onChange={(event) => setSelectedCourse(Number(event.target.value))}>{courses.map((item) => <option key={item.id} value={item.id}>{item.code ? `${item.code} · ${item.title}` : item.title}</option>)}</select><ChevronDown size={15} /></label><textarea className="summary-quick" value={summary} onChange={(event) => { setSummary(event.target.value); setSummaryDirty(true) }} placeholder="A thought, a reading, something to remember…" aria-label="Weekly course summary" /><div className="quick-note-foot"><span>{note?.attachments.length ?? 0} files attached</span><button className="button button-dark button-compact" onClick={saveSummary} disabled={saving}>{saving ? 'Saving…' : 'Save note'}{!saving && <Check size={15} />}</button></div></> : <div className="empty-note"><BookOpen size={20} /><span>Add a course to start your weekly notes.</span><button className="text-link" onClick={() => setDialog('course')}>Add course <ArrowRight size={14} /></button></div>}</section>
        </div>
      </div> : page === 'notes' ? <div className="page-content notes-page">
        <div className="page-heading notes-page-heading"><div><div className="eyebrow">YOUR CLASS NOTES</div><h1>Notes by week.</h1><p>Saved notes from every course, gathered one week at a time.</p></div><div className="week-switcher"><button className="icon-button" onClick={() => setCursor(subWeeks(cursor, 1))} aria-label="Previous week"><ChevronLeft size={19} /></button><span className="week-range">{format(weekStart, 'MMM d')} – {format(addDays(weekStart, 6), 'MMM d, yyyy')}</span><button className="icon-button" onClick={() => setCursor(addWeeks(cursor, 1))} aria-label="Next week"><ChevronRight size={19} /></button><button className="button button-light today-button" onClick={() => setCursor(new Date())}>This week</button></div></div>
        <section className="notes-week-list" aria-label={`Notes for the week of ${format(weekStart, 'MMMM d, yyyy')}`}>
          <div className="notes-week-heading"><span className="section-kicker">WEEK OF {format(weekStart, 'MMMM d, yyyy').toUpperCase()}</span><span className="quiet-count">{weekNotes.length} {weekNotes.length === 1 ? 'note' : 'notes'}</span></div>
          {notesLoading ? <div className="empty-inline"><LoaderCircle className="spin" size={18} /> Loading notes…</div> : weekNotes.length ? weekNotes.map((weeklyNote) => {
            const noteCourse = courses.find((item) => item.id === weeklyNote.course_id)
            if (!noteCourse) return null
            return <article className="week-note" key={weeklyNote.course_id} style={{ '--course-color': noteCourse.color } as React.CSSProperties}>
              <header className="week-note-heading"><span className="course-dot" style={{ backgroundColor: noteCourse.color }} /><div><strong>{noteCourse.title}</strong>{noteCourse.code && <small>{noteCourse.code}</small>}</div><span className="week-note-date">{format(parseISO(weeklyNote.week_start), 'MMM d')}</span></header>
              {weeklyNote.summary.trim() && <LinkedNoteText text={weeklyNote.summary} />}
              {weeklyNote.attachments.length > 0 && <ul className="week-note-files">{weeklyNote.attachments.map((file) => <li key={file.id}><a href={`/api/attachments/${file.id}/download`}><FileText size={14} />{file.filename}</a></li>)}</ul>}
            </article>
          }) : <div className="notes-empty"><FileText size={21} /><span>No saved notes for this week.</span></div>}
        </section>
      </div> : sectionKey ? <div className="page-content section-page" style={{ '--section-color': sectionColors[sectionKey] } as React.CSSProperties}>
        <div className="page-heading section-page-heading"><div><div className="eyebrow">WEEKLY SPACE</div><h1>{sectionNames[sectionKey]}.</h1><p>Notes and recurring plans, kept in their own section.</p></div><div className="week-switcher"><button className="icon-button" onClick={() => setCursor(subWeeks(cursor, 1))} aria-label="Previous week"><ChevronLeft size={19} /></button><span className="week-range">{format(weekStart, 'MMM d')} – {format(addDays(weekStart, 6), 'MMM d, yyyy')}</span><button className="icon-button" onClick={() => setCursor(addWeeks(cursor, 1))} aria-label="Next week"><ChevronRight size={19} /></button><button className="button button-light today-button" onClick={() => setCursor(new Date())}>This week</button></div></div>
        <section className="section-notes-panel">
          <div className="section-title-row"><div><div className="section-kicker">WEEKLY NOTES</div><h2>Week of {format(weekStart, 'MMMM d')}</h2></div><span className="autosave-state">{sectionNoteLoading ? 'Loading…' : sectionNote?.updated_at ? `Saved ${format(parseISO(sectionNote.updated_at), 'h:mm a')}` : 'Not saved yet'}</span></div>
          <textarea className="section-note-editor" value={sectionSummary} onChange={(event) => { setSectionSummary(event.target.value); setSectionSummaryDirty(true) }} placeholder={`Notes for ${sectionNames[sectionKey].toLowerCase()} this week…`} maxLength={12000} aria-label={`${sectionNames[sectionKey]} weekly notes`} disabled={sectionNoteLoading} />
          <div className="section-note-actions"><span>{sectionSummaryDirty ? 'Unsaved changes' : `${sectionSummary.length} / 12,000`}</span><button className="button button-dark button-compact" onClick={saveSectionSummary} disabled={saving || sectionNoteLoading || !sectionSummaryDirty}>{saving ? 'Saving…' : 'Save note'}{!saving && sectionSummaryDirty && <Check size={15} />}</button></div>
          {!sectionNoteLoading && sectionNote?.summary.trim() && <div className="section-note-preview"><div className="section-kicker">SAVED NOTE</div><LinkedNoteText text={sectionNote.summary} /></div>}
        </section>
        <section className="section-schedule-section">
          <div className="section-title-row"><div><div className="section-kicker">REPEATS EVERY WEEK</div><h2>Recurring events</h2></div>{sectionScheduleEditing ? <div className="section-schedule-actions"><button className="button button-light button-compact" onClick={() => setEditingSectionKey(null)}>Cancel</button><button className="button button-dark button-compact" onClick={saveSectionSchedule} disabled={saving}>{saving ? 'Saving…' : 'Save schedule'}{!saving && <Check size={14} />}</button></div> : <button className="button button-light button-compact" onClick={openSectionScheduleEditor}><Pencil size={14} /> Edit schedule</button>}</div>
          {sectionScheduleEditing ? <SectionScheduleEditor value={sectionScheduleDraft} onChange={setSectionScheduleDraft} /> : <div className="section-schedule-grid">{['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'].map((day, dayIndex) => {
            const dayEvents = sectionEvents.filter((event) => event.section === sectionKey && event.weekday === dayIndex).sort((first, second) => (first.start_time ?? '').localeCompare(second.start_time ?? ''))
            return <div className="section-schedule-day" key={day}><h3>{day}</h3>{dayEvents.length ? dayEvents.map((event) => <div className="section-schedule-event" key={event.id}><strong>{event.title}</strong><small>{event.start_time && event.end_time ? `${event.start_time} – ${event.end_time}` : 'All day'}</small></div>) : <span className="section-schedule-empty">No events</span>}</div>
          })}</div>}
        </section>
      </div> : page === 'courses' ? <div className="page-content course-page">
        <div className="page-heading course-page-heading"><div><div className="eyebrow">A HOME FOR EVERY CLASS</div><h1>Course notebook.</h1><p>Weekly summaries, readings, and the files you’ll need later.</p></div><button className="button button-light" onClick={() => setDialog('course')}><Plus size={16} /> New course</button></div>
        {course ? <div className="course-workspace" style={{ '--course-color': course.color } as React.CSSProperties}><aside className="notebook-course-list"><div className="section-kicker">YOUR COURSES <span>{courses.length}</span></div>{(['Grundkurse', 'Nebenfächer', 'Wahlfächer', 'Seminare'] as const).map((category) => { const coursesInCategory = courses.filter(c => c.category === category); return coursesInCategory.length > 0 ? <div key={category}><button className="category-header" onClick={() => setExpandedCategories(prev => { const next = new Set(prev); next.has(category) ? next.delete(category) : next.add(category); return next })}><ChevronRight size={14} style={{ transform: expandedCategories.has(category) ? 'rotate(90deg)' : 'rotate(0deg)', transition: 'transform 0.2s' }} /><span>{category}</span><span className="category-count">({coursesInCategory.length})</span></button>{expandedCategories.has(category) && coursesInCategory.map((item) => <button key={item.id} onClick={() => setSelectedCourse(item.id)} className={course.id === item.id ? 'notebook-course active' : 'notebook-course'}><span className="course-swatch" style={{ backgroundColor: item.color }} /><span><strong>{item.code || item.title}</strong><small>{item.code ? item.title : 'Course notebook'}</small></span><ChevronRight size={15} /></button>)}</div> : null })} <button className="add-course-row" onClick={() => setDialog('course')}><Plus size={15} /> Add a course</button></aside>
          <div className="course-main">
            <header className="course-header">
              <div className="course-header-left">
                <span className="course-swatch large" style={{ backgroundColor: course.color }} />
                <div>
                  <div className="eyebrow">{course.code || 'COURSE'}</div>
                  <h2>{course.title}</h2>
                </div>
              </div>
              <div className="course-header-right">
                <button className="icon-button" type="button" title="Edit course settings" aria-label={`Edit ${course.title} settings`} onClick={openCourseEditor}><Pencil size={16} /></button>
                <button className="icon-button delete-course" title="Delete course" aria-label="Delete course" onClick={() => { if (window.confirm(`Delete ${course.title} and its notes?`)) runAction(async () => { await api.deleteCourse(course.id); setSelectedCourse(courses.find((item) => item.id !== course.id)?.id ?? null) }) }}><Trash2 size={16} /></button>
              </div>
            </header>

            <section className={`course-summary-panel${courseSummaryExpanded ? ' expanded' : ''}`}>
              <button className="course-summary-toggle" type="button" aria-expanded={courseSummaryExpanded} onClick={() => setCourseSummaryExpanded((expanded) => !expanded)}>
                <span><span className="section-kicker">COURSE SUMMARY</span><strong>{course.title}</strong></span>
                <ChevronDown size={17} />
              </button>
              {courseSummaryExpanded && <div className="course-summary-content">
                <textarea value={courseSummary} onChange={(e) => { setCourseSummary(e.target.value); setCourseSummaryDirty(true) }} placeholder={`Summary for ${course.title}…`} maxLength={5000} aria-label={`${course.title} summary`} />
                <button className="button button-dark button-compact" onClick={saveCourseSummary} disabled={saving || !courseSummaryDirty}>{saving ? 'Saving…' : 'Save summary'}{!saving && courseSummaryDirty && <Check size={15} />}</button>
              </div>}
            </section>
            <section className="course-links-section" aria-label="Course links">
              <div className="course-links-heading"><div><strong>Course links</strong></div></div>
              {courseLinks.length ? <div className="course-link-list">{courseLinks.map((link) => <a key={link.id} href={link.url} target="_blank" rel="noopener noreferrer">{link.label}<ArrowRight size={13} /></a>)}</div> : <small className="course-links-empty">No course links added.</small>}
            </section>

            <div className="note-week-bar">
              <div>
                <span className="section-kicker">WEEK OF</span>
                <strong>{format(weekStart, 'MMMM d, yyyy')}</strong>
              </div>
              <div className="week-arrows">
                <button className="icon-button small" onClick={() => setCursor(subWeeks(cursor, 1))} aria-label="Previous week"><ArrowLeft size={16} /></button>
                <button className="icon-button small" onClick={() => setCursor(addWeeks(cursor, 1))} aria-label="Next week"><ArrowRight size={16} /></button>
              </div>
            </div>
            <section className="schedule-section">
              <div className="schedule-section-header">
                <h2>Weekly schedule</h2>
              </div>
              <div className="schedule-grid">
                {(() => {
                  const courseEvents = events.filter((event) => event.course_id === course.id && event.event_type !== 'personal')
                  const eventsByDay: Record<number, CalendarEvent[]> = {}
                  for (let day = 0; day < 7; day++) {
                    eventsByDay[day] = courseEvents.filter((event) => event.weekday === day).sort((a, b) => (a.start_time ?? '').localeCompare(b.start_time ?? ''))
                  }
                  return ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'].map((day, dayIndex) => <div key={dayIndex} className="schedule-day"><h3>{day}</h3><div className="events-list">{eventsByDay[dayIndex]?.map((event) => <div key={event.id} className={`event-item event-${event.event_type}`} style={{ borderLeftColor: tintColor(course.color, event.event_type === 'tutoring' ? 0.36 : 0) }}><div className="event-main"><strong>{eventTypeLabels[event.event_type]}</strong><small>{event.event_type === 'deadline' ? 'All day' : `${event.start_time} – ${event.end_time}`}</small></div><button className="icon-button small" onClick={() => runAction(async () => { await api.deleteCalendarEvent(event.id); const nextEvents = await api.calendarEvents(); setEvents(nextEvents) })} title="Delete event" aria-label={`Delete ${event.title || eventTypeLabels[event.event_type]}`}><Trash2 size={15} /></button></div>)}</div></div>)
                })()}
              </div>
            </section>

            <div className="course-content-bottom">
              <div className="summary-editor">
                <div className="editor-heading">
                  <FileText size={18} />
                  <div>
                    <strong>Weekly summary</strong>
                    <small>Capture the ideas, details, and questions from this week.</small>
                  </div>
                  <span className="autosave-state">{summaryDirty ? 'Unsaved changes' : saving ? 'Saving…' : note?.updated_at ? `Saved ${format(parseISO(note.updated_at), 'h:mm a')}` : 'Not saved yet'}</span>
                </div>
                <textarea value={summary} onChange={(event) => { setSummary(event.target.value); setSummaryDirty(true) }} placeholder="What did you cover? What stood out? What should you revisit?" />
                <div className="editor-actions">
                  <span>{summary.length} / 12,000</span>
                  <button className="button button-dark button-compact" onClick={saveSummary} disabled={saving}>{saving ? 'Saving…' : 'Save summary'}{!saving && <Check size={15} />}</button>
                </div>
              </div>

              <div className="files-section">
                <div className="files-heading">
                  <div>
                    <div className="section-kicker">COURSE MATERIAL</div>
                    <h3>This week's files <span>{note?.attachments.length ?? 0}</span></h3>
                  </div>
                  <label className="button button-light upload-button"><Upload size={16} /> Add files<input type="file" multiple onChange={(event) => { void uploadFiles(event.target.files); event.currentTarget.value = '' }} /></label>
                </div>
                <div className="file-list">
                  {note?.attachments.map((file) => <div className="file-row" key={file.id}><span className="file-icon"><FileText size={18} /></span><span className="file-name"><strong>{file.filename}</strong><small>{formatBytes(file.size)} · added {format(parseISO(file.created_at), 'MMM d')}</small></span><a className="icon-button small" href={`/api/attachments/${file.id}/download`} title="Download file" aria-label={`Download ${file.filename}`}><ArrowDownToLine size={16} /></a><button className="icon-button small file-delete" onClick={() => removeAttachment(file.id)} title="Remove file" aria-label={`Remove ${file.filename}`}><Trash2 size={15} /></button></div>)}
                  {!note?.attachments.length && <label className="file-drop"><FolderOpen size={22} /><span><strong>Nothing attached yet</strong><small>Choose notes, slides, readings, or other course files.</small></span><input type="file" multiple onChange={(event) => { void uploadFiles(event.target.files); event.currentTarget.value = '' }} /></label>}
                </div>
                <p className="upload-hint"><FileText size={13} /> PDF, documents, slides, images, spreadsheets, text, and ZIP · 12 MB max each</p>
              </div>
            </div>
          </div>
        </div> : <div className="empty-courses"><BookOpen size={27} /><h2>Your semester starts here.</h2><p>Create a course to keep its weekly notes and files together.</p><button className="button button-dark" onClick={() => setDialog('course')}><Plus size={16} /> Add your first course</button></div>}
      </div> : null}
    </main>

    <nav className="mobile-nav" aria-label="Mobile navigation"><button className={page === 'calendar' ? 'active' : ''} onClick={() => setPage('calendar')}><CalendarDays size={18} />Calendar</button><button className={page === 'notes' ? 'active' : ''} onClick={() => setPage('notes')}><FileText size={18} />Notes</button><button className={page === 'courses' ? 'active' : ''} onClick={() => setPage('courses')}><BookOpen size={18} />Courses</button><button className={page === 'work' ? 'active' : ''} onClick={() => setPage('work')}><BriefcaseBusiness size={18} />Work</button><button className={page === 'girlfriend' ? 'active' : ''} onClick={() => setPage('girlfriend')}><Heart size={18} />Girlfriend</button><button className={page === 'personal' ? 'active' : ''} onClick={() => setPage('personal')}><UserRound size={18} />Personal</button><button onClick={() => setDialog('task')}><Plus size={18} />Task</button></nav>
    {dialog && dialog !== 'event' && <div className="dialog-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setDialog(null) }}><dialog className="dialog" open aria-labelledby="dialog-title"><div className="dialog-heading"><div><div className="eyebrow">{dialog === 'task' ? 'KEEP IT MOVING' : 'BUILD YOUR SEMESTER'}</div><h2 id="dialog-title">{dialog === 'task' ? 'Add a task' : 'Add a course'}</h2></div><button className="icon-button" onClick={() => setDialog(null)} aria-label="Close"><X size={19} /></button></div>
      {dialog === 'task' ? <form className="dialog-form" onSubmit={addTask}><label>Task title<input autoFocus required maxLength={160} value={taskDraft.title} onChange={(event) => setTaskDraft({ ...taskDraft, title: event.target.value })} placeholder="e.g. Read week 4 paper" /></label><label>Details <span className="optional">OPTIONAL</span><textarea maxLength={4000} value={taskDraft.description} onChange={(event) => setTaskDraft({ ...taskDraft, description: event.target.value })} placeholder="A short reminder" rows={3} /></label><div className="form-two"><label>Due date<input type="date" required value={taskDraft.due_date} onChange={(event) => setTaskDraft({ ...taskDraft, due_date: event.target.value })} /></label><label>Priority<select value={taskDraft.priority} onChange={(event) => setTaskDraft({ ...taskDraft, priority: event.target.value as Task['priority'] })}><option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option></select></label></div><label>Course<select value={taskDraft.course_id} onChange={(event) => setTaskDraft({ ...taskDraft, course_id: event.target.value })}><option value="">Personal / no course</option>{courses.map((item) => <option key={item.id} value={item.id}>{item.code ? `${item.code} · ` : ''}{item.title}</option>)}</select></label><div className="dialog-actions"><button type="button" className="button button-light" onClick={() => setDialog(null)}>Cancel</button><button className="button button-dark" disabled={busy}><Plus size={16} /> Create task</button></div></form> : <form className="dialog-form" onSubmit={addCourse}><label>Course name<input autoFocus required maxLength={100} value={courseDraft.title} onChange={(event) => setCourseDraft({ ...courseDraft, title: event.target.value })} placeholder="e.g. Introduction to Sociology" /></label><label>Course code <span className="optional">OPTIONAL</span><input maxLength={24} value={courseDraft.code} onChange={(event) => setCourseDraft({ ...courseDraft, code: event.target.value })} placeholder="e.g. SOC 201" /></label><label>Category<select value={courseDraft.category} onChange={(event) => setCourseDraft({ ...courseDraft, category: event.target.value as any })}><option value="Grundkurse">Grundkurse</option><option value="Nebenfächer">Nebenfächer</option><option value="Wahlfächer">Wahlfächer</option><option value="Seminare">Seminare</option></select></label><fieldset className="color-field"><legend>Course color</legend><div className="color-options">{palette.map((color) => <button key={color} type="button" className={courseDraft.color === color ? 'color-option selected' : 'color-option'} style={{ backgroundColor: color }} onClick={() => setCourseDraft({ ...courseDraft, color })} aria-label={`Select ${color}`} aria-pressed={courseDraft.color === color}>{courseDraft.color === color && <Check size={15} />}</button>)}</div></fieldset><div className="dialog-actions"><button type="button" className="button button-light" onClick={() => setDialog(null)}>Cancel</button><button className="button button-dark" disabled={busy}><Plus size={16} /> Create course</button></div></form>}
      {dialog === 'course' && <WeeklyScheduleEditor value={courseScheduleDraft} onChange={setCourseScheduleDraft} />}
    </dialog></div>}
    {editCourseOpen && course && <div className="dialog-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setEditCourseOpen(false) }}>
      <dialog className="dialog" open aria-labelledby="edit-course-title">
        <div className="dialog-heading"><div><div className="eyebrow">COURSE SETTINGS</div><h2 id="edit-course-title">Edit course</h2></div><button className="icon-button" type="button" onClick={() => setEditCourseOpen(false)} aria-label="Close"><X size={19} /></button></div>
        <form className="dialog-form" onSubmit={saveCourseSettings}>
          <label>Course name<input autoFocus required maxLength={100} value={courseEditDraft.title} onChange={(event) => setCourseEditDraft({ ...courseEditDraft, title: event.target.value })} /></label>
          <label>Course code <span className="optional">OPTIONAL</span><input maxLength={24} value={courseEditDraft.code} onChange={(event) => setCourseEditDraft({ ...courseEditDraft, code: event.target.value })} /></label>
          <label>Category<select value={courseEditDraft.category} onChange={(event) => setCourseEditDraft({ ...courseEditDraft, category: event.target.value as CourseCategory })}><option value="Grundkurse">Grundkurse</option><option value="Nebenfächer">Nebenfächer</option><option value="Wahlfächer">Wahlfächer</option><option value="Seminare">Seminare</option></select></label>
          <label>Course summary<textarea maxLength={5000} rows={4} value={courseEditDraft.summary} onChange={(event) => setCourseEditDraft({ ...courseEditDraft, summary: event.target.value })} placeholder={`Summary for ${course.title}…`} /></label>
          <section className="course-links-editor" aria-label="Course links"><div className="course-links-editor-heading"><strong>Course links</strong><small>{courseLinksDirty ? 'Unsaved link changes' : 'Optional. Labels are shown as clickable links under the summary.'}</small></div>
            {courseLinkDrafts.map((link, index) => <div className="course-link-row" key={link.draftId}>
              <label>Label<input value={link.label} maxLength={80} onChange={(event) => { setCourseLinkDrafts((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, label: event.target.value } : item)); setCourseLinksDirty(true) }} placeholder="Course site" /></label>
              <label>URL<input type="url" value={link.url} maxLength={2048} onChange={(event) => { setCourseLinkDrafts((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, url: event.target.value } : item)); setCourseLinksDirty(true) }} placeholder="https://…" /></label>
              <button type="button" className="icon-button small" title="Remove link" aria-label={`Remove ${link.label || 'course link'}`} onClick={() => { setCourseLinkDrafts((current) => current.filter((_, itemIndex) => itemIndex !== index)); setCourseLinksDirty(true) }}><Trash2 size={14} /></button>
            </div>)}
            <button type="button" className="button button-light button-compact course-link-add" onClick={() => { setCourseLinkDrafts((current) => [...current, newCourseLinkDraft(current.length ? `Link ${current.length + 1}` : 'Course site')]); setCourseLinksDirty(true) }}><Plus size={14} /> Add link</button>
          </section>
          <fieldset className="color-field"><legend>Course color</legend><div className="color-options">{palette.map((color) => <button key={color} type="button" className={courseEditDraft.color === color ? 'color-option selected' : 'color-option'} style={{ backgroundColor: color }} onClick={() => setCourseEditDraft({ ...courseEditDraft, color })} aria-label={`Select ${color}`} aria-pressed={courseEditDraft.color === color}>{courseEditDraft.color === color && <Check size={15} />}</button>)}</div></fieldset>
          <WeeklyScheduleEditor value={editScheduleDraft} onChange={setEditScheduleDraft} />
          <div className="dialog-actions"><button type="button" className="button button-light" onClick={() => setEditCourseOpen(false)}>Cancel</button><button className="button button-dark" disabled={busy}><Check size={16} /> Save changes</button></div>
        </form>
      </dialog>
    </div>}
    {dialog === 'event' && <div className="dialog-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setDialog(null) }}><dialog className="dialog" open aria-labelledby="event-dialog-title">
      <div className="dialog-heading"><div><div className="eyebrow">CALENDAR</div><h2 id="event-dialog-title">Add event</h2></div><button className="icon-button" onClick={() => setDialog(null)} aria-label="Close"><X size={19} /></button></div>
      <form className="dialog-form" onSubmit={addCalendarEvent}>
        <label>Category<select value={eventDraft.category} onChange={(event) => setEventDraft({ ...eventDraft, category: event.target.value as EventDraft['category'] })}><option value="course">Course</option><option value="work">Work</option><option value="girlfriend">Girlfriend</option><option value="personal">Personal</option></select></label>
        {eventDraft.category === 'course' && <>
          <label>Event type<select value={eventDraft.event_type} onChange={(event) => setEventDraft({ ...eventDraft, event_type: event.target.value as CourseEventType })}><option value="lecture">Lecture</option><option value="tutoring">Tutoring class</option><option value="deadline">Deadline</option><option value="meeting">Meeting</option></select></label>
          <label>Course<select required value={eventDraft.course_id} onChange={(event) => setEventDraft({ ...eventDraft, course_id: event.target.value })}><option value="">Choose a course</option>{courses.map((item) => <option key={item.id} value={item.id}>{item.code ? `${item.code} · ` : ''}{item.title}</option>)}</select></label>
          <label>Schedule<select value={eventDraft.one_time ? 'once' : 'weekly'} onChange={(event) => setEventDraft({ ...eventDraft, one_time: event.target.value === 'once' })}><option value="once">One-time</option><option value="weekly">Every week</option></select></label>
        </>}
        <label>Event title<input autoFocus required maxLength={160} value={eventDraft.title} onChange={(event) => setEventDraft({ ...eventDraft, title: event.target.value })} placeholder="e.g. Project presentation" /></label>
        {eventDraft.category !== 'course' || eventDraft.one_time
          ? <label>Date<input type="date" required value={eventDraft.event_date} onChange={(event) => setEventDraft({ ...eventDraft, event_date: event.target.value })} /></label>
          : <label>Repeats every<select value={eventDraft.weekday} onChange={(event) => setEventDraft({ ...eventDraft, weekday: event.target.value })}>{['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'].map((day, index) => <option key={day} value={index}>{day}</option>)}</select></label>}
        <div className="form-two"><label>Starts at<input type="time" value={eventDraft.start_time} onChange={(event) => setEventDraft({ ...eventDraft, start_time: event.target.value })} /></label><label>Ends at<input type="time" value={eventDraft.end_time} onChange={(event) => setEventDraft({ ...eventDraft, end_time: event.target.value })} /></label></div>
        <div className="dialog-actions"><button type="button" className="button button-light" onClick={() => setDialog(null)}>Cancel</button><button className="button button-dark" disabled={busy || (eventDraft.category === 'course' && !courses.length)}><Plus size={16} /> Save event</button></div>
      </form>
    </dialog></div>}
    {selectedCalendarEvent && <div className="dialog-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setSelectedCalendarEvent(null) }}><dialog className="dialog event-details-dialog" open aria-labelledby="event-details-title">
      <div className="dialog-heading"><div><div className="eyebrow">{selectedCalendarEvent.section ? sectionNames[selectedCalendarEvent.section] : eventTypeLabels[selectedCalendarEvent.event_type]}</div><h2 id="event-details-title">{selectedCalendarEvent.title || eventTypeLabels[selectedCalendarEvent.event_type]}</h2></div><button className="icon-button" type="button" onClick={() => setSelectedCalendarEvent(null)} aria-label="Close event details"><X size={19} /></button></div>
      <form className="dialog-form" onSubmit={saveCalendarEvent}>
        <label>Event title<input autoFocus required={Boolean(selectedCalendarEvent.section || eventEditIsOneTime)} maxLength={160} value={eventEditDraft.title} onChange={(event) => setEventEditDraft({ ...eventEditDraft, title: event.target.value })} /></label>
        {!selectedCalendarEvent.section && selectedCalendarEvent.event_type !== 'personal' && <label>Event type<select value={eventEditDraft.event_type} onChange={(event) => setEventEditDraft({ ...eventEditDraft, event_type: event.target.value as CourseEventType })}><option value="lecture">Lecture</option><option value="tutoring">Tutoring class</option><option value="deadline">Deadline</option><option value="meeting">Meeting</option></select></label>}
        {!selectedCalendarEvent.section && selectedCalendarEvent.event_type !== 'personal' && <label>Schedule<select value={eventEditDraft.one_time ? 'once' : 'weekly'} onChange={(event) => setEventEditDraft({ ...eventEditDraft, one_time: event.target.value === 'once' })}><option value="once">One-time</option><option value="weekly">Every week</option></select></label>}
        {eventEditIsOneTime
          ? <label>Date<input type="date" required value={eventEditDraft.event_date} onChange={(event) => setEventEditDraft({ ...eventEditDraft, event_date: event.target.value })} /></label>
          : <label>Repeats every<select value={eventEditDraft.weekday} onChange={(event) => setEventEditDraft({ ...eventEditDraft, weekday: event.target.value })}>{['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'].map((day, index) => <option key={day} value={index}>{day}</option>)}</select></label>}
        <div className="form-two"><label>Starts at<input type="time" required={!selectedCalendarEvent.section && !eventEditIsOneTime && eventEditDraft.event_type !== 'deadline'} value={eventEditDraft.start_time} onChange={(event) => setEventEditDraft({ ...eventEditDraft, start_time: event.target.value })} /></label><label>Ends at<input type="time" required={!selectedCalendarEvent.section && !eventEditIsOneTime && eventEditDraft.event_type !== 'deadline'} value={eventEditDraft.end_time} onChange={(event) => setEventEditDraft({ ...eventEditDraft, end_time: event.target.value })} /></label></div>
        <div className="dialog-actions"><button type="button" className="button button-light" onClick={() => setSelectedCalendarEvent(null)}>Close</button><button className="button button-dark" disabled={busy}><Check size={16} /> Save event</button></div>
      </form>
      {selectedCalendarEvent.weekday !== null && selectedCalendarEvent.event_type !== 'personal' && !selectedCalendarEvent.event_date && <section className="event-occurrence-control" aria-label="This event occurrence"><div><strong>Occurrence</strong><span>{format(parseISO(selectedOccurrenceDate), 'EEEE, MMM d, yyyy')}</span></div><button type="button" className={selectedOccurrenceCancelled ? 'button button-light button-compact occurrence-cancelled' : 'button button-light button-compact'} onClick={() => void toggleSelectedOccurrence()} disabled={busy} aria-pressed={selectedOccurrenceCancelled}>{selectedOccurrenceCancelled ? <Check size={15} /> : <X size={15} />}{selectedOccurrenceCancelled ? 'Restore this occurrence' : 'Not taking place'}</button></section>}
      <section className="event-comments-section" aria-label="Event comments"><h3><MessageCircle size={16} /> Comments <span>{eventComments.length}</span></h3>
        {eventCommentsLoading ? <p className="event-comments-empty">Loading comments…</p> : eventComments.length ? <div className="event-comments-list">{eventComments.map((comment) => <article className="event-comment" key={comment.id}><p>{comment.body}</p><time>{format(parseISO(comment.created_at), 'MMM d, yyyy · h:mm a')}</time></article>)}</div> : <p className="event-comments-empty">No comments yet.</p>}
        <form className="event-comment-form" onSubmit={addEventComment}><label htmlFor="event-comment-input">Add a comment</label><textarea id="event-comment-input" maxLength={2000} required rows={3} value={eventCommentDraft} onChange={(event) => setEventCommentDraft(event.target.value)} placeholder="Write a comment…" /><button className="button button-light button-compact" disabled={busy || !eventCommentDraft.trim()}><Send size={14} /> Post comment</button></form>
      </section>
    </dialog></div>}
    {busy && <div className="saving-toast"><LoaderCircle className="spin" size={15} /> Saving changes</div>}
  </div>
}

function serializeWeeklyEvents(drafts: WeeklyEventDraft[]): WeeklyCourseEvent[] {
  return drafts.map(({ id, ...event }) => ({
    ...(id === undefined ? {} : { id }),
    ...event,
    start_time: event.event_type === 'deadline' ? null : event.start_time || null,
    end_time: event.event_type === 'deadline' ? null : event.end_time || null,
  }))
}

function WeeklyScheduleEditor({ value, onChange }: { value: WeeklyEventDraft[]; onChange: (next: WeeklyEventDraft[]) => void }) {
  const updateEvent = (index: number, changes: Partial<WeeklyEventDraft>) => {
    onChange(value.map((item, itemIndex) => itemIndex === index ? { ...item, ...changes } : item))
  }

  function addEvent() {
    onChange([...value, {
      title: '',
      event_type: 'lecture',
      weekday: 0,
      start_time: '09:00',
      end_time: '10:00',
    }])
  }

  return <section className="weekly-schedule-editor">
    <div className="weekly-schedule-heading"><div><strong>Weekly schedule</strong><small>Repeats every week</small></div><button type="button" className="button button-light button-compact" onClick={addEvent}><Plus size={14} /> Add event</button></div>
    {value.map((item, index) => <div className="weekly-schedule-row" key={item.id ?? `new-${index}`}>
      <label>Type<select value={item.event_type} onChange={(event) => {
        const event_type = event.target.value as CourseEventType
        updateEvent(index, { event_type, start_time: event_type === 'deadline' ? '' : item.start_time || '09:00', end_time: event_type === 'deadline' ? '' : item.end_time || '10:00' })
      }}><option value="lecture">Lecture</option><option value="tutoring">Tutoring class</option><option value="deadline">Deadline</option><option value="meeting">Meeting</option></select></label>
      <label>Optional label <span className="optional">OPTIONAL</span><input maxLength={160} value={item.title} onChange={(event) => updateEvent(index, { title: event.target.value })} placeholder={item.event_type === 'deadline' ? 'Optional note' : 'Optional note'} /></label>
      <label>Day<select value={item.weekday} onChange={(event) => updateEvent(index, { weekday: Number(event.target.value) })}>{['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'].map((day, dayIndex) => <option key={day} value={dayIndex}>{day}</option>)}</select></label>
      {item.event_type !== 'deadline' && <div className="weekly-event-times"><label>Starts<input type="time" required value={item.start_time} onChange={(event) => updateEvent(index, { start_time: event.target.value })} /></label><label>Ends<input type="time" required value={item.end_time} onChange={(event) => updateEvent(index, { end_time: event.target.value })} /></label></div>}
      <button type="button" className="icon-button" onClick={() => onChange(value.filter((_, itemIndex) => itemIndex !== index))} aria-label={`Remove ${item.title || 'weekly event'}`} title="Remove event"><Trash2 size={15} /></button>
    </div>)}
    {!value.length && <p className="weekly-schedule-empty">No repeating events added.</p>}
  </section>
}

function SectionScheduleEditor({ value, onChange }: { value: SectionEventDraft[]; onChange: (next: SectionEventDraft[]) => void }) {
  const updateEvent = (index: number, changes: Partial<SectionEventDraft>) => {
    onChange(value.map((item, itemIndex) => itemIndex === index ? { ...item, ...changes } : item))
  }

  function addEvent() {
    onChange([...value, { title: '', weekday: 0, start_time: '09:00', end_time: '10:00' }])
  }

  return <div className="section-schedule-editor">
    {value.map((item, index) => <div className="section-schedule-edit-row" key={item.id ?? `new-section-${index}`}>
      <label>Event name<input required maxLength={160} value={item.title} onChange={(event) => updateEvent(index, { title: event.target.value })} placeholder="e.g. Weekly check-in" /></label>
      <label>Repeats on<select value={item.weekday} onChange={(event) => updateEvent(index, { weekday: Number(event.target.value) })}>{['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'].map((day, dayIndex) => <option key={day} value={dayIndex}>{day}</option>)}</select></label>
      <label>Starts <span className="optional">OPTIONAL</span><input type="time" value={item.start_time ?? ''} onChange={(event) => updateEvent(index, { start_time: event.target.value || null })} /></label>
      <label>Ends <span className="optional">OPTIONAL</span><input type="time" value={item.end_time ?? ''} onChange={(event) => updateEvent(index, { end_time: event.target.value || null })} /></label>
      <button type="button" className="icon-button" title="Remove event" aria-label={`Remove ${item.title || 'weekly event'}`} onClick={() => onChange(value.filter((_, itemIndex) => itemIndex !== index))}><Trash2 size={15} /></button>
    </div>)}
    <div className="section-schedule-editor-footer"><p className="section-schedule-hint">Leave both times blank for an all-day event.</p><button type="button" className="button button-light button-compact" onClick={addEvent}><Plus size={14} /> Add event</button></div>
  </div>
}

type CalendarDisplayProps = {
  view: CalendarView
  cursor: Date
  tasks: Task[]
  events: CalendarEvent[]
  courses: Course[]
  occurrenceExceptions: EventOccurrenceException[]
  onSelectDate: (date: Date) => void
  onSelectMonth: (date: Date) => void
  onSelectEvent: (event: CalendarEvent, occurrenceDate: string) => void
  onToggleTask: (task: Task) => void
  onDeleteTask: (task: Task) => void
  onDeleteEvent: (event: CalendarEvent) => void
  onAddTask: (date: Date) => void
}

type CalendarItem = { key: string; title: string; category: CalendarFilter; courseId: number | null; time: string; occurrenceDate?: string; task?: Task; event?: CalendarEvent }
type TimedCalendarItem = { item: CalendarItem; startMinute: number; endMinute: number; lane: number; laneCount: number }
const eventTypeLabels: Record<CalendarEvent['event_type'], string> = { lecture: 'Lecture', tutoring: 'Tutoring', deadline: 'Deadline', meeting: 'Meeting', personal: 'Personal', section: 'Recurring event' }
const eventTypeAbbreviations: Partial<Record<CalendarEvent['event_type'], string>> = { lecture: 'L', tutoring: 'T', deadline: 'D', meeting: 'M' }

function layoutTimedItems(items: CalendarItem[]): TimedCalendarItem[] {
  const entries = items.flatMap((item) => {
    const startTime = item.event?.start_time
    const endTime = item.event?.end_time
    if (!startTime || !endTime) return []
    const [startHour, startMinute] = startTime.split(':').map(Number)
    const [endHour, endMinute] = endTime.split(':').map(Number)
    return [{ item, startMinute: startHour * 60 + startMinute, endMinute: endHour * 60 + endMinute }]
  }).sort((first, second) => first.startMinute - second.startMinute || first.endMinute - second.endMinute)

  const result: TimedCalendarItem[] = []
  let cluster: typeof entries = []
  let clusterEnd = -1
  const placeCluster = () => {
    const laneEnds: number[] = []
    const placed = cluster.map((entry) => {
      let lane = laneEnds.findIndex((endMinute) => endMinute <= entry.startMinute)
      if (lane === -1) lane = laneEnds.length
      laneEnds[lane] = entry.endMinute
      return { ...entry, lane }
    })
    result.push(...placed.map((entry) => ({ ...entry, laneCount: laneEnds.length })))
    cluster = []
    clusterEnd = -1
  }

  for (const entry of entries) {
    if (cluster.length && entry.startMinute >= clusterEnd) placeCluster()
    cluster.push(entry)
    clusterEnd = Math.max(clusterEnd, entry.endMinute)
  }
  if (cluster.length) placeCluster()
  return result
}

function CalendarDisplay({ view, cursor, tasks, events, courses, occurrenceExceptions, onSelectDate, onSelectMonth, onSelectEvent, onToggleTask, onDeleteTask, onDeleteEvent, onAddTask }: CalendarDisplayProps) {
  const courseFor = (courseId: number | null) => courses.find((course) => course.id === courseId)
  const itemsForDay = (date: Date): CalendarItem[] => [
    ...tasks.filter((task) => isSameDay(parseISO(task.due_date), date)).map((task) => ({ key: `task-${task.id}`, title: task.title, category: 'tasks' as const, courseId: task.course_id, time: '', task })),
    ...events.filter((event) => event.event_date
      ? event.event_date === dateKey(date)
      : event.weekday === (date.getDay() + 6) % 7
        && !occurrenceExceptions.some((exception) => exception.event_kind === occurrenceKindForEvent(event) && exception.event_id === event.id && exception.occurrence_date === dateKey(date))).map((event) => ({ key: `event-${event.section ?? 'course'}-${event.id}-${event.event_date ?? 'weekly'}`, title: event.title, category: event.section ? `section-${event.section}` as const : event.event_type, courseId: event.course_id, time: event.start_time ?? '', occurrenceDate: dateKey(date), event })),
  ].sort((first, second) => first.time.localeCompare(second.time))
  const weekdays = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

  function renderCalendarItem(item: CalendarItem, className = '') {
    const course = courseFor(item.courseId)
    const color = item.event?.section ? sectionColors[item.event.section] : item.category === 'personal' || item.category === 'deadline' ? '#ca7155' : item.category === 'meeting' ? '#697fb1' : item.category === 'tutoring' ? '#45899a' : item.category === 'lecture' ? '#397c68' : course?.color ?? '#697f78'
    const typeLabel = item.event?.section ? sectionNames[item.event.section] : item.event ? eventTypeLabels[item.event.event_type] : ''
    const eventCode = item.event?.section ? sectionNames[item.event.section][0] : item.event ? eventTypeAbbreviations[item.event.event_type] : undefined
    const detail = item.task
      ? `${course?.code || course?.title || 'Personal'} · ${item.task.priority}`
      : item.event?.start_time
        ? `${item.event.start_time} – ${item.event.end_time}${item.event.event_date && course ? ` · ${course.code || course.title}` : ''}`
        : item.event?.event_date ? course ? `${course.code || course.title} · One-time` : 'One-time event' : item.event?.event_type === 'personal' ? 'Personal event' : 'All day'
    const displayTitle = item.event && !item.event.event_date && item.event.event_type !== 'personal' && !item.event.section ? course?.title || item.title : item.title
    return <div className={`event-item day-event-card ${item.category !== 'tasks' ? `scheduled-${item.category}` : ''} ${item.task?.is_completed ? 'completed' : ''} ${item.event ? 'calendar-event-clickable' : ''} ${className}`} key={item.key} style={{ '--event-color': color } as React.CSSProperties} role={item.event ? 'button' : undefined} tabIndex={item.event ? 0 : undefined} aria-label={item.event ? `Open ${item.title || typeLabel} details` : undefined} onClick={() => item.event && item.occurrenceDate && onSelectEvent(item.event, item.occurrenceDate)} onKeyDown={(event) => { if (item.event && item.occurrenceDate && (event.key === 'Enter' || event.key === ' ')) { event.preventDefault(); onSelectEvent(item.event, item.occurrenceDate) } }}>
      {item.task && <button className="task-check calendar-task-check" aria-label={`Mark ${item.title} ${item.task.is_completed ? 'incomplete' : 'complete'}`} onClick={() => onToggleTask(item.task!)}>{item.task.is_completed ? <Check size={14} /> : <Circle size={16} />}</button>}
      {item.event && item.event.event_type !== 'personal' && <span className="calendar-event-type" title={typeLabel} aria-label={typeLabel}>{eventCode}</span>}
      <div className="calendar-item-copy"><strong>{displayTitle}</strong><small>{detail}</small></div>
      <button className="icon-button small calendar-item-delete" aria-label={`Delete ${item.title || typeLabel}`} title="Delete" onClick={(event) => { event.stopPropagation(); if (item.task) onDeleteTask(item.task); else if (item.event) onDeleteEvent(item.event) }}><Trash2 size={14} /></button>
    </div>
  }

  if (view === 'week') {
    const days = eachDayOfInterval({ start: startOfWeek(cursor, { weekStartsOn: 1 }), end: endOfWeek(cursor, { weekStartsOn: 1 }) })
    const dayItems = days.map((day) => itemsForDay(day))
    const dueCount = dayItems.reduce((count, items) => count + items.length, 0)
    const timedItems = dayItems.map((items) => layoutTimedItems(items.filter((item) => item.event?.start_time && item.event.end_time)))
    const startHour = Math.min(7, ...timedItems.flat().map((item) => Math.floor(item.startMinute / 60)))
    const endHour = Math.max(22, ...timedItems.flat().map((item) => Math.ceil(item.endMinute / 60)))
    const hours = Array.from({ length: endHour - startHour }, (_, index) => startHour + index)
    const hourHeight = 60
    return <section className="calendar-board" aria-label="Weekly calendar">
      <div className="calendar-board-head"><div><span className="section-kicker">WEEKLY VIEW</span><span className="muted"> · {dueCount} items this week</span></div><span className="timezone-label">MONDAY – SUNDAY<span className="print-week-range"> · {format(days[0], 'MMM d')} – {format(days[6], 'MMM d, yyyy')}</span></span></div>
      <div className="weekly-timetable-scroll"><div className="weekly-timetable" style={{ '--timeline-height': `${hours.length * hourHeight}px`, '--timeline-print-overlap': `${hours.length * hourHeight * -0.38}px` } as React.CSSProperties}>
        <div className="weekly-timetable-head"><div className="timetable-gutter" />{days.map((day) => <button className={`timetable-day-heading${isToday(day) ? ' today' : ''}`} key={dateKey(day)} onClick={() => onSelectDate(day)} aria-label={`Open week of ${format(day, 'MMMM d, yyyy')}`}><span>{format(day, 'EEE').toUpperCase()}</span><strong>{format(day, 'd')}</strong></button>)}</div>
        <div className="timetable-all-day"><div className="timetable-all-day-label">ALL DAY</div>{days.map((day, dayIndex) => <div className="timetable-all-day-cell" key={dateKey(day)}>
          {dayItems[dayIndex].filter((item) => !item.event?.start_time || !item.event.end_time).map((item) => renderCalendarItem(item, 'all-day-event'))}
          <button className="day-add" aria-label={`Add task on ${format(day, 'MMMM d')}`} onClick={() => onAddTask(day)}><Plus size={15} /></button>
        </div>)}</div>
        <div className="weekly-timetable-body"><div className="timetable-time-axis">{hours.map((hour, index) => <span key={hour} style={{ top: `${index * hourHeight - 6}px` }}>{String(hour).padStart(2, '0')}:00</span>)}</div>{days.map((day, dayIndex) => <div className={`timetable-track${isToday(day) ? ' today' : ''}`} key={dateKey(day)}>
          {timedItems[dayIndex].map((item) => <div key={item.item.key} className="timetable-event" style={{
            top: `${((item.startMinute - startHour * 60) / 60) * hourHeight}px`,
            height: `${Math.max(((item.endMinute - item.startMinute) / 60) * hourHeight, 28)}px`,
            left: `calc(${item.lane * 100 / item.laneCount}% + 2px)`,
            width: `calc(${100 / item.laneCount}% - 4px)`,
          }}>{renderCalendarItem(item.item, 'timed-event')}</div>)}
        </div>)}</div>
      </div></div>
    </section>
  }

  if (view === 'month') {
    const firstVisible = startOfWeek(startOfMonth(cursor), { weekStartsOn: 1 })
    const lastVisible = endOfWeek(endOfMonth(cursor), { weekStartsOn: 1 })
    const days = eachDayOfInterval({ start: firstVisible, end: lastVisible })
    return <section className="calendar-board monthly-board" aria-label="Monthly calendar"><div className="calendar-board-head"><div><span className="section-kicker">MONTHLY VIEW</span><span className="muted"> · Select a date to open its week</span></div><span className="timezone-label">{days.reduce((count, day) => count + (isSameMonth(day, cursor) ? itemsForDay(day).length : 0), 0)} ITEMS</span></div><div className="month-grid">{weekdays.map((day) => <div className="month-weekday" key={day}>{day}</div>)}{days.map((day) => {
      const dayItems = itemsForDay(day)
      return <div className={`${isSameMonth(day, cursor) ? 'month-day' : 'month-day outside-month'}${isToday(day) ? ' today' : ''}`} key={dateKey(day)}><button className="month-date" onClick={() => onSelectDate(day)} aria-label={`Open week of ${format(day, 'EEEE, MMMM d, yyyy')}`}><span>{format(day, 'd')}</span>{dayItems.length > 2 && <small>{dayItems.length}</small>}</button><div className="month-events">{dayItems.slice(0, 2).map((item) => { const course = courseFor(item.courseId); const color = item.event?.section ? sectionColors[item.event.section] : item.category === 'personal' ? '#ca7155' : item.category === 'tutoring' && course ? tintColor(course.color, 0.36) : course?.color ?? '#697f78'; return <span className={`month-event scheduled-${item.category}${item.event ? ' month-event-clickable' : ''}`} key={item.key} title={`${item.title}${item.time ? ` · ${item.time}` : ''}`} role={item.event ? 'button' : undefined} tabIndex={item.event ? 0 : undefined} onClick={() => item.event && item.occurrenceDate && onSelectEvent(item.event, item.occurrenceDate)} onKeyDown={(event) => { if (item.event && item.occurrenceDate && (event.key === 'Enter' || event.key === ' ')) { event.preventDefault(); onSelectEvent(item.event, item.occurrenceDate) } }}><i style={{ backgroundColor: color }} />{item.title}</span> })}{dayItems.length > 2 && <span className="month-more">+{dayItems.length - 2} more</span>}</div></div>
    })}</div></section>
  }

  const months = Array.from({ length: 12 }, (_, index) => addMonths(startOfYear(cursor), index))
  return <section className="calendar-board year-board" aria-label="Yearly calendar"><div className="calendar-board-head"><div><span className="section-kicker">YEARLY VIEW</span><span className="muted"> · Select a date to open its week</span></div><span className="timezone-label">COURSE COLORS MARK EVENTS</span></div><div className="year-grid">{months.map((month) => {
    const monthDays = eachDayOfInterval({ start: startOfMonth(month), end: endOfMonth(month) })
    const blanks = (getDay(monthDays[0]) + 6) % 7
    return <article className="year-month" key={dateKey(month)}><button className="year-month-title" onClick={() => onSelectMonth(month)}>{format(month, 'MMMM')}<ChevronRight size={13} /></button><div className="year-weekdays">{weekdays.map((day) => <span key={day}>{day[0]}</span>)}</div><div className="year-days">{Array.from({ length: blanks }, (_, index) => <span className="year-day-empty" key={`blank-${index}`} />)}{monthDays.map((day) => {
      const dayItems = itemsForDay(day)
      return <button className={`${isToday(day) ? 'year-day today' : 'year-day'}${dayItems.length ? ' has-tasks' : ''}`} key={dateKey(day)} onClick={() => onSelectDate(day)} aria-label={`${format(day, 'EEEE, MMMM d, yyyy')}${dayItems.length ? `, ${dayItems.length} items` : ''}`} title={dayItems.map((item) => item.title).join(', ')}><span>{format(day, 'd')}</span>{dayItems.length > 0 && <i style={{ backgroundColor: dayItems[0].event?.section ? sectionColors[dayItems[0].event.section] : dayItems[0].category === 'personal' ? '#ca7155' : courseFor(dayItems[0].courseId)?.color ?? '#697f78' }} />}</button>
    })}</div></article>
  })}</div></section>
}

function tintColor(hex: string, amount: number) {
  const value = Number.parseInt(hex.slice(1), 16)
  const channels = [(value >> 16) & 255, (value >> 8) & 255, value & 255]
  return `#${channels.map((channel) => Math.round(channel + (255 - channel) * amount).toString(16).padStart(2, '0')).join('')}`
}

function formatBytes(bytes: number) { return bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / (1024 * 1024)).toFixed(1)} MB` }

function LinkedNoteText({ text }: { text: string }) {
  const parts = text.split(/(https?:\/\/[^\s]+|www\.[^\s]+)/g)
  return <p className="week-note-copy">{parts.map((part, index) => {
    if (!/^https?:\/\/|^www\./i.test(part)) return part
    const url = part.replace(/[.,!?;:)\]}]+$/, '')
    const trailing = part.slice(url.length)
    return <span key={index}><a href={url.startsWith('www.') ? `https://${url}` : url} target="_blank" rel="noreferrer">{url}</a>{trailing}</span>
  })}</p>
}

export default App
