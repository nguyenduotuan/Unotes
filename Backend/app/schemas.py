from datetime import date, datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, HttpUrl, field_validator, model_validator


class CourseWeeklyEvent(BaseModel):
    id: int | None = Field(default=None, ge=1)
    title: str = Field(default="", max_length=160)
    event_type: Literal["lecture", "tutoring", "deadline", "meeting"]
    weekday: int = Field(ge=0, le=6)
    start_time: str | None = Field(default=None, pattern=r"^(?:[01]\d|2[0-3]):[0-5]\d$")
    end_time: str | None = Field(default=None, pattern=r"^(?:[01]\d|2[0-3]):[0-5]\d$")

    @field_validator("title")
    @classmethod
    def strip_title(cls, value: str) -> str:
        return value.strip()

    @model_validator(mode="after")
    def validate_schedule(self):
        if (self.start_time is None) != (self.end_time is None):
            raise ValueError("Provide both a start and end time")
        if self.event_type != "deadline" and self.start_time is None:
            raise ValueError("Course events need a start and end time")
        if self.start_time is not None and self.end_time <= self.start_time:
            raise ValueError("End time must be later than start time")
        return self


class CourseCreate(BaseModel):
    title: str = Field(min_length=1, max_length=100)
    code: str | None = Field(default=None, max_length=24)
    color: str = Field(default="#3f806a", pattern=r"^#[0-9a-fA-F]{6}$")
    category: str = Field(default="Grundkurse")
    weekly_events: list[CourseWeeklyEvent] = Field(default_factory=list)

    @field_validator("title", "code")
    @classmethod
    def strip_text(cls, value: str | None) -> str | None:
        return value.strip() or None if value is not None else None


class CourseUpdate(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=100)
    code: str | None = Field(default=None, max_length=24)
    color: str | None = Field(default=None, pattern=r"^#[0-9a-fA-F]{6}$")
    summary: str | None = Field(default=None, max_length=5000)
    category: str | None = Field(default=None)
    weekly_events: list[CourseWeeklyEvent] | None = None

    @field_validator("title", "code")
    @classmethod
    def strip_text(cls, value: str | None) -> str | None:
        return value.strip() or None if value is not None else None


class CourseOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    title: str
    code: str | None
    color: str
    summary: str
    category: str
    created_at: datetime


class CourseLinkInput(BaseModel):
    label: str = Field(min_length=1, max_length=80)
    url: HttpUrl

    @field_validator("label")
    @classmethod
    def strip_label(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("Link labels cannot be blank")
        return value


class CourseLinkOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    course_id: int
    label: str
    url: str
    position: int


class TaskCreate(BaseModel):
    title: str = Field(min_length=1, max_length=160)
    description: str = Field(default="", max_length=4000)
    due_date: date
    priority: Literal["low", "medium", "high"] = "medium"
    course_id: int | None = None

    @field_validator("title")
    @classmethod
    def strip_title(cls, value: str) -> str:
        return value.strip()


class TaskUpdate(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=160)
    description: str | None = Field(default=None, max_length=4000)
    due_date: date | None = None
    priority: Literal["low", "medium", "high"] | None = None
    is_completed: bool | None = None
    course_id: int | None = None

    @field_validator("title")
    @classmethod
    def strip_title(cls, value: str | None) -> str | None:
        return value.strip() if value is not None else None


class TaskOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    title: str
    description: str
    due_date: date
    priority: str
    is_completed: bool
    course_id: int | None
    created_at: datetime


class CalendarEventCreate(BaseModel):
    title: str = Field(default="", max_length=160)
    event_type: Literal["lecture", "tutoring", "deadline", "meeting", "personal"]
    course_id: int | None = None
    weekday: int | None = Field(default=None, ge=0, le=6)
    event_date: date | None = None
    start_time: str | None = Field(default=None, pattern=r"^(?:[01]\d|2[0-3]):[0-5]\d$")
    end_time: str | None = Field(default=None, pattern=r"^(?:[01]\d|2[0-3]):[0-5]\d$")

    @field_validator("title")
    @classmethod
    def strip_title(cls, value: str) -> str:
        return value.strip()

    @model_validator(mode="after")
    def validate_schedule(self):
        if self.event_type == "personal":
            if not self.title:
                raise ValueError("Personal events need a title")
            if self.event_date is None:
                raise ValueError("Personal events need a date")
            if self.course_id is not None or self.weekday is not None:
                raise ValueError("Personal events cannot belong to a course or repeat weekly")
        elif self.event_date is not None:
            if not self.title:
                raise ValueError("One-time course events need a title")
            if self.course_id is None or self.weekday is not None:
                raise ValueError("One-time course events need a course and cannot repeat weekly")
        elif self.event_type == "deadline":
            if self.course_id is None or self.weekday is None or self.event_date is not None:
                raise ValueError("Course deadlines need a course and weekday and repeat weekly")
        else:
            if self.course_id is None or self.weekday is None:
                raise ValueError("Course classes need a course and weekday")
            if self.event_date is not None or self.start_time is None or self.end_time is None:
                raise ValueError("Course classes need a start and end time and repeat weekly")

        if (self.start_time is None) != (self.end_time is None):
            raise ValueError("Provide both a start and end time")
        if self.start_time is not None and self.end_time is not None and self.end_time <= self.start_time:
            raise ValueError("End time must be later than start time")
        return self


class CalendarEventOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    title: str
    event_type: str
    course_id: int | None
    weekday: int | None
    event_date: date | None
    start_time: str | None
    end_time: str | None
    created_at: datetime


class AttachmentOut(BaseModel):
    model_config = ConfigDict(from_attributes=True, populate_by_name=True)

    id: int
    filename: str = Field(validation_alias="original_name")
    content_type: str
    size: int
    created_at: datetime


class WeeklyNoteUpsert(BaseModel):
    summary: str = Field(default="", max_length=12000)


class WeeklyNoteOut(BaseModel):
    id: int | None
    course_id: int
    week_start: date
    summary: str
    updated_at: datetime | None
    attachments: list[AttachmentOut]


SectionKey = Literal["work", "girlfriend", "personal"]
EventKind = Literal["course", "section-weekly", "section-special"]
RecurringEventKind = Literal["course", "section-weekly"]


class EventCommentInput(BaseModel):
    body: str = Field(min_length=1, max_length=2000)

    @field_validator("body")
    @classmethod
    def strip_body(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("Comments cannot be blank")
        return value


class EventCommentOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    event_kind: EventKind
    event_id: int
    body: str
    created_at: datetime


class EventOccurrenceExceptionOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    event_kind: RecurringEventKind
    event_id: int
    occurrence_date: date


class SectionWeeklyEventInput(BaseModel):
    id: int | None = Field(default=None, ge=1)
    title: str = Field(min_length=1, max_length=160)
    weekday: int = Field(ge=0, le=6)
    start_time: str | None = Field(default=None, pattern=r"^(?:[01]\d|2[0-3]):[0-5]\d$")
    end_time: str | None = Field(default=None, pattern=r"^(?:[01]\d|2[0-3]):[0-5]\d$")

    @field_validator("title")
    @classmethod
    def strip_title(cls, value: str) -> str:
        return value.strip()

    @model_validator(mode="after")
    def validate_schedule(self):
        if not self.title:
            raise ValueError("Events need a title")
        if (self.start_time is None) != (self.end_time is None):
            raise ValueError("Provide both a start and end time")
        if self.start_time is not None and self.end_time <= self.start_time:
            raise ValueError("End time must be later than start time")
        return self


class SectionWeeklyEventOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    section: SectionKey
    title: str
    weekday: int
    start_time: str | None
    end_time: str | None
    created_at: datetime


class SectionWeeklyNoteUpsert(BaseModel):
    summary: str = Field(default="", max_length=12000)


class SectionWeeklyNoteOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int | None
    section: SectionKey
    week_start: date
    summary: str
    updated_at: datetime | None


class SectionSpecialEventInput(BaseModel):
    title: str = Field(min_length=1, max_length=160)
    event_date: date
    start_time: str | None = Field(default=None, pattern=r"^(?:[01]\d|2[0-3]):[0-5]\d$")
    end_time: str | None = Field(default=None, pattern=r"^(?:[01]\d|2[0-3]):[0-5]\d$")

    @field_validator("title")
    @classmethod
    def strip_title(cls, value: str) -> str:
        return value.strip()

    @model_validator(mode="after")
    def validate_schedule(self):
        if not self.title:
            raise ValueError("Events need a title")
        if (self.start_time is None) != (self.end_time is None):
            raise ValueError("Provide both a start and end time")
        if self.start_time is not None and self.end_time <= self.start_time:
            raise ValueError("End time must be later than start time")
        return self


class SectionSpecialEventOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    section: SectionKey
    title: str
    event_date: date
    start_time: str | None
    end_time: str | None
    created_at: datetime