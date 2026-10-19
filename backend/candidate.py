import os
import uuid

from pathlib import Path

from fastapi import (
    APIRouter,
    Depends,
    HTTPException,
    UploadFile,
    File,
    status,
)
from fastapi.responses import FileResponse

from pydantic import BaseModel, Field

from sqlalchemy.orm import Session

from database import get_db
from auth import get_current_user
from models import User, Job, CandidateProfile, JobApplication, InterviewEvaluation
from resume_analysis import analyze_resume
from models import InterviewInvitation, InterviewRoom, Job
router = APIRouter(
    prefix="/api",
    tags=["Candidate"],
)


# =====================================================
# UPLOAD CONFIGURATION
# =====================================================

BASE_DIR = Path(__file__).resolve().parent

RESUME_DIR = BASE_DIR / "uploads" / "resumes"

RESUME_DIR.mkdir(parents=True, exist_ok=True)

MAX_RESUME_SIZE = 5 * 1024 * 1024  # 5 MB


# =====================================================
# REQUEST MODELS
# =====================================================

class CandidateProfileRequest(BaseModel):
    phone: str = Field(default="", max_length=20)

    qualification: str = Field(default="", max_length=200)

    college: str = Field(default="", max_length=200)

    graduation_year: int | None = Field(
        default=None,
        ge=1950,
        le=2100,
    )

    skills: str = Field(default="", max_length=3000)


# =====================================================
# HELPERS
# =====================================================

def require_candidate(user: User):
    if user.role != "candidate":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="This feature is available only to candidates.",
        )


def get_or_create_profile(
    db: Session,
    user: User,
) -> CandidateProfile:

    profile = (
        db.query(CandidateProfile)
        .filter(CandidateProfile.user_id == user.id)
        .first()
    )

    if profile is None:
        profile = CandidateProfile(user_id=user.id)

        db.add(profile)
        db.commit()
        db.refresh(profile)

    return profile


def profile_response(profile: CandidateProfile) -> dict:
    return {
        "id": profile.id,
        "user_id": profile.user_id,
        "phone": profile.phone or "",
        "qualification": profile.qualification or "",
        "college": profile.college or "",
        "graduation_year": profile.graduation_year,
        "skills": profile.skills or "",
        "resume_uploaded": bool(profile.resume_path),
    }


def job_response(job: Job) -> dict:
    return {
        "id": job.id,
        "title": job.title,
        "description": job.description,
        "required_skills": job.required_skills,
        "qualifications": job.qualifications,
        "created_at": (
            job.created_at.isoformat()
            if job.created_at
            else None
        ),
    }


# =====================================================
# GET CANDIDATE PROFILE
# =====================================================

@router.get("/candidate/profile")
def get_candidate_profile(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    require_candidate(user)

    profile = get_or_create_profile(db, user)

    return {
        "full_name": user.full_name,
        "email": user.email,
        **profile_response(profile),
    }


# =====================================================
# CREATE OR UPDATE CANDIDATE PROFILE
# =====================================================

@router.put("/candidate/profile")
def update_candidate_profile(
    request: CandidateProfileRequest,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    require_candidate(user)

    profile = get_or_create_profile(db, user)

    profile.phone = request.phone.strip()
    profile.qualification = request.qualification.strip()
    profile.college = request.college.strip()
    profile.graduation_year = request.graduation_year
    profile.skills = request.skills.strip()

    db.commit()
    db.refresh(profile)

    return {
        "message": "Candidate profile saved successfully.",
        "profile": profile_response(profile),
    }


# =====================================================
# UPLOAD RESUME
# =====================================================

@router.post("/candidate/resume")
async def upload_resume(
    resume: UploadFile = File(...),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    require_candidate(user)

    filename = resume.filename or ""

    if Path(filename).suffix.lower() != ".pdf":
        raise HTTPException(
            status_code=400,
            detail="Only PDF resumes are accepted.",
        )

    content = await resume.read(MAX_RESUME_SIZE + 1)

    if len(content) > MAX_RESUME_SIZE:
        raise HTTPException(
            status_code=413,
            detail="Resume must not exceed 5 MB.",
        )

    # Check the PDF signature rather than trusting
    # the supplied filename or MIME type alone.
    if not content.startswith(b"%PDF-"):
        raise HTTPException(
            status_code=400,
            detail="The uploaded file is not a valid PDF.",
        )

    profile = get_or_create_profile(db, user)

    # Generate a server-controlled filename.
    # Never use the uploaded filename as a filesystem path.
    filename_on_server = f"{user.id}_{uuid.uuid4().hex}.pdf"

    destination = RESUME_DIR / filename_on_server

    old_resume_path = profile.resume_path

    try:
        with destination.open("wb") as output_file:
            output_file.write(content)

        profile.resume_path = str(destination)

        db.commit()

    except Exception:
        db.rollback()

        if destination.exists():
            destination.unlink()

        raise HTTPException(
            status_code=500,
            detail="Could not save the resume.",
        )

    # Remove the old file only after the new file
    # has been saved successfully.
    if old_resume_path:
        try:
            old_path = Path(old_resume_path).resolve()

            if (
                old_path.parent == RESUME_DIR.resolve()
                and old_path != destination.resolve()
                and old_path.exists()
            ):
                old_path.unlink()

        except OSError:
            pass

    return {
        "message": "Resume uploaded successfully.",
        "filename": filename,
        "resume_uploaded": True,
    }


# =====================================================
# LIST AVAILABLE JOBS
# =====================================================

@router.get("/candidate/jobs")
def list_available_jobs(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    require_candidate(user)

    jobs = (
        db.query(Job)
        .order_by(Job.created_at.desc())
        .all()
    )

    return [job_response(job) for job in jobs]


# =====================================================
# APPLY FOR A JOB
# =====================================================

@router.post(
    "/candidate/jobs/{job_id}/apply",
    status_code=status.HTTP_201_CREATED,
)
def apply_for_job(
    job_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    require_candidate(user)

    profile = (
        db.query(CandidateProfile)
        .filter(CandidateProfile.user_id == user.id)
        .first()
    )

    if not profile:
        raise HTTPException(
            status_code=400,
            detail="Please complete your candidate profile first.",
        )

    if not profile.resume_path:
        raise HTTPException(
            status_code=400,
            detail="Please upload your resume before applying.",
        )

    job = (
        db.query(Job)
        .filter(Job.id == job_id)
        .first()
    )

    if not job:
        raise HTTPException(
            status_code=404,
            detail="Job not found.",
        )

    existing_application = (
        db.query(JobApplication)
        .filter(
            JobApplication.candidate_id == user.id,
            JobApplication.job_id == job_id,
        )
        .first()
    )

    if existing_application:
        raise HTTPException(
            status_code=409,
            detail="You have already applied for this job.",
        )

    application = JobApplication(
        candidate_id=user.id,
        job_id=job_id,
        status="applied",
    )

    db.add(application)

    try:
        db.commit()
        db.refresh(application)

    except Exception:
        db.rollback()

        raise HTTPException(
            status_code=409,
            detail="The application could not be created. Check whether you have already applied.",
        )

    return {
        "message": "Job application submitted successfully.",
        "application": {
            "id": application.id,
            "job_id": application.job_id,
            "job_title": job.title,
            "status": application.status,
            "applied_at": (
                application.applied_at.isoformat()
                if application.applied_at
                else None
            ),
        },
    }


# =====================================================
# VIEW MY APPLICATIONS
# =====================================================

@router.get("/candidate/applications")
def list_my_applications(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    require_candidate(user)

    applications = (
        db.query(JobApplication, Job)
        .join(Job, Job.id == JobApplication.job_id)
        .filter(JobApplication.candidate_id == user.id)
        .order_by(JobApplication.applied_at.desc())
        .all()
    )

    results = []

    for application, job in applications:
        # Read the latest completed interview evaluation for this candidate/job.
        evaluation = (
            db.query(InterviewEvaluation)
            .filter(
                InterviewEvaluation.candidate_id == user.id,
                InterviewEvaluation.job_id == job.id,
                InterviewEvaluation.evaluation_status == "completed",
            )
            .order_by(InterviewEvaluation.created_at.desc(), InterviewEvaluation.id.desc())
            .first()
        )

        room = None
        decision = "pending"
        if evaluation:
            decision = (evaluation.approval_status or "pending").lower()
            room = db.query(InterviewRoom).filter(
                InterviewRoom.id == evaluation.room_id
            ).first()

        if decision == "selected":
            result_message = f"Congratulations! You have been selected for {job.title}."
        elif decision == "rejected":
            result_message = f"Thank you for your interest in {job.title}. Unfortunately, you have not been selected."
        else:
            result_message = "Your application is pending review. We will update you when a decision is made."

        results.append({
            "application_id": application.id,
            "candidate_id": user.id,
            "job_id": job.id,
            "job_title": job.title,
            # Keep the original application status separate from the HR decision.
            "status": application.status,
            "application_status": decision,
            "final_result": decision,
            "result_message": result_message,
            "room_id": room.id if room else None,
            "room_code": room.room_code if room else None,
            "overall_score": evaluation.overall_score if evaluation else None,
            "applied_at": (
                application.applied_at.isoformat()
                if application.applied_at
                else None
            ),
        })

    return results
@router.post("/candidate/jobs/{job_id}/analyze-resume")
def analyze_candidate_resume(
    job_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    # Allow candidates only
    if current_user.role.lower() != "candidate":
        raise HTTPException(
            status_code=403,
            detail="Only candidates can analyze resumes."
        )

    # Find the candidate profile
    profile = (
        db.query(CandidateProfile)
        .filter(CandidateProfile.user_id == current_user.id)
        .first()
    )

    if not profile or not profile.resume_path:
        raise HTTPException(
            status_code=400,
            detail="Please upload your resume first."
        )

    # Find the selected job
    job = db.query(Job).filter(Job.id == job_id).first()

    if not job:
        raise HTTPException(
            status_code=404,
            detail="Job not found."
        )

    # Analyze the resume against required skills
    try:
        result = analyze_resume(
            profile.resume_path,
            job.required_skills
        )
    except FileNotFoundError:
        raise HTTPException(
            status_code=404,
            detail="Resume file not found. Please upload it again."
        )
    except ValueError as exc:
        raise HTTPException(
            status_code=400,
            detail=str(exc)
        )

    return {
        "job_id": job.id,
        "job_title": job.title,
        **result
    }
@router.get("/candidate/interview-invitations")
def get_candidate_interview_invitations(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if current_user.role != "candidate":
        raise HTTPException(
            status_code=403,
            detail="Only candidates can view interview invitations.",
        )

    invitations = (
        db.query(InterviewInvitation, InterviewRoom, Job)
        .join(
            InterviewRoom,
            InterviewInvitation.room_id == InterviewRoom.id,
        )
        .join(Job, InterviewRoom.job_id == Job.id)
        .filter(
            InterviewInvitation.candidate_id == current_user.id,
            InterviewInvitation.status == "invited",
        )
        .all()
    )

    return [
        {
            "invitation_id": invitation.id,
            "room_code": room.room_code,
            "room_title": room.title,
            "room_status": room.status,
            "job_id": job.id,
            "job_title": job.title,
            "invitation_status": invitation.status,
        }
        for invitation, room, job in invitations
    ]
@router.get("/jobs/{job_id}/applications/{candidate_id}/resume")
def open_candidate_resume_for_hr(
    job_id: int,
    candidate_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if current_user.role.lower() != "hr":
        raise HTTPException(
            status_code=403,
            detail="Only HR can view candidate resumes.",
        )

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
            detail="Candidate resume not found.",
        )

    resume_path = Path(profile.resume_path).resolve()

    if not resume_path.is_file() or resume_path.suffix.lower() != ".pdf":
        raise HTTPException(
            status_code=404,
            detail="Resume PDF not found.",
        )

    return FileResponse(
        path=str(resume_path),
        media_type="application/pdf",
        filename=f"candidate_{candidate_id}_resume.pdf",
        content_disposition_type="inline",
    )