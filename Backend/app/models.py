from datetime import date, datetime

from sqlalchemy import Boolean, Date, DateTime, ForeignKey, Integer, String, Text, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class Course(Base):
    __tablename__ = "courses"

    id: Mapped[int] = mapped_column(primary_key=True)
    title: Mapped[str] = mapped_column(String(100), nullable=False)
    code: Mapped[str | None] = mapped_column(String(24), nullable=True)
    color: Mapped[str] = mapped_column(String(7), nullable=False, default="#3f806a")
    summary: Mapped[str] = mapped_column(Text, nullable=False, default="")
    category: Mapped[str] = mapped_column(String(50), nullable=False, default="Grundkurse")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    tasks: Mapped[list["Task"]] = relationship(back_populates="course", passive_deletes=True)
    calendar_events: Mapped[list["CalendarEvent"]] = relationship(
        back_populates="course", cascade="all, delete-orphan"
    )
    notes: Mapped[list["WeeklyNote"]] = relationship(
        back_populates="course", cascade="all, delete-orphan"
    )


class CourseLink(Base):
    __tablename__ = "course_links"

    id: Mapped[int] = mapped_column(primary_key=True)
    course_id: Mapped[int] = mapped_column(ForeignKey("courses.id", ondelete="CASCADE"), nullable=False)
    label: Mapped[str] = mapped_column(String(80), nullable=False)
    url: Mapped[str] = mapped_column(String(2048), nullable=False)
    position: Mapped[int] = mapped_column(Integer, nullable=False, default=0)


class Task(Base):
    __tablename__ = "tasks"

    id: Mapped[int] = mapped_column(primary_key=True)
    title: Mapped[str] = mapped_column(String(160), nullable=False)
    description: Mapped[str] = mapped_column(Text, nullable=False, default="")
    due_date: Mapped[date] = mapped_column(Date, nullable=False)
    priority: Mapped[str] = mapped_column(String(8), nullable=False, default="medium")
    is_completed: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    course_id: Mapped[int | None] = mapped_column(
        ForeignKey("courses.id", ondelete="SET NULL"), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    course: Mapped[Course | None] = relationship(back_populates="tasks")


class CalendarEvent(Base):
    __tablename__ = "calendar_events"

    id: Mapped[int] = mapped_column(primary_key=True)
    title: Mapped[str] = mapped_column(String(160), nullable=False)
    event_type: Mapped[str] = mapped_column(String(12), nullable=False)
    course_id: Mapped[int | None] = mapped_column(
        ForeignKey("courses.id", ondelete="CASCADE"), nullable=True
    )
    weekday: Mapped[int | None] = mapped_column(Integer, nullable=True)
    event_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    start_time: Mapped[str | None] = mapped_column(String(5), nullable=True)
    end_time: Mapped[str | None] = mapped_column(String(5), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    course: Mapped[Course | None] = relationship(back_populates="calendar_events")


class WeeklyNote(Base):
    __tablename__ = "weekly_notes"

    id: Mapped[int] = mapped_column(primary_key=True)
    course_id: Mapped[int] = mapped_column(ForeignKey("courses.id", ondelete="CASCADE"))
    week_start: Mapped[date] = mapped_column(Date, nullable=False)
    summary: Mapped[str] = mapped_column(Text, nullable=False, default="")
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    course: Mapped[Course] = relationship(back_populates="notes")
    attachments: Mapped[list["Attachment"]] = relationship(
        back_populates="note", cascade="all, delete-orphan"
    )


class SectionWeeklyNote(Base):
    __tablename__ = "section_weekly_notes"
    __table_args__ = (UniqueConstraint("section", "week_start"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    section: Mapped[str] = mapped_column(String(16), nullable=False)
    week_start: Mapped[date] = mapped_column(Date, nullable=False)
    summary: Mapped[str] = mapped_column(Text, nullable=False, default="")
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )


class SectionWeeklyEvent(Base):
    __tablename__ = "section_weekly_events"

    id: Mapped[int] = mapped_column(primary_key=True)
    section: Mapped[str] = mapped_column(String(16), nullable=False)
    title: Mapped[str] = mapped_column(String(160), nullable=False)
    weekday: Mapped[int] = mapped_column(Integer, nullable=False)
    start_time: Mapped[str | None] = mapped_column(String(5), nullable=True)
    end_time: Mapped[str | None] = mapped_column(String(5), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class SectionSpecialEvent(Base):
    __tablename__ = "section_special_events"

    id: Mapped[int] = mapped_column(primary_key=True)
    section: Mapped[str] = mapped_column(String(16), nullable=False)
    title: Mapped[str] = mapped_column(String(160), nullable=False)
    event_date: Mapped[date] = mapped_column(Date, nullable=False)
    start_time: Mapped[str | None] = mapped_column(String(5), nullable=True)
    end_time: Mapped[str | None] = mapped_column(String(5), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class EventComment(Base):
    __tablename__ = "event_comments"

    id: Mapped[int] = mapped_column(primary_key=True)
    event_kind: Mapped[str] = mapped_column(String(24), nullable=False)
    event_id: Mapped[int] = mapped_column(Integer, nullable=False)
    body: Mapped[str] = mapped_column(Text, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class EventOccurrenceException(Base):
    __tablename__ = "event_occurrence_exceptions"
    __table_args__ = (UniqueConstraint("event_kind", "event_id", "occurrence_date"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    event_kind: Mapped[str] = mapped_column(String(16), nullable=False)
    event_id: Mapped[int] = mapped_column(Integer, nullable=False)
    occurrence_date: Mapped[date] = mapped_column(Date, nullable=False)


class Attachment(Base):
    __tablename__ = "attachments"

    id: Mapped[int] = mapped_column(primary_key=True)
    note_id: Mapped[int] = mapped_column(ForeignKey("weekly_notes.id", ondelete="CASCADE"))
    original_name: Mapped[str] = mapped_column(String(255), nullable=False)
    stored_name: Mapped[str] = mapped_column(String(40), nullable=False, unique=True)
    content_type: Mapped[str] = mapped_column(String(120), nullable=False, default="application/octet-stream")
    size: Mapped[int] = mapped_column(Integer, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    note: Mapped[WeeklyNote] = relationship(back_populates="attachments")