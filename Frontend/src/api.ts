import type { Attachment, CalendarEvent, Course, CourseCategory, CourseLink, EventComment, EventOccurrenceException, SectionKey, SectionSpecialEvent, SectionWeeklyEvent, SectionWeeklyNote, Task, WeeklyCourseEvent, WeeklyNote } from './types'

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const response = await fetch(`/api${path}`, {
    ...options,
    headers: {
      ...(options?.body instanceof FormData ? {} : { 'Content-Type': 'application/json' }),
      ...options?.headers,
    },
  })
  if (!response.ok) {
    const body = await response.json().catch(() => null)
    throw new Error(body?.detail ?? `Request failed (${response.status})`)
  }
  if (response.status === 204) return undefined as T
  return response.json() as Promise<T>
}

export const api = {
  courses: () => request<Course[]>('/courses'),
  createCourse: (data: { title: string; code: string | null; color: string; category: CourseCategory; weekly_events: WeeklyCourseEvent[] }) =>
    request<Course>('/courses', { method: 'POST', body: JSON.stringify(data) }),
  updateCourse: (id: number, data: Partial<Omit<Course, 'id' | 'created_at'>> & { weekly_events?: WeeklyCourseEvent[] }) =>
    request<Course>(`/courses/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  deleteCourse: (id: number) => request<void>(`/courses/${id}`, { method: 'DELETE' }),
  courseLinks: (id: number) => request<CourseLink[]>(`/courses/${id}/links`),
  saveCourseLinks: (id: number, links: Array<Pick<CourseLink, 'label' | 'url'>>) =>
    request<CourseLink[]>(`/courses/${id}/links`, { method: 'PUT', body: JSON.stringify(links) }),
  tasks: () => request<Task[]>('/tasks'),
  calendarEvents: () => request<CalendarEvent[]>('/calendar-events'),
  sectionEvents: () => request<SectionWeeklyEvent[]>('/section-events'),
  sectionSpecialEvents: () => request<SectionSpecialEvent[]>('/section-special-events'),
  createSectionSpecialEvent: (section: SectionKey, data: Omit<SectionSpecialEvent, 'id' | 'section' | 'created_at'>) =>
    request<SectionSpecialEvent>(`/sections/${section}/events/special`, { method: 'POST', body: JSON.stringify(data) }),
  deleteSectionSpecialEvent: (id: number) => request<void>(`/section-special-events/${id}`, { method: 'DELETE' }),
  updateSectionSpecialEvent: (id: number, data: Omit<SectionSpecialEvent, 'id' | 'section' | 'created_at'>) =>
    request<SectionSpecialEvent>(`/section-special-events/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  saveSectionEvents: (section: SectionKey, events: Array<Omit<SectionWeeklyEvent, 'id' | 'section' | 'created_at'> & { id?: number }>) =>
    request<SectionWeeklyEvent[]>(`/sections/${section}/events`, { method: 'PUT', body: JSON.stringify(events) }),
  deleteSectionEvent: (id: number) => request<void>(`/section-events/${id}`, { method: 'DELETE' }),
  updateSectionEvent: (id: number, data: Omit<SectionWeeklyEvent, 'id' | 'section' | 'created_at'>) =>
    request<SectionWeeklyEvent>(`/section-events/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  createCalendarEvent: (data: Omit<CalendarEvent, 'id' | 'created_at'>) =>
    request<CalendarEvent>('/calendar-events', { method: 'POST', body: JSON.stringify(data) }),
  updateCalendarEvent: (id: number, data: Omit<CalendarEvent, 'id' | 'created_at'>) =>
    request<CalendarEvent>(`/calendar-events/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  deleteCalendarEvent: (id: number) => request<void>(`/calendar-events/${id}`, { method: 'DELETE' }),
  eventComments: (kind: EventComment['event_kind'], id: number) =>
    request<EventComment[]>(`/events/${kind}/${id}/comments`),
  createEventComment: (kind: EventComment['event_kind'], id: number, body: string) =>
    request<EventComment>(`/events/${kind}/${id}/comments`, { method: 'POST', body: JSON.stringify({ body }) }),
  eventOccurrenceExceptions: () => request<EventOccurrenceException[]>('/event-occurrences'),
  cancelEventOccurrence: (kind: EventOccurrenceException['event_kind'], id: number, date: string) =>
    request<EventOccurrenceException>(`/event-occurrences/${kind}/${id}/${date}`, { method: 'PUT' }),
  restoreEventOccurrence: (kind: EventOccurrenceException['event_kind'], id: number, date: string) =>
    request<void>(`/event-occurrences/${kind}/${id}/${date}`, { method: 'DELETE' }),
  createTask: (data: Omit<Task, 'id' | 'is_completed'>) =>
    request<Task>('/tasks', { method: 'POST', body: JSON.stringify(data) }),
  updateTask: (id: number, data: Partial<Task>) =>
    request<Task>(`/tasks/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  deleteTask: (id: number) => request<void>(`/tasks/${id}`, { method: 'DELETE' }),
  weeklyNote: (courseId: number, week: string) =>
    request<WeeklyNote>(`/courses/${courseId}/weeks/${week}`),
  sectionWeeklyNote: (section: SectionKey, week: string) =>
    request<SectionWeeklyNote>(`/sections/${section}/weeks/${week}`),
  saveSectionWeeklyNote: (section: SectionKey, week: string, summary: string) =>
    request<SectionWeeklyNote>(`/sections/${section}/weeks/${week}`, { method: 'PUT', body: JSON.stringify({ summary }) }),
  saveWeeklyNote: (courseId: number, week: string, summary: string) =>
    request<WeeklyNote>(`/courses/${courseId}/weeks/${week}`, {
      method: 'PUT', body: JSON.stringify({ summary }),
    }),
  upload: (noteId: number, file: File) => {
    const body = new FormData()
    body.append('file', file)
    return request<Attachment>(`/notes/${noteId}/attachments`, { method: 'POST', body })
  },
  deleteAttachment: (id: number) => request<void>(`/attachments/${id}`, { method: 'DELETE' }),
}