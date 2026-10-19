
from sqlalchemy import UniqueConstraint
from sqlalchemy import (
    Column,
    Integer,
    String,
    Text,
    DateTime,
    ForeignKey,
)
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func

from database import Base


# =========================================================
# 1. USER MODEL
# =========================================================

class User(Base):
    __tablename__ = "users"

    id = Column(
        Integer,
        primary_key=True,
        index=True,
    )

    full_name = Column(
        String(120),
        nullable=False,
    )

    email = Column(
        String(255),
        unique=True,
        index=True,
        nullable=False,
    )

    password_hash = Column(
        String(255),
        nullable=False,
    )

    role = Column(
        String(20),
        nullable=False,
    )

    created_at = Column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )


# =========================================================
# 2. JOB MODEL
# =========================================================

class Job(Base):
    __tablename__ = "jobs"

    id = Column(
        Integer,
        primary_key=True,
        index=True,
    )

    title = Column(
        String(200),
        nullable=False,
    )

    description = Column(
        Text,
        nullable=False,
    )

    required_skills = Column(
        Text,
        nullable=False,
    )

    qualifications = Column(
        Text,
        nullable=False,
    )

    created_by = Column(
        Integer,
        ForeignKey("users.id"),
        nullable=False,
        index=True,
    )

    created_at = Column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )

    # Relationship to interview rooms
    rooms = relationship(
        "InterviewRoom",
        back_populates="job",
        cascade="all, delete-orphan",
    )


# =========================================================
# 3. INTERVIEW ROOM MODEL
# =========================================================

class InterviewRoom(Base):
    __tablename__ = "interview_rooms"

    id = Column(
        Integer,
        primary_key=True,
        index=True,
    )

    room_code = Column(
        String(100),
        unique=True,
        nullable=False,
        index=True,
    )

    title = Column(
        String(200),
        nullable=False,
    )

    status = Column(
        String(30),
        default="scheduled",
        nullable=False,
    )

    job_id = Column(
        Integer,
        ForeignKey("jobs.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    created_by = Column(
        Integer,
        ForeignKey("users.id"),
        nullable=False,
        index=True,
    )

    created_at = Column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )

    # Relationship to the associated job
    job = relationship(
        "Job",
        back_populates="rooms",
    )
    # =====================================================
# CANDIDATE PROFILE
# =====================================================

from sqlalchemy import UniqueConstraint


class CandidateProfile(Base):
    __tablename__ = "candidate_profiles"

    id = Column(Integer, primary_key=True, index=True)

    user_id = Column(
        Integer,
        ForeignKey("users.id"),
        unique=True,
        nullable=False,
        index=True,
    )

    phone = Column(String(20), nullable=True)

    qualification = Column(String(200), nullable=True)

    college = Column(String(200), nullable=True)

    graduation_year = Column(Integer, nullable=True)

    skills = Column(Text, nullable=True)

    resume_path = Column(String(500), nullable=True)

    created_at = Column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )


# =====================================================
# JOB APPLICATIONS
# =====================================================

class JobApplication(Base):
    __tablename__ = "job_applications"

    id = Column(Integer, primary_key=True, index=True)

    candidate_id = Column(
        Integer,
        ForeignKey("users.id"),
        nullable=False,
        index=True,
    )

    job_id = Column(
        Integer,
        ForeignKey("jobs.id"),
        nullable=False,
        index=True,
    )

    status = Column(
        String(30),
        default="applied",
        nullable=False,
    )

    applied_at = Column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )

    __table_args__ = (
        UniqueConstraint(
            "candidate_id",
            "job_id",
            name="unique_candidate_job_application",
        ),
    )
  # =====================================================
# INTERVIEW INVITATIONS
# =====================================================

class InterviewInvitation(Base):
    __tablename__ = "interview_invitations"

    id = Column(Integer, primary_key=True, index=True)

    room_id = Column(
        Integer,
        ForeignKey("interview_rooms.id"),
        nullable=False,
    )

    candidate_id = Column(
        Integer,
        ForeignKey("users.id"),
        nullable=False,
    )

    status = Column(
        String(30),
        default="invited",
        nullable=False,
    )

    invited_at = Column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )

    __table_args__ = (
        UniqueConstraint(
            "room_id",
            "candidate_id",
            name="uq_room_candidate_invitation",
        ),
    )
    # =====================================================
# FINAL INTERVIEW EVALUATION
# =====================================================
# =====================================================
# FINAL INTERVIEW EVALUATION
# =====================================================

class InterviewEvaluation(Base):
    __tablename__ = "interview_evaluations"

    id = Column(Integer, primary_key=True, index=True)

    candidate_id = Column(
        Integer,
        ForeignKey("users.id"),
        nullable=False,
        index=True,
    )

    job_id = Column(
        Integer,
        ForeignKey("jobs.id"),
        nullable=False,
        index=True,
    )

    room_id = Column(
        Integer,
        ForeignKey("interview_rooms.id"),
        nullable=False,
        index=True,
    )

    # Resume score: 0–100, weighted at 40%
    resume_score = Column(
        Integer,
        nullable=False,
    )

    # Behavioral component scores
    eye_gaze_score = Column(
        Integer,
        nullable=False,
        default=0,
    )

    head_orientation_score = Column(
        Integer,
        nullable=False,
        default=0,
    )

    microphone_activity_score = Column(
        Integer,
        nullable=False,
        default=0,
    )
        # Combined behavioral score: maximum 30 points
    behavioral_score = Column(
        Integer,
        nullable=False,
        default=0,
    )

    # HR manually enters a score from 0 to 30
    manual_interview_score = Column(
        Integer,
        nullable=False,
        default=0,
    )

    # Sum of the five weighted components: maximum 100
    overall_score = Column(
        Integer,
        nullable=False,
    )

    # Pending, selected, or rejected
    approval_status = Column(
        String(30),
        default="pending",
        nullable=False,
    )

    evaluation_status = Column(
        String(30),
        default="completed",
        nullable=False,
    )

    created_at = Column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )

    __table_args__ = (
        UniqueConstraint(
            "candidate_id",
            "job_id",
            "room_id",
            name="uq_candidate_job_room_evaluation",
        ),
    )