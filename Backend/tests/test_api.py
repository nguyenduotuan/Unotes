import os
import tempfile
from datetime import date, timedelta

import pytest

_test_data = tempfile.TemporaryDirectory(prefix="semester-test-")
os.environ["STUDY_DATA_DIR"] = _test_data.name

from fastapi.testclient import TestClient

from app.database import SessionLocal
from app.main import app
from app.models import (
    Attachment,
    CalendarEvent,
    Course,
    CourseLink,
    EventComment,
    EventOccurrenceException,
    SectionWeeklyEvent,
    SectionWeeklyNote,
    SectionSpecialEvent,
    Task,
    WeeklyNote,
)


@pytest.fixture
def client():
    with TestClient(app) as test_client:
        with SessionLocal() as db:
            db.query(Attachment).delete()
            db.query(CalendarEvent).delete()
            db.query(EventComment).delete()
            db.query(EventOccurrenceException).delete()
            db.query(CourseLink).delete()
            db.query(Task).delete()
            db.query(WeeklyNote).delete()
            db.query(SectionWeeklyEvent).delete()
            db.query(SectionSpecialEvent).delete()
            db.query(SectionWeeklyNote).delete()
            db.query(Course).delete()
            db.commit()
        yield test_client


def test_course_task_weekly_note_and_attachment_flow(client):
    assert client.get("/api/courses").json() == []
    course_response = client.post(
        "/api/courses",
        json={"title": "Test Course", "code": "TST 101", "color": "#397c68"},
    )
    assert course_response.status_code == 201
    course = course_response.json()
    assert course["summary"] == ""

    update_response = client.patch(
        f"/api/courses/{course['id']}",
        json={"summary": "Important exam in December", "code": "TST 102"},
    )
    assert update_response.status_code == 200
    updated = update_response.json()
    assert updated["summary"] == "Important exam in December"
    assert updated["code"] == "TST 102"

    week_start = date.today() - timedelta(days=date.today().weekday())
    week = week_start.isoformat()

    task_response = client.post(
        "/api/tasks",
        json={
            "title": "  Review notes  ",
            "due_date": (date.today() + timedelta(days=3)).isoformat(),
            "course_id": course["id"],
            "priority": "high",
        },
    )
    assert task_response.status_code == 201
    task = task_response.json()
    assert task["title"] == "Review notes"
    assert task["is_completed"] is False
    assert client.patch(f"/api/tasks/{task['id']}", json={"is_completed": True}).json()[
        "is_completed"
    ] is True

    note_response = client.put(
        f"/api/courses/{course['id']}/weeks/{week}",
        json={"summary": "Lecture notes on retrieval practice."},
    )
    assert note_response.status_code == 200
    note = note_response.json()
    assert note["summary"] == "Lecture notes on retrieval practice."

    upload_response = client.post(
        f"/api/notes/{note['id']}/attachments",
        files={"file": ("reading.pdf", b"sample document", "application/pdf")},
    )
    assert upload_response.status_code == 201
    attachment = upload_response.json()
    assert attachment["filename"] == "reading.pdf"

    reloaded = client.get(f"/api/courses/{course['id']}/weeks/{week}").json()
    assert reloaded["attachments"][0]["filename"] == "reading.pdf"
    download = client.get(f"/api/attachments/{attachment['id']}/download")
    assert download.content == b"sample document"

    assert client.delete(f"/api/attachments/{attachment['id']}").status_code == 204
    assert client.get(f"/api/attachments/{attachment['id']}/download").status_code == 404


def test_week_start_and_file_type_are_validated(client):
    course = client.post(
        "/api/courses",
        json={"title": "Validation Course", "code": "TST 102", "color": "#397c68"},
    ).json()
    wrong_day = date.today() + timedelta(days=1)
    wrong_day -= timedelta(days=wrong_day.weekday())
    wrong_day += timedelta(days=1)
    response = client.get(f"/api/courses/{course['id']}/weeks/{wrong_day.isoformat()}")
    assert response.status_code == 422


def test_course_links_are_labeled_optional_and_http_only(client):
    course = client.post("/api/courses", json={"title": "Links Course"}).json()
    path = f"/api/courses/{course['id']}/links"

    assert client.get(path).json() == []
    saved = client.put(
        path,
        json=[
            {"label": "Course site", "url": "https://example.edu/course"},
            {"label": "Lecture notes", "url": "https://example.edu/notes"},
        ],
    )
    assert saved.status_code == 200
    assert [link["label"] for link in saved.json()] == ["Course site", "Lecture notes"]
    assert client.get(path).json() == saved.json()

    invalid = client.put(path, json=[{"label": "Unsafe", "url": "javascript:alert(1)"}])
    assert invalid.status_code == 422
    assert client.put(path, json=[]).json() == []


def test_calendar_events_can_be_edited_and_commented(client):
    course = client.post("/api/courses", json={"title": "Comment Course"}).json()
    event = client.post("/api/calendar-events", json={
        "title": "Initial meeting",
        "event_type": "meeting",
        "course_id": course["id"],
        "event_date": date.today().isoformat(),
        "start_time": "10:00",
        "end_time": "11:00",
    }).json()
    update = client.patch(f"/api/calendar-events/{event['id']}", json={
        "title": "Updated meeting",
        "event_type": "meeting",
        "course_id": course["id"],
        "event_date": date.today().isoformat(),
        "start_time": "11:00",
        "end_time": "12:00",
    })
    assert update.status_code == 200
    assert update.json()["title"] == "Updated meeting"

    course_comment_path = f"/api/events/course/{event['id']}/comments"
    comment = client.post(course_comment_path, json={"body": "  Bring project notes  "})
    assert comment.status_code == 201
    assert comment.json()["body"] == "Bring project notes"
    assert client.get(course_comment_path).json() == [comment.json()]
    assert client.post(course_comment_path, json={"body": "  "}).status_code == 422

    weekly = client.put("/api/sections/work/events", json=[{
        "title": "Team sync", "weekday": 2, "start_time": "09:00", "end_time": "10:00",
    }]).json()[0]
    weekly_update = client.patch(f"/api/section-events/{weekly['id']}", json={
        "title": "Planning sync", "weekday": 3, "start_time": "09:30", "end_time": "10:30",
    })
    assert weekly_update.status_code == 200
    weekly_comment_path = f"/api/events/section-weekly/{weekly['id']}/comments"
    assert client.post(weekly_comment_path, json={"body": "Confirm agenda"}).status_code == 201
    assert len(client.get(weekly_comment_path).json()) == 1

    special = client.post("/api/sections/work/events/special", json={
        "title": "Appointment", "event_date": date.today().isoformat(),
    }).json()
    special_update = client.patch(f"/api/section-special-events/{special['id']}", json={
        "title": "Updated appointment", "event_date": date.today().isoformat(),
    })
    assert special_update.status_code == 200
    special_comment_path = f"/api/events/section-special/{special['id']}/comments"
    assert client.post(special_comment_path, json={"body": "Bring ID"}).status_code == 201
    assert len(client.get(special_comment_path).json()) == 1

    assert client.get("/api/events/course/999/comments").status_code == 404
    assert client.delete(f"/api/calendar-events/{event['id']}").status_code == 204
    assert client.get(course_comment_path).status_code == 404

    monday = date.today() - timedelta(days=date.today().weekday())
    note = client.put(
        f"/api/courses/{course['id']}/weeks/{monday.isoformat()}",
        json={"summary": "Week summary"},
    ).json()
    upload = client.post(
        f"/api/notes/{note['id']}/attachments",
        files={"file": ("program.exe", b"not a document", "application/octet-stream")},
    )
    assert upload.status_code == 415


def test_course_classes_and_personal_calendar_events(client):
    course = client.post(
        "/api/courses",
        json={"title": "Weekly classes", "code": "UNI 101", "color": "#397c68"},
    ).json()

    lecture = client.post(
        "/api/calendar-events",
        json={
            "event_type": "lecture",
            "course_id": course["id"],
            "weekday": 0,
            "start_time": "09:00",
            "end_time": "10:30",
        },
    )
    assert lecture.status_code == 201
    assert lecture.json()["title"] == ""

    tutoring = client.post(
        "/api/calendar-events",
        json={
            "title": "Tutoring",
            "event_type": "tutoring",
            "course_id": course["id"],
            "weekday": 2,
            "start_time": "14:00",
            "end_time": "15:00",
        },
    )
    assert tutoring.status_code == 201

    personal = client.post(
        "/api/calendar-events",
        json={
            "title": "Dentist",
            "event_type": "personal",
            "event_date": date.today().isoformat(),
        },
    )
    assert personal.status_code == 201
    untitled_personal = client.post(
        "/api/calendar-events",
        json={"event_type": "personal", "event_date": date.today().isoformat()},
    )
    assert untitled_personal.status_code == 422
    assert len(client.get("/api/calendar-events").json()) == 3
    assert client.delete(f"/api/calendar-events/{lecture.json()['id']}").status_code == 204

    invalid_class = client.post(
        "/api/calendar-events",
        json={"title": "Missing course", "event_type": "lecture", "weekday": 1},
    )
    assert invalid_class.status_code == 422


def test_course_create_and_update_weekly_schedule(client):
    response = client.post(
        "/api/courses",
        json={
            "title": "Schedule course",
            "weekly_events": [
                {
                    "event_type": "lecture",
                    "weekday": 0,
                    "start_time": "09:00",
                    "end_time": "10:30",
                },
                {"title": "Problem set due", "event_type": "deadline", "weekday": 4},
                {
                    "title": "Project meeting",
                    "event_type": "meeting",
                    "weekday": 2,
                    "start_time": "13:00",
                    "end_time": "14:00",
                },
            ],
        },
    )
    assert response.status_code == 201
    course_id = response.json()["id"]
    original_events = client.get("/api/calendar-events").json()
    assert {event["event_type"] for event in original_events} == {
        "lecture",
        "deadline",
        "meeting",
    }
    assert next(event for event in original_events if event["event_type"] == "deadline")[
        "start_time"
    ] is None

    other_course = client.post(
        "/api/courses",
        json={
            "title": "Other course",
            "weekly_events": [
                {
                    "title": "Other lecture",
                    "event_type": "lecture",
                    "weekday": 1,
                    "start_time": "11:00",
                    "end_time": "12:00",
                }
            ],
        },
    ).json()
    original_lecture = next(event for event in original_events if event["event_type"] == "lecture")
    original_deadline = next(event for event in original_events if event["event_type"] == "deadline")
    original_meeting = next(event for event in original_events if event["event_type"] == "meeting")

    update = client.patch(
        f"/api/courses/{course_id}",
        json={
            "weekly_events": [
                {
                    "id": original_lecture["id"],
                    "title": "Algorithms moved",
                    "event_type": "lecture",
                    "weekday": 1,
                    "start_time": "10:00",
                    "end_time": "11:30",
                },
                original_deadline | {"weekday": 3},
                original_meeting,
                {
                    "event_type": "meeting",
                    "weekday": 4,
                    "start_time": "15:00",
                    "end_time": "16:00",
                },
            ]
        },
    )
    assert update.status_code == 200
    events_after_update = client.get("/api/calendar-events").json()
    course_events = [event for event in events_after_update if event["course_id"] == course_id]
    assert len(course_events) == 4
    moved_lecture = next(event for event in course_events if event["event_type"] == "lecture")
    assert moved_lecture["id"] == original_lecture["id"]
    assert moved_lecture["weekday"] == 1
    assert next(event for event in course_events if event["event_type"] == "deadline")["weekday"] == 3
    assert any(event["title"] == "" for event in course_events if event["event_type"] == "meeting")
    assert any(event["course_id"] == other_course["id"] for event in events_after_update)


def test_section_notes_and_recurring_events_are_isolated(client):
    monday = date.today() - timedelta(days=date.today().weekday())
    week = monday.isoformat()

    work_note = client.put(
        f"/api/sections/work/weeks/{week}", json={"summary": "Work planning"}
    )
    partner_note = client.put(
        f"/api/sections/girlfriend/weeks/{week}", json={"summary": "Dinner plans"}
    )
    assert work_note.status_code == partner_note.status_code == 200
    assert client.get(f"/api/sections/work/weeks/{week}").json()["summary"] == "Work planning"
    assert client.get(f"/api/sections/personal/weeks/{week}").json()["summary"] == ""

    course = client.post("/api/courses", json={"title": "Uni"}).json()
    course_note = client.put(
        f"/api/courses/{course['id']}/weeks/{week}", json={"summary": "Course notes"}
    )
    assert course_note.status_code == 200

    course_special = client.post(
        "/api/calendar-events",
        json={
            "title": "One-time class meeting",
            "event_type": "meeting",
            "course_id": course["id"],
            "event_date": date.today().isoformat(),
            "start_time": "13:00",
            "end_time": "14:00",
        },
    )
    assert course_special.status_code == 201
    assert course_special.json()["weekday"] is None

    for section in ("work", "girlfriend", "personal"):
        special = client.post(
            f"/api/sections/{section}/events/special",
            json={"title": f"{section} appointment", "event_date": date.today().isoformat()},
        )
        assert special.status_code == 201
        assert special.json()["section"] == section
    assert len(client.get("/api/section-special-events").json()) == 3

    schedule = client.put(
        "/api/sections/work/events",
        json=[{"title": "Team meeting", "weekday": 2, "start_time": "10:00", "end_time": "11:00"}],
    )
    assert schedule.status_code == 200
    event = schedule.json()[0]
    assert event["section"] == "work"
    assert client.get("/api/section-events").json() == [event]

    cross_section_update = client.put(
        "/api/sections/girlfriend/events",
        json=[{"id": event["id"], "title": "Should not move", "weekday": 2, "start_time": "10:00", "end_time": "11:00"}],
    )
    assert cross_section_update.status_code == 422
    assert client.get("/api/section-events").json() == [event]


def test_recurring_event_occurrences_can_be_cancelled_and_restored(client):
    course = client.post("/api/courses", json={"title": "Weekly course"}).json()
    course_event = client.post(
        "/api/calendar-events",
        json={
            "title": "Lecture",
            "event_type": "lecture",
            "course_id": course["id"],
            "weekday": 0,
            "start_time": "09:00",
            "end_time": "10:00",
        },
    ).json()
    monday = date.today() + timedelta(days=(0 - date.today().weekday()) % 7)
    occurrence_path = f"/api/event-occurrences/course/{course_event['id']}/{monday.isoformat()}"

    cancelled = client.put(occurrence_path)
    assert cancelled.status_code == 200
    assert cancelled.json()["event_kind"] == "course"
    assert client.put(occurrence_path).json()["id"] == cancelled.json()["id"]
    assert client.get("/api/event-occurrences").json() == [cancelled.json()]
    assert client.delete(occurrence_path).status_code == 204
    assert client.get("/api/event-occurrences").json() == []

    wrong_weekday = client.put(
        f"/api/event-occurrences/course/{course_event['id']}/{(monday + timedelta(days=1)).isoformat()}"
    )
    assert wrong_weekday.status_code == 422

    one_time = client.post(
        "/api/calendar-events",
        json={
            "title": "One-time meeting",
            "event_type": "meeting",
            "course_id": course["id"],
            "event_date": monday.isoformat(),
            "start_time": "11:00",
            "end_time": "12:00",
        },
    ).json()
    assert client.put(f"/api/event-occurrences/course/{one_time['id']}/{monday.isoformat()}").status_code == 422

    section_event = client.put(
        "/api/sections/work/events",
        json=[{"title": "Team check-in", "weekday": 0, "start_time": "13:00", "end_time": "14:00"}],
    ).json()[0]
    section_path = f"/api/event-occurrences/section-weekly/{section_event['id']}/{monday.isoformat()}"
    assert client.put(section_path).status_code == 200
    assert len(client.get("/api/event-occurrences").json()) == 1
    moved = client.put(
        "/api/sections/work/events",
        json=[section_event | {"weekday": 1}],
    )
    assert moved.status_code == 200
    assert client.get("/api/event-occurrences").json() == []