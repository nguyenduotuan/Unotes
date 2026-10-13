from datetime import date
from pathlib import Path, PurePosixPath
from uuid import uuid4

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status
from fastapi.responses import FileResponse
from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.config import ALLOWED_FILE_TYPES, MAX_UPLOAD_BYTES, UPLOAD_DIR
from app.database import get_db
from app.models import Attachment, CalendarEvent, Course, CourseLink, EventComment, EventOccurrenceException, SectionSpecialEvent, SectionWeeklyEvent, SectionWeeklyNote, Task, WeeklyNote
from app.schemas import (
    CalendarEventCreate,
    CalendarEventOut,
    CourseCreate,
    CourseLinkInput,
    CourseLinkOut,
    CourseOut,
    CourseUpdate,
    EventCommentInput,
    EventCommentOut,
    EventKind,
    EventOccurrenceExceptionOut,
    RecurringEventKind,
    SectionKey,
    SectionSpecialEventInput,
    SectionSpecialEventOut,
    SectionWeeklyEventInput,
    SectionWeeklyEventOut,
    SectionWeeklyNoteOut,
    SectionWeeklyNoteUpsert,
    TaskCreate,
    TaskOut,
    TaskUpdate,
    WeeklyNoteOut,
    WeeklyNoteUpsert,
)


router = APIRouter(prefix="/api")


def event_comments(db: Session, event_kind: EventKind, event_id: int):
    return db.query(EventComment).filter_by(event_kind=event_kind, event_id=event_id)


def event_occurrence_exceptions(db: Session, event_kind: RecurringEventKind, event_id: int):
    return db.query(EventOccurrenceException).filter_by(event_kind=event_kind, event_id=event_id)


def ensure_recurring_event_exists(
    db: Session, event_kind: RecurringEventKind, event_id: int, occurrence_date: date | None = None
) -> None:
    model = CalendarEvent if event_kind == "course" else SectionWeeklyEvent
    event = db.get(model, event_id)
    if event is None:
        raise HTTPException(status_code=404, detail="Recurring event not found")
    if event_kind == "course" and (event.event_type == "personal" or event.event_date is not None):
        raise HTTPException(status_code=422, detail="Only recurring events can have cancelled occurrences")
    if occurrence_date is not None and event.weekday != occurrence_date.weekday():
        raise HTTPException(status_code=422, detail="Date does not match the recurring event's weekday")


def ensure_comment_event_exists(db: Session, event_kind: EventKind, event_id: int) -> None:
    model = {
        "course": CalendarEvent,
        "section-weekly": SectionWeeklyEvent,
        "section-special": SectionSpecialEvent,
    }[event_kind]
    if db.get(model, event_id) is None:
        raise HTTPException(status_code=404, detail="Event not found")


@router.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@router.get("/courses", response_model=list[CourseOut])
def list_courses(db: Session = Depends(get_db)):
    return db.scalars(select(Course).order_by(Course.title)).all()


@router.post("/courses", response_model=CourseOut, status_code=status.HTTP_201_CREATED)
def create_course(payload: CourseCreate, db: Session = Depends(get_db)):
    course = Course(**payload.model_dump(exclude={"weekly_events"}))
    db.add(course)
    db.flush()
    for weekly_event in payload.weekly_events:
        db.add(
            CalendarEvent(
                **weekly_event.model_dump(exclude={"id"}),
                course_id=course.id,
                event_date=None,
            )
        )
    db.commit()
    db.refresh(course)
    return course


@router.patch("/courses/{course_id}", response_model=CourseOut)
def update_course(course_id: int, payload: CourseUpdate, db: Session = Depends(get_db)):
    course = db.get(Course, course_id)
    if course is None:
        raise HTTPException(status_code=404, detail="Course not found")
    changes = payload.model_dump(exclude_unset=True)
    weekly_events = changes.pop("weekly_events", None)
    for field, value in changes.items():
        setattr(course, field, value)

    if weekly_events is not None:
        existing_events = db.scalars(
            select(CalendarEvent).where(CalendarEvent.course_id == course_id)
        ).all()
        events_by_id = {event.id: event for event in existing_events}
        retained_ids = set()
        for weekly_event in weekly_events:
            values = {field: value for field, value in weekly_event.items() if field != "id"}
            values.setdefault("title", "")
            if weekly_event.get("id") is None:
                db.add(CalendarEvent(**values, course_id=course_id, event_date=None))
                continue
            event = events_by_id.get(weekly_event["id"])
            if event is None:
                raise HTTPException(status_code=422, detail="Weekly event does not belong to this course")
            retained_ids.add(event.id)
            if event.weekday != values.get("weekday", event.weekday):
                event_occurrence_exceptions(db, "course", event.id).delete(synchronize_session=False)
            for field, value in values.items():
                setattr(event, field, value)
        for event in existing_events:
            if event.id not in retained_ids:
                event_comments(db, "course", event.id).delete(synchronize_session=False)
                event_occurrence_exceptions(db, "course", event.id).delete(synchronize_session=False)
                db.delete(event)

    db.commit()
    db.refresh(course)
    return course


@router.get("/courses/{course_id}/links", response_model=list[CourseLinkOut])
def list_course_links(course_id: int, db: Session = Depends(get_db)):
    if db.get(Course, course_id) is None:
        raise HTTPException(status_code=404, detail="Course not found")
    return db.scalars(
        select(CourseLink).where(CourseLink.course_id == course_id).order_by(CourseLink.position, CourseLink.id)
    ).all()


@router.put("/courses/{course_id}/links", response_model=list[CourseLinkOut])
def save_course_links(course_id: int, payload: list[CourseLinkInput], db: Session = Depends(get_db)):
    if db.get(Course, course_id) is None:
        raise HTTPException(status_code=404, detail="Course not found")
    if len(payload) > 20:
        raise HTTPException(status_code=422, detail="A course can have at most 20 links")

    db.query(CourseLink).filter(CourseLink.course_id == course_id).delete()
    db.add_all(
        CourseLink(course_id=course_id, label=link.label, url=str(link.url), position=index)
        for index, link in enumerate(payload)
    )
    db.commit()
    return db.scalars(
        select(CourseLink).where(CourseLink.course_id == course_id).order_by(CourseLink.position, CourseLink.id)
    ).all()


@router.delete("/courses/{course_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_course(course_id: int, db: Session = Depends(get_db)):
    course = db.get(Course, course_id)
    if course is None:
        raise HTTPException(status_code=404, detail="Course not found")

    notes = db.scalars(
        select(WeeklyNote).options(selectinload(WeeklyNote.attachments)).where(
            WeeklyNote.course_id == course_id
        )
    ).all()
    for note in notes:
        for attachment in note.attachments:
            (UPLOAD_DIR / attachment.stored_name).unlink(missing_ok=True)

    for task in db.scalars(select(Task).where(Task.course_id == course_id)):
        task.course_id = None
    for event in db.scalars(select(CalendarEvent).where(CalendarEvent.course_id == course_id)):
        event_comments(db, "course", event.id).delete(synchronize_session=False)
        event_occurrence_exceptions(db, "course", event.id).delete(synchronize_session=False)
    db.delete(course)
    db.commit()


@router.get("/tasks", response_model=list[TaskOut])
def list_tasks(course_id: int | None = None, db: Session = Depends(get_db)):
    query = select(Task).order_by(Task.due_date, Task.id)
    if course_id is not None:
        query = query.where(Task.course_id == course_id)
    return db.scalars(query).all()


@router.post("/tasks", response_model=TaskOut, status_code=status.HTTP_201_CREATED)
def create_task(payload: TaskCreate, db: Session = Depends(get_db)):
    if payload.course_id is not None and db.get(Course, payload.course_id) is None:
        raise HTTPException(status_code=404, detail="Course not found")
    task = Task(**payload.model_dump())
    db.add(task)
    db.commit()
    db.refresh(task)
    return task


@router.patch("/tasks/{task_id}", response_model=TaskOut)
def update_task(task_id: int, payload: TaskUpdate, db: Session = Depends(get_db)):
    task = db.get(Task, task_id)
    if task is None:
        raise HTTPException(status_code=404, detail="Task not found")

    changes = payload.model_dump(exclude_unset=True)
    if "course_id" in changes and changes["course_id"] is not None:
        if db.get(Course, changes["course_id"]) is None:
            raise HTTPException(status_code=404, detail="Course not found")
    for field, value in changes.items():
        setattr(task, field, value)
    db.commit()
    db.refresh(task)
    return task


@router.delete("/tasks/{task_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_task(task_id: int, db: Session = Depends(get_db)):
    task = db.get(Task, task_id)
    if task is None:
        raise HTTPException(status_code=404, detail="Task not found")
    db.delete(task)
    db.commit()


@router.get("/calendar-events", response_model=list[CalendarEventOut])
def list_calendar_events(db: Session = Depends(get_db)):
    return db.scalars(select(CalendarEvent).order_by(CalendarEvent.title)).all()


@router.post(
    "/calendar-events",
    response_model=CalendarEventOut,
    status_code=status.HTTP_201_CREATED,
)
def create_calendar_event(payload: CalendarEventCreate, db: Session = Depends(get_db)):
    if payload.course_id is not None and db.get(Course, payload.course_id) is None:
        raise HTTPException(status_code=404, detail="Course not found")
    event = CalendarEvent(**payload.model_dump())
    db.add(event)
    db.commit()
    db.refresh(event)
    return event


@router.patch("/calendar-events/{event_id}", response_model=CalendarEventOut)
def update_calendar_event(event_id: int, payload: CalendarEventCreate, db: Session = Depends(get_db)):
    event = db.get(CalendarEvent, event_id)
    if event is None:
        raise HTTPException(status_code=404, detail="Calendar event not found")
    if payload.course_id is not None and db.get(Course, payload.course_id) is None:
        raise HTTPException(status_code=404, detail="Course not found")
    if event.weekday != payload.weekday or event.event_date != payload.event_date:
        event_occurrence_exceptions(db, "course", event_id).delete(synchronize_session=False)
    for field, value in payload.model_dump().items():
        setattr(event, field, value)
    db.commit()
    db.refresh(event)
    return event


@router.delete("/calendar-events/{event_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_calendar_event(event_id: int, db: Session = Depends(get_db)):
    calendar_event = db.get(CalendarEvent, event_id)
    if calendar_event is None:
        raise HTTPException(status_code=404, detail="Calendar event not found")
    event_comments(db, "course", event_id).delete(synchronize_session=False)
    event_occurrence_exceptions(db, "course", event_id).delete(synchronize_session=False)
    db.delete(calendar_event)
    db.commit()


@router.get("/section-events", response_model=list[SectionWeeklyEventOut])
def list_section_events(db: Session = Depends(get_db)):
    return db.scalars(
        select(SectionWeeklyEvent).order_by(
            SectionWeeklyEvent.section, SectionWeeklyEvent.weekday, SectionWeeklyEvent.start_time
        )
    ).all()


@router.put("/sections/{section}/events", response_model=list[SectionWeeklyEventOut])
def save_section_events(
    section: SectionKey,
    payload: list[SectionWeeklyEventInput],
    db: Session = Depends(get_db),
):
    existing = db.scalars(
        select(SectionWeeklyEvent).where(SectionWeeklyEvent.section == section)
    ).all()
    events_by_id = {event.id: event for event in existing}
    retained_ids = set()
    for item in payload:
        values = item.model_dump(exclude={"id"})
        if item.id is None:
            db.add(SectionWeeklyEvent(section=section, **values))
            continue
        event = events_by_id.get(item.id)
        if event is None:
            raise HTTPException(status_code=422, detail="Weekly event does not belong to this section")
        retained_ids.add(event.id)
        if event.weekday != values["weekday"]:
            event_occurrence_exceptions(db, "section-weekly", event.id).delete(synchronize_session=False)
        for field, value in values.items():
            setattr(event, field, value)
    for event in existing:
        if event.id not in retained_ids:
            event_comments(db, "section-weekly", event.id).delete(synchronize_session=False)
            event_occurrence_exceptions(db, "section-weekly", event.id).delete(synchronize_session=False)
            db.delete(event)
    db.commit()
    return db.scalars(
        select(SectionWeeklyEvent)
        .where(SectionWeeklyEvent.section == section)
        .order_by(SectionWeeklyEvent.weekday, SectionWeeklyEvent.start_time)
    ).all()


@router.delete("/section-events/{event_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_section_event(event_id: int, db: Session = Depends(get_db)):
    event = db.get(SectionWeeklyEvent, event_id)
    if event is None:
        raise HTTPException(status_code=404, detail="Weekly event not found")
    event_comments(db, "section-weekly", event_id).delete(synchronize_session=False)
    event_occurrence_exceptions(db, "section-weekly", event_id).delete(synchronize_session=False)
    db.delete(event)
    db.commit()


@router.patch("/section-events/{event_id}", response_model=SectionWeeklyEventOut)
def update_section_event(event_id: int, payload: SectionWeeklyEventInput, db: Session = Depends(get_db)):
    event = db.get(SectionWeeklyEvent, event_id)
    if event is None:
        raise HTTPException(status_code=404, detail="Weekly event not found")
    if event.weekday != payload.weekday:
        event_occurrence_exceptions(db, "section-weekly", event_id).delete(synchronize_session=False)
    for field, value in payload.model_dump(exclude={"id"}).items():
        setattr(event, field, value)
    db.commit()
    db.refresh(event)
    return event


@router.get("/section-special-events", response_model=list[SectionSpecialEventOut])
def list_section_special_events(db: Session = Depends(get_db)):
    return db.scalars(
        select(SectionSpecialEvent).order_by(SectionSpecialEvent.event_date, SectionSpecialEvent.start_time)
    ).all()


@router.post(
    "/sections/{section}/events/special",
    response_model=SectionSpecialEventOut,
    status_code=status.HTTP_201_CREATED,
)
def create_section_special_event(
    section: SectionKey,
    payload: SectionSpecialEventInput,
    db: Session = Depends(get_db),
):
    event = SectionSpecialEvent(section=section, **payload.model_dump())
    db.add(event)
    db.commit()
    db.refresh(event)
    return event


@router.delete("/section-special-events/{event_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_section_special_event(event_id: int, db: Session = Depends(get_db)):
    event = db.get(SectionSpecialEvent, event_id)
    if event is None:
        raise HTTPException(status_code=404, detail="One-time section event not found")
    event_comments(db, "section-special", event_id).delete(synchronize_session=False)
    db.delete(event)
    db.commit()


@router.patch("/section-special-events/{event_id}", response_model=SectionSpecialEventOut)
def update_section_special_event(
    event_id: int,
    payload: SectionSpecialEventInput,
    db: Session = Depends(get_db),
):
    event = db.get(SectionSpecialEvent, event_id)
    if event is None:
        raise HTTPException(status_code=404, detail="One-time section event not found")
    for field, value in payload.model_dump().items():
        setattr(event, field, value)
    db.commit()
    db.refresh(event)
    return event


@router.get("/events/{event_kind}/{event_id}/comments", response_model=list[EventCommentOut])
def list_event_comments(event_kind: EventKind, event_id: int, db: Session = Depends(get_db)):
    ensure_comment_event_exists(db, event_kind, event_id)
    return event_comments(db, event_kind, event_id).order_by(EventComment.created_at, EventComment.id).all()


@router.post(
    "/events/{event_kind}/{event_id}/comments",
    response_model=EventCommentOut,
    status_code=status.HTTP_201_CREATED,
)
def create_event_comment(
    event_kind: EventKind,
    event_id: int,
    payload: EventCommentInput,
    db: Session = Depends(get_db),
):
    ensure_comment_event_exists(db, event_kind, event_id)
    comment = EventComment(event_kind=event_kind, event_id=event_id, body=payload.body)
    db.add(comment)
    db.commit()
    db.refresh(comment)
    return comment


@router.get("/event-occurrences", response_model=list[EventOccurrenceExceptionOut])
def list_event_occurrence_exceptions(db: Session = Depends(get_db)):
    return db.scalars(
        select(EventOccurrenceException).order_by(EventOccurrenceException.occurrence_date)
    ).all()


@router.put(
    "/event-occurrences/{event_kind}/{event_id}/{occurrence_date}",
    response_model=EventOccurrenceExceptionOut,
)
def cancel_event_occurrence(
    event_kind: RecurringEventKind,
    event_id: int,
    occurrence_date: date,
    db: Session = Depends(get_db),
):
    ensure_recurring_event_exists(db, event_kind, event_id, occurrence_date)
    exception = db.scalar(
        select(EventOccurrenceException).where(
            EventOccurrenceException.event_kind == event_kind,
            EventOccurrenceException.event_id == event_id,
            EventOccurrenceException.occurrence_date == occurrence_date,
        )
    )
    if exception is None:
        exception = EventOccurrenceException(
            event_kind=event_kind, event_id=event_id, occurrence_date=occurrence_date
        )
        db.add(exception)
        db.commit()
        db.refresh(exception)
    return exception


@router.delete(
    "/event-occurrences/{event_kind}/{event_id}/{occurrence_date}",
    status_code=status.HTTP_204_NO_CONTENT,
)
def restore_event_occurrence(
    event_kind: RecurringEventKind,
    event_id: int,
    occurrence_date: date,
    db: Session = Depends(get_db),
):
    ensure_recurring_event_exists(db, event_kind, event_id, occurrence_date)
    event_occurrence_exceptions(db, event_kind, event_id).filter_by(
        occurrence_date=occurrence_date
    ).delete(synchronize_session=False)
    db.commit()


@router.get("/sections/{section}/weeks/{week_start}", response_model=SectionWeeklyNoteOut)
def get_section_weekly_note(section: SectionKey, week_start: date, db: Session = Depends(get_db)):
    if week_start.weekday() != 0:
        raise HTTPException(status_code=422, detail="Week must start on a Monday")
    note = db.scalar(
        select(SectionWeeklyNote).where(
            SectionWeeklyNote.section == section, SectionWeeklyNote.week_start == week_start
        )
    )
    if note is not None:
        return note
    return SectionWeeklyNoteOut(
        id=None, section=section, week_start=week_start, summary="", updated_at=None
    )


@router.put("/sections/{section}/weeks/{week_start}", response_model=SectionWeeklyNoteOut)
def save_section_weekly_note(
    section: SectionKey,
    week_start: date,
    payload: SectionWeeklyNoteUpsert,
    db: Session = Depends(get_db),
):
    if week_start.weekday() != 0:
        raise HTTPException(status_code=422, detail="Week must start on a Monday")
    note = db.scalar(
        select(SectionWeeklyNote).where(
            SectionWeeklyNote.section == section, SectionWeeklyNote.week_start == week_start
        )
    )
    if note is None:
        note = SectionWeeklyNote(section=section, week_start=week_start, summary=payload.summary)
        db.add(note)
    else:
        note.summary = payload.summary
    db.commit()
    db.refresh(note)
    return note


@router.get("/courses/{course_id}/weeks/{week_start}", response_model=WeeklyNoteOut)
def get_weekly_note(course_id: int, week_start: date, db: Session = Depends(get_db)):
    if db.get(Course, course_id) is None:
        raise HTTPException(status_code=404, detail="Course not found")
    if week_start.weekday() != 0:
        raise HTTPException(status_code=422, detail="Week must start on a Monday")

    note = db.scalar(
        select(WeeklyNote)
        .options(selectinload(WeeklyNote.attachments))
        .where(WeeklyNote.course_id == course_id, WeeklyNote.week_start == week_start)
    )
    if note is None:
        return WeeklyNoteOut(
            id=None,
            course_id=course_id,
            week_start=week_start,
            summary="",
            updated_at=None,
            attachments=[],
        )
    return note


@router.put("/courses/{course_id}/weeks/{week_start}", response_model=WeeklyNoteOut)
def save_weekly_note(
    course_id: int,
    week_start: date,
    payload: WeeklyNoteUpsert,
    db: Session = Depends(get_db),
):
    if db.get(Course, course_id) is None:
        raise HTTPException(status_code=404, detail="Course not found")
    if week_start.weekday() != 0:
        raise HTTPException(status_code=422, detail="Week must start on a Monday")

    note = db.scalar(
        select(WeeklyNote)
        .options(selectinload(WeeklyNote.attachments))
        .where(WeeklyNote.course_id == course_id, WeeklyNote.week_start == week_start)
    )
    if note is None:
        note = WeeklyNote(course_id=course_id, week_start=week_start, summary=payload.summary)
        db.add(note)
    else:
        note.summary = payload.summary
    db.commit()
    db.refresh(note)
    return note


@router.post(
    "/notes/{note_id}/attachments",
    response_model=None,
    status_code=status.HTTP_201_CREATED,
)
async def upload_attachment(
    note_id: int,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
):
    note = db.get(WeeklyNote, note_id)
    if note is None:
        raise HTTPException(status_code=404, detail="Weekly note not found")

    original_name = PurePosixPath((file.filename or "attachment").replace("\\", "/")).name[:255]
    suffix = Path(original_name).suffix.lower()
    if suffix not in ALLOWED_FILE_TYPES:
        raise HTTPException(status_code=415, detail="This file type is not supported")

    stored_name = f"{uuid4().hex}{suffix}"
    destination = UPLOAD_DIR / stored_name
    size = 0
    try:
        with destination.open("wb") as output:
            while chunk := await file.read(64 * 1024):
                size += len(chunk)
                if size > MAX_UPLOAD_BYTES:
                    raise HTTPException(status_code=413, detail="Files must be 12 MB or smaller")
                output.write(chunk)
    except Exception:
        destination.unlink(missing_ok=True)
        raise
    finally:
        await file.close()

    attachment = Attachment(
        note_id=note_id,
        original_name=original_name,
        stored_name=stored_name,
        content_type=file.content_type or "application/octet-stream",
        size=size,
    )
    db.add(attachment)
    db.commit()
    db.refresh(attachment)
    return {
        "id": attachment.id,
        "filename": attachment.original_name,
        "content_type": attachment.content_type,
        "size": attachment.size,
        "created_at": attachment.created_at,
    }


@router.get("/attachments/{attachment_id}/download")
def download_attachment(attachment_id: int, db: Session = Depends(get_db)):
    attachment = db.get(Attachment, attachment_id)
    if attachment is None:
        raise HTTPException(status_code=404, detail="Attachment not found")
    path = UPLOAD_DIR / attachment.stored_name
    if not path.is_file():
        raise HTTPException(status_code=404, detail="Attachment file is missing")
    return FileResponse(path, filename=attachment.original_name, media_type=attachment.content_type)


@router.delete("/attachments/{attachment_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_attachment(attachment_id: int, db: Session = Depends(get_db)):
    attachment = db.get(Attachment, attachment_id)
    if attachment is None:
        raise HTTPException(status_code=404, detail="Attachment not found")
    (UPLOAD_DIR / attachment.stored_name).unlink(missing_ok=True)
    db.delete(attachment)
    db.commit()