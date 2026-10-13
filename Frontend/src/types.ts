export type CourseCategory = 'Grundkurse' | 'Nebenfächer' | 'Wahlfächer' | 'Seminare'
export type CourseEventType = 'lecture' | 'tutoring' | 'deadline' | 'meeting'
export type SectionKey = 'work' | 'girlfriend' | 'personal'

export type WeeklyCourseEvent = {
  id?: number
  title: string
  event_type: CourseEventType
  weekday: number
  start_time: string | null
  end_time: string | null
}

export type Course = {
  id: number
  title: string
  code: string | null
  color: string
  summary: string
  category: CourseCategory
  created_at?: string
}

export type CourseLink = {
  id: number
  course_id: number
  label: string
  url: string
  position: number
}

export type Task = {
  id: number
  title: string
  description: string
  due_date: string
  priority: 'low' | 'medium' | 'high'
  is_completed: boolean
  course_id: number | null
}

export type CalendarEvent = {
  id: number
  title: string
  event_type: CourseEventType | 'personal' | 'section'
  section?: SectionKey
  course_id: number | null
  weekday: number | null
  event_date: string | null
  start_time: string | null
  end_time: string | null
  created_at: string
}

export type EventComment = {
  id: number
  event_kind: 'course' | 'section-weekly' | 'section-special'
  event_id: number
  body: string
  created_at: string
}

export type EventOccurrenceException = {
  id: number
  event_kind: 'course' | 'section-weekly'
  event_id: number
  occurrence_date: string
}

export type SectionWeeklyEvent = {
  id: number
  section: SectionKey
  title: string
  weekday: number
  start_time: string | null
  end_time: string | null
  created_at: string
}

export type SectionSpecialEvent = {
  id: number
  section: SectionKey
  title: string
  event_date: string
  start_time: string | null
  end_time: string | null
  created_at: string
}

export type SectionWeeklyNote = {
  id: number | null
  section: SectionKey
  week_start: string
  summary: string
  updated_at: string | null
}

export type Attachment = {
  id: number
  filename: string
  content_type: string
  size: number
  created_at: string
}

export type WeeklyNote = {
  id: number | null
  course_id: number
  week_start: string
  summary: string
  updated_at: string | null
  attachments: Attachment[]
}