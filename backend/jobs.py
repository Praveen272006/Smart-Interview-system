import secrets
import logging
import string
from models import (
    User,
    Job,
    InterviewRoom,
    JobApplication,
    InterviewInvitation,
    CandidateProfile,
    InterviewEvaluation,
)
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from database import get_db
from auth import get_current_user
from models import User, Job, InterviewRoom


router = APIRouter(prefix="/api", tags=["Jobs and Interviews"])


# =====================================================
# REQUEST MODELS
# =====================================================

class JobCreate(BaseModel):
    title: str = Field(min_length=2, max_length=200)
    description: str = Field(min_length=10)
    required_skills: str = Field(min_length=1)
    qualifications: str = Field(min_length=1)


class InterviewRoomCreate(BaseModel):
    job_id: int
    title: str = Field(min_length=2, max_length=200)


# =====================================================
# HELPER FUNCTIONS
# =====================================================

def require_hr(user: User):
    if user.role != "hr":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only HR users can perform this operation.",
        )


def generate_room_code(db: Session) -> str:
    alphabet = string.ascii_uppercase + string.digits

    for _ in range(10):
        code = "".join(secrets.choice(alphabet) for _ in range(8))

        existing = (
            db.query(InterviewRoom)
            .filter(InterviewRoom.room_code == code)
            .first()
        )

        if not existing:
            return code

    raise HTTPException(
        status_code=500,
        detail="Could not generate a unique interview room code.",
    )


def job_response(job: Job) -> dict:
    return {
        "id": job.id,
        "title": job.title,
        "description": job.description,
        "required_skills": job.required_skills,
        "qualifications": job.qualifications,
        "created_by": job.created_by,
        "created_at": (
            job.created_at.isoformat()
            if job.created_at
            else None
        ),
    }


def room_response(room: InterviewRoom) -> dict:
    return {
        "id": room.id,
        "room_code": room.room_code,
        "title": room.title,
        "status": room.status,
        "job_id": room.job_id,
        "job_title": room.job.title,
        "created_by": room.created_by,
        "created_at": (
            room.created_at.isoformat()
            if room.created_at
            else None
        ),
    }


# =====================================================
# JOB ENDPOINTS
# =====================================================

@router.post("/jobs", status_code=status.HTTP_201_CREATED)
def create_job(
    request: JobCreate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    require_hr(user)

    job = Job(
        title=request.title.strip(),
        description=request.description.strip(),
        required_skills=request.required_skills.strip(),
        qualifications=request.qualifications.strip(),
        created_by=user.id,
    )

    db.add(job)
    db.commit()
    db.refresh(job)

    return job_response(job)


@router.get("/jobs")
def list_jobs(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    require_hr(user)

    jobs = (
        db.query(Job)
        .filter(Job.created_by == user.id)
        .order_by(Job.created_at.desc())
        .all()
    )

    return [job_response(job) for job in jobs]


@router.get("/jobs/{job_id}")
def get_job(
    job_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    require_hr(user)

    job = (
        db.query(Job)
        .filter(
            Job.id == job_id,
            Job.created_by == user.id,
        )
        .first()
    )

    if not job:
        raise HTTPException(
            status_code=404,
            detail="Job not found.",
        )

    return job_response(job)


# =====================================================
# INTERVIEW ROOM ENDPOINTS
# =====================================================

@router.post(
    "/interview-rooms",
    status_code=status.HTTP_201_CREATED,
)
def create_interview_room(
    request: InterviewRoomCreate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    require_hr(user)

    job = (
        db.query(Job)
        .filter(
            Job.id == request.job_id,
            Job.created_by == user.id,
        )
        .first()
    )

    if not job:
        raise HTTPException(
            status_code=404,
            detail="Job not found or you do not own this job.",
        )

    room = InterviewRoom(
        room_code=generate_room_code(db),
        title=request.title.strip(),
        status="scheduled",
        job_id=job.id,
        created_by=user.id,
    )

    db.add(room)
    db.commit()
    db.refresh(room)

    return room_response(room)


@router.get("/interview-rooms")
def list_interview_rooms(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    require_hr(user)

    rooms = (
        db.query(InterviewRoom)
        .filter(InterviewRoom.created_by == user.id)
        .order_by(InterviewRoom.created_at.desc())
        .all()
    )

    return [room_response(room) for room in rooms]


@router.get("/interview-rooms/{room_code}")
def get_interview_room(
    room_code: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    # Find the requested interview room
    room = (
        db.query(InterviewRoom)
        .filter(
            InterviewRoom.room_code == room_code.strip().upper()
        )
        .first()
    )

    if not room:
        raise HTTPException(
            status_code=404,
            detail="Interview room not found.",
        )

    # Allow the HR who created the room. Return the invited candidate so
    # the HR client can load the correct resume score for this room.
    if current_user.role == "hr" and room.created_by == current_user.id:
        invitation = (
            db.query(InterviewInvitation)
            .filter(
                InterviewInvitation.room_id == room.id,
                InterviewInvitation.status == "invited",
            )
            .order_by(InterviewInvitation.id.desc())
            .first()
        )
        return {
            "room_code": room.room_code,
            "title": room.title,
            "status": room.status,
            "job_id": room.job_id,
            "candidate_id": invitation.candidate_id if invitation else None,
        }

    # Allow candidates who have been invited to this room
    if current_user.role == "candidate":
        invitation = (
            db.query(InterviewInvitation)
            .filter(
                InterviewInvitation.room_id == room.id,
                InterviewInvitation.candidate_id == current_user.id,
                InterviewInvitation.status == "invited",
            )
            .first()
        )

        if invitation:
            return {
                "room_code": room.room_code,
                "title": room.title,
                "status": room.status,
                "job_id": room.job_id,
                "candidate_id": current_user.id,
            }

    raise HTTPException(
        status_code=403,
        detail="You are not authorized to access this interview room.",
    )
@router.post("/interview-rooms/{room_code}/invite/{candidate_id}")
def invite_candidate(
    room_code: str,
    candidate_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    # Only HR can invite candidates
    if current_user.role != "hr":
        raise HTTPException(
            status_code=403,
            detail="Only HR can invite candidates.",
        )

    # Find the interview room
    room = (
        db.query(InterviewRoom)
        .filter(InterviewRoom.room_code == room_code.strip().upper())
        .first()
    )

    if not room:
        raise HTTPException(
            status_code=404,
            detail="Interview room not found.",
        )

    # Only the HR who created the room can invite candidates
    if room.created_by != current_user.id:
        raise HTTPException(
            status_code=403,
            detail="You cannot invite candidates to this room.",
        )

    # Find the candidate
    candidate = (
        db.query(User)
        .filter(
            User.id == candidate_id,
            User.role == "candidate",
        )
        .first()
    )

    if not candidate:
        raise HTTPException(
            status_code=404,
            detail="Candidate not found.",
        )

    # Candidate must have applied for the room's job
    application = (
        db.query(JobApplication)
        .filter(
            JobApplication.candidate_id == candidate_id,
            JobApplication.job_id == room.job_id,
        )
        .first()
    )

    if not application:
        raise HTTPException(
            status_code=400,
            detail="This candidate has not applied for the associated job.",
        )

    # Check whether an invitation already exists
    invitation = (
        db.query(InterviewInvitation)
        .filter(
            InterviewInvitation.room_id == room.id,
            InterviewInvitation.candidate_id == candidate_id,
        )
        .first()
    )

    if invitation:
        if invitation.status == "invited":
            return {
                "message": "Candidate has already been invited.",
                "invitation_id": invitation.id,
            }

        invitation.status = "invited"
    else:
        invitation = InterviewInvitation(
            room_id=room.id,
            candidate_id=candidate_id,
            status="invited",
        )
        db.add(invitation)

    db.commit()
    db.refresh(invitation)

    return {
        "message": "Candidate invited successfully.",
        "invitation_id": invitation.id,
        "candidate_id": candidate_id,
        "room_code": room.room_code,
        "status": invitation.status,
    }
# =====================================================
# HR CANDIDATE APPLICATIONS
# =====================================================

@router.get("/jobs/{job_id}/applications")
def list_job_applications(
    job_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    # Only HR can view candidate applications.
    require_hr(current_user)

    # Verify that this job belongs to the logged-in HR.
    job = (
        db.query(Job)
        .filter(
            Job.id == job_id,
            Job.created_by == current_user.id,
        )
        .first()
    )

    if not job:
        raise HTTPException(
            status_code=404,
            detail="Job not found.",
        )

    applications = (
        db.query(JobApplication, User)
        .join(
            User,
            JobApplication.candidate_id == User.id,
        )
        .filter(JobApplication.job_id == job_id)
        .all()
    )

    return {
        "job_id": job.id,
        "job_title": job.title,
        "applications": [
            {
                "candidate_id": candidate.id,
                "candidate_name": candidate.full_name,
                "candidate_email": candidate.email,
                "application_id": application.id,
            }
            for application, candidate in applications
        ],
    }
# =====================================================
# HR RESUME ANALYSIS
# =====================================================

from pathlib import Path

from resume_analysis import analyze_resume


@router.get("/jobs/{job_id}/applications/{candidate_id}/analyze-resume")
def analyze_candidate_resume_for_hr(
    job_id: int,
    candidate_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    # Only HR can analyze candidate resumes
    require_hr(current_user)

    # Verify that the job belongs to this HR account
    job = (
        db.query(Job)
        .filter(
            Job.id == job_id,
            Job.created_by == current_user.id,
        )
        .first()
    )

    if not job:
        raise HTTPException(
            status_code=404,
            detail="Job not found.",
        )

    # Verify that the candidate applied for this job
    application = (
        db.query(JobApplication)
        .filter(
            JobApplication.job_id == job_id,
            JobApplication.candidate_id == candidate_id,
        )
        .first()
    )

    if not application:
        raise HTTPException(
            status_code=404,
            detail="Candidate application not found.",
        )

    # Retrieve the candidate's uploaded resume
    profile = (
        db.query(CandidateProfile)
        .filter(
            CandidateProfile.user_id == candidate_id
        )
        .first()
    )

    if not profile or not profile.resume_path:
        raise HTTPException(
            status_code=404,
            detail="The candidate has not uploaded a resume.",
        )

    resume_path = Path(profile.resume_path).resolve()

    if not resume_path.is_file():
        raise HTTPException(
            status_code=404,
            detail="The candidate's resume file could not be found.",
        )

    try:
        result = analyze_resume(
            str(resume_path),
            job.required_skills,
        )
    except (ValueError, FileNotFoundError) as exc:
        raise HTTPException(
            status_code=422,
            detail=str(exc),
        ) from exc

    return {
        "candidate_id": candidate_id,
        "candidate_name": (
            db.query(User.full_name)
            .filter(User.id == candidate_id)
            .scalar()
        ),
        "application_id": application.id,
        "job_id": job.id,
        "job_title": job.title,
        **result,
    }
# =====================================================
# FINAL INTERVIEW EVALUATION
# =====================================================

class InterviewEvaluationRequest(BaseModel):
    eye_gaze_score: int = Field(ge=0, le=10)
    head_orientation_score: int = Field(ge=0, le=10)
    microphone_activity_score: int = Field(ge=0, le=10)
    manual_interview_score: int = Field(ge=0, le=30)

# =====================================================
# FINAL INTERVIEW EVALUATION
# =====================================================

@router.post(
    "/interview-rooms/{room_code}/evaluation/{candidate_id}"
)
def save_interview_evaluation(
    room_code: str,
    candidate_id: int,
    request: InterviewEvaluationRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    require_hr(current_user)

    # Find the interview room.
    room = (
        db.query(InterviewRoom)
        .filter(
            InterviewRoom.room_code == room_code.strip().upper()
        )
        .first()
    )

    if not room:
        raise HTTPException(
            status_code=404,
            detail="Interview room not found.",
        )

    # Verify room ownership.
    if room.created_by != current_user.id:
        raise HTTPException(
            status_code=403,
            detail="You cannot evaluate candidates in this room.",
        )

    # Verify the candidate was invited to this room.
    invitation = (
        db.query(InterviewInvitation)
        .filter(
            InterviewInvitation.room_id == room.id,
            InterviewInvitation.candidate_id == candidate_id,
        )
        .first()
    )

    if not invitation:
        raise HTTPException(
            status_code=404,
            detail="No invitation exists for this candidate and room.",
        )

    # Verify the candidate applied for the associated job.
    application = (
        db.query(JobApplication)
        .filter(
            JobApplication.job_id == room.job_id,
            JobApplication.candidate_id == candidate_id,
        )
        .first()
    )

    if not application:
        raise HTTPException(
            status_code=404,
            detail="Candidate application not found.",
        )

    # Retrieve the job.
    job = (
        db.query(Job)
        .filter(Job.id == room.job_id)
        .first()
    )

    if not job:
        raise HTTPException(
            status_code=404,
            detail="Associated job not found.",
        )

    # Retrieve the uploaded resume.
    profile = (
        db.query(CandidateProfile)
        .filter(
            CandidateProfile.user_id == candidate_id
        )
        .first()
    )

    if not profile or not profile.resume_path:
        raise HTTPException(
            status_code=400,
            detail="Candidate resume is not available.",
        )

    resume_path = Path(profile.resume_path).resolve()

    if not resume_path.is_file():
        raise HTTPException(
            status_code=404,
            detail="Candidate resume file could not be found.",
        )

    # Calculate resume match.
    try:
        resume_result = analyze_resume(
            str(resume_path),
            job.required_skills,
        )
    except (ValueError, FileNotFoundError) as exc:
        raise HTTPException(
            status_code=422,
            detail=str(exc),
        ) from exc

    resume_match = round(
        float(resume_result["skill_match_percentage"])
    )

    if not 0 <= resume_match <= 100:
        raise HTTPException(
            status_code=422,
            detail="Invalid resume score returned by the analyzer.",
        )

    # Convert resume match percentage to its 40-point contribution.
    resume_points = round(resume_match * 0.40)


    # Behavioral scores are already expressed as points out of 10.
    eye_gaze_points = request.eye_gaze_score
    head_points = request.head_orientation_score
    microphone_points = request.microphone_activity_score

    behavioral_score = (
        eye_gaze_points
        + head_points
        + microphone_points
    )

    # HR manually enters a score out of 30.
    manual_points = request.manual_interview_score

    # Final score out of 100.
    overall_score = (
        resume_points
        + eye_gaze_points
        + head_points
        + microphone_points
        + manual_points
    )

    # Find an existing evaluation or create a new one.
    evaluation = (
        db.query(InterviewEvaluation)
        .filter(
            InterviewEvaluation.candidate_id == candidate_id,
            InterviewEvaluation.job_id == room.job_id,
            InterviewEvaluation.room_id == room.id,
        )
        .first()
    )

    if evaluation:
        evaluation.resume_score = resume_match
        evaluation.eye_gaze_score = eye_gaze_points
        evaluation.head_orientation_score = head_points
        evaluation.microphone_activity_score = microphone_points
        evaluation.behavioral_score = behavioral_score
        evaluation.manual_interview_score = manual_points
        evaluation.overall_score = overall_score
        evaluation.evaluation_status = "completed"

    else:
        evaluation = InterviewEvaluation(
            candidate_id=candidate_id,
            job_id=room.job_id,
            room_id=room.id,
            resume_score=resume_match,
            eye_gaze_score=eye_gaze_points,
            head_orientation_score=head_points,
            microphone_activity_score=microphone_points,
            behavioral_score=behavioral_score,
            manual_interview_score=manual_points,
            overall_score=overall_score,
            approval_status="pending",
            evaluation_status="completed",
        )

        db.add(evaluation)

    logger = logging.getLogger(__name__)

    try:
        db.commit()
        db.refresh(evaluation)
    except Exception:
        db.rollback()
        logger.exception("Failed to save interview evaluation")
        raise HTTPException(
            status_code=500,
            detail="Could not save the interview evaluation. Check the backend terminal.",
        )

    return {
        "message": "Interview evaluation saved successfully.",
        "candidate_id": candidate_id,
        "job_id": room.job_id,
        "room_id": room.id,
        "room_code": room.room_code,
        "resume_match_percentage": resume_match,
        "resume_points": resume_points,
        "eye_gaze_score": eye_gaze_points,
        "head_orientation_score": head_points,
        "microphone_activity_score": microphone_points,
        "manual_interview_score": manual_points,
        "overall_score": overall_score,
        "approval_status": evaluation.approval_status,
        "evaluation_status": evaluation.evaluation_status,
    }
# =====================================================
# GET SAVED INTERVIEW EVALUATIONS
# =====================================================

@router.get("/jobs/{job_id}/evaluations")
def get_job_evaluations(
    job_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    # Only HR can view interview evaluations.
    require_hr(current_user)

    # Verify that the job belongs to this HR account.
    job = (
        db.query(Job)
        .filter(
            Job.id == job_id,
            Job.created_by == current_user.id,
        )
        .first()
    )

    if not job:
        raise HTTPException(
            status_code=404,
            detail="Job not found.",
        )

    evaluations = (
        db.query(InterviewEvaluation, User)
        .join(
            User,
            InterviewEvaluation.candidate_id == User.id,
        )
        .filter(
            InterviewEvaluation.job_id == job_id,
            InterviewEvaluation.evaluation_status == "completed",
        )
        .order_by(
            InterviewEvaluation.overall_score.desc()
        )
        .all()
    )

    return {
        "job_id": job.id,
        "job_title": job.title,
        "evaluations": [
            {
                "candidate_id": candidate.id,
                "candidate_name": candidate.full_name,
                "candidate_email": candidate.email,
                "room_id": evaluation.room_id,
                 "resume_score": evaluation.resume_score,
                "resume_points": round(evaluation.resume_score * 0.40),
                "interview_score": (
                    evaluation.eye_gaze_score
                    + evaluation.head_orientation_score
                    + evaluation.microphone_activity_score
                    + evaluation.manual_interview_score
                ),
                "overall_score": evaluation.overall_score,
                "evaluation_status": evaluation.evaluation_status,
                "created_at": (
                    evaluation.created_at.isoformat()
                    if evaluation.created_at
                    else None
                ),
            }
            for evaluation, candidate in evaluations
        ],
    }
# =====================================================
# CANDIDATE RANKING
# =====================================================

@router.get("/candidate-rankings")
def get_candidate_rankings(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    require_hr(current_user)

    results = (
        db.query(InterviewEvaluation, User, Job, InterviewRoom)
        .join(
            User,
            InterviewEvaluation.candidate_id == User.id,
        )
        .join(
            Job,
            InterviewEvaluation.job_id == Job.id,
        )
        .join(
            InterviewRoom,
            InterviewEvaluation.room_id == InterviewRoom.id,
        )
        .filter(
            Job.created_by == current_user.id,
            InterviewEvaluation.evaluation_status == "completed",
        )
        .order_by(
            InterviewEvaluation.overall_score.desc(),
            InterviewEvaluation.created_at.asc(),
        )
        .all()
    )

    return {
        "rankings": [
            {
                "candidate_id": candidate.id,
                "candidate_name": candidate.full_name,
                "candidate_email": candidate.email,
                "job_id": job.id,
                "job_title": job.title,
                "room_id": room.id,
                "room_code": room.room_code,
                 "resume_score": evaluation.resume_score,
                "resume_points": round(evaluation.resume_score * 0.40),
                "eye_gaze_score": evaluation.eye_gaze_score,
                "head_orientation_score": (
                    evaluation.head_orientation_score
                ),
                "microphone_activity_score": (
                    evaluation.microphone_activity_score
                ),
                "manual_interview_score": (
                    evaluation.manual_interview_score
                ),
                "overall_score": evaluation.overall_score,
                "approval_status": evaluation.approval_status,
                "evaluation_status": evaluation.evaluation_status,
                "created_at": (
                    evaluation.created_at.isoformat()
                    if evaluation.created_at
                    else None
                ),
            }
            for evaluation, candidate, job, room in results
        ]
    }


# =====================================================
# SELECT OR REJECT A CANDIDATE
# =====================================================

class CandidateDecisionRequest(BaseModel):
    # The frontend sends approval_status; accept decision too for compatibility.
    approval_status: str | None = Field(
        default=None,
        pattern="^(selected|rejected)$",
    )
    decision: str | None = Field(
        default=None,
        pattern="^(selected|rejected)$",
    )

    def resolved_decision(self) -> str:
        value = self.approval_status or self.decision
        if value not in {"selected", "rejected"}:
            raise ValueError("approval_status must be selected or rejected")
        return value


@router.put(
    "/candidate-rankings/{candidate_id}/{job_id}/decision"
)
def update_candidate_decision(
    candidate_id: int,
    job_id: int,
    request: CandidateDecisionRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    require_hr(current_user)

    job = (
        db.query(Job)
        .filter(
            Job.id == job_id,
            Job.created_by == current_user.id,
        )
        .first()
    )

    if not job:
        raise HTTPException(
            status_code=404,
            detail="Job not found.",
        )

    evaluation = (
        db.query(InterviewEvaluation)
        .filter(
            InterviewEvaluation.candidate_id == candidate_id,
            InterviewEvaluation.job_id == job_id,
            InterviewEvaluation.evaluation_status == "completed",
        )
        .order_by(InterviewEvaluation.overall_score.desc())
        .first()
    )

    if not evaluation:
        raise HTTPException(
            status_code=404,
            detail="No completed evaluation found for this candidate and job.",
        )

    try:
        decision = request.resolved_decision()
    except ValueError as exc:
        raise HTTPException(
            status_code=422,
            detail=str(exc),
        ) from exc

    # Prevent changing a finalized decision.
    current_decision = (
        evaluation.approval_status or "pending"
    ).strip().lower()

    if current_decision in {"selected", "rejected"}:
        raise HTTPException(
            status_code=409,
            detail=(
                f"This candidate has already been {current_decision}. "
                "The final decision cannot be changed."
            ),
        )

    evaluation.approval_status = decision

    try:
        db.commit()
        db.refresh(evaluation)
    except Exception as exc:
        db.rollback()
        raise HTTPException(
            status_code=500,
            detail="Unable to save the candidate decision.",
        ) from exc

    return {
        "message": (
            "Candidate selected successfully."
            if decision == "selected"
            else "Candidate rejected successfully."
        ),
        "candidate_id": candidate_id,
        "job_id": job_id,
        "room_code": (
            db.query(InterviewRoom.room_code)
            .filter(InterviewRoom.id == evaluation.room_id)
            .scalar()
        ),
        "approval_status": evaluation.approval_status,
    }