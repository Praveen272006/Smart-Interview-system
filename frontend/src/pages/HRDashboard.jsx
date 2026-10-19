import { useEffect, useState } from "react";
import VideoCall from "../components/VideoCall";
import api from "../api";

export default function HRDashboard({ user, onLogout }) {
  const [activeTab, setActiveTab] = useState("overview");
  const [activeRoomCode, setActiveRoomCode] = useState("");
  const [jobs, setJobs] = useState([]);
  const [rooms, setRooms] = useState([]);
  const [applications, setApplications] = useState([]);
  const [selectedJob, setSelectedJob] = useState(null);
  const [selectedRooms, setSelectedRooms] = useState({});
  const [candidateRankings, setCandidateRankings] = useState([]);
  const [rankingLoading, setRankingLoading] = useState(false);
  const [decisionLoading, setDecisionLoading] = useState(null);
  const [applicationsLoading, setApplicationsLoading] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [resumeAnalysis, setResumeAnalysis] = useState(null);
  const [resumeAnalysisCandidate, setResumeAnalysisCandidate] = useState(null);
  const [resumeAnalysisLoading, setResumeAnalysisLoading] = useState(false);
  const [resumeAnalysisError, setResumeAnalysisError] = useState("");

  const [jobForm, setJobForm] = useState({
    title: "",
    description: "",
    required_skills: "",
    qualifications: "",
  });

  const [roomForm, setRoomForm] = useState({
    title: "",
    job_id: "",
  });

  async function loadDashboard() {
    setLoading(true);
    setError("");

    try {
      const [jobsResponse, roomsResponse] = await Promise.all([
        api.get("/jobs"),
        api.get("/interview-rooms"),
      ]);

      setJobs(Array.isArray(jobsResponse.data) ? jobsResponse.data : []);
      setRooms(Array.isArray(roomsResponse.data) ? roomsResponse.data : []);
    } catch (err) {
      console.error("Dashboard loading error:", err);
      setError(
        err.response?.data?.detail ||
          "Unable to load dashboard data. Check the backend APIs."
      );
    } finally {
      setLoading(false);
    }
  }

  async function viewApplications(job) {
    setSelectedJob(job);
    setApplications([]);
    setApplicationsLoading(true);
    setError("");
    setSuccess("");

    try {
      const response = await api.get(`/jobs/${job.id}/applications`);
      setApplications(response.data.applications || []);
    } catch (err) {
      setError(
        err.response?.data?.detail ||
          "Unable to load candidate applications."
      );
    } finally {
      setApplicationsLoading(false);
    }
  }

  async function inviteCandidate(roomCode, candidateId) {
    setError("");
    setSuccess("");

    try {
      const response = await api.post(
        `/interview-rooms/${encodeURIComponent(roomCode)}/invite/${candidateId}`
      );
      setSuccess(response.data.message || "Candidate invited successfully!");
    } catch (err) {
      setError(
        err.response?.data?.detail || "Unable to invite the candidate."
      );
    }
  }

  async function loadCandidateRankings() {
    setRankingLoading(true);
    setError("");

    try {
      const response = await api.get("/candidate-rankings");
      const rankings = Array.isArray(response.data)
        ? response.data
        : response.data.rankings || [];

      setCandidateRankings(
        [...rankings].sort(
          (a, b) => Number(b.overall_score || 0) - Number(a.overall_score || 0)
        )
      );
    } catch (err) {
      setError(
        err.response?.data?.detail ||
          "Unable to load candidate rankings. Confirm that the ranking API exists in the backend."
      );
      setCandidateRankings([]);
    } finally {
      setRankingLoading(false);
    }
  }

  async function openResumeAnalysis(candidate) {
    setResumeAnalysisCandidate(candidate);
    setResumeAnalysis(null);
    setResumeAnalysisError("");
    setResumeAnalysisLoading(true);

    try {
      const response = await api.get(
        `/jobs/${candidate.job_id}/applications/${candidate.candidate_id}/analyze-resume`
      );
      setResumeAnalysis(response.data);
    } catch (err) {
      setResumeAnalysisError(
        err.response?.data?.detail ||
          "Unable to load resume analysis. Check that the HR resume-analysis endpoint is enabled."
      );
    } finally {
      setResumeAnalysisLoading(false);
    }
  }

  async function openCandidateResume() {
    if (!resumeAnalysisCandidate) return;

    try {
      const response = await api.get(
        `/jobs/${resumeAnalysisCandidate.job_id}/applications/${resumeAnalysisCandidate.candidate_id}/resume`,
        { responseType: "blob" }
      );
      const fileUrl = URL.createObjectURL(
        new Blob([response.data], { type: "application/pdf" })
      );
      const openedWindow = window.open(fileUrl, "_blank", "noopener,noreferrer");

      if (!openedWindow) {
        const link = document.createElement("a");
        link.href = fileUrl;
        link.target = "_blank";
        link.rel = "noopener noreferrer";
        link.click();
      }

      window.setTimeout(() => URL.revokeObjectURL(fileUrl), 60000);
    } catch (err) {
      setResumeAnalysisError(
        err.response?.data?.detail ||
          "Unable to open the uploaded resume. Check the backend resume endpoint."
      );
    }
  }

  async function updateCandidateDecision(candidateId, jobId, status) {
    const action = status === "selected" ? "select" : "reject";

    if (!window.confirm(`Are you sure you want to ${action} this candidate?`)) {
      return;
    }

    setDecisionLoading(`${candidateId}-${jobId}`);
    setError("");
    setSuccess("");

    try {
      await api.put(
        `/api/candidate-rankings/${candidateId}/${jobId}/decision`,
        { approval_status: status }
      );

      setSuccess(`Candidate ${status} successfully.`);
      await loadCandidateRankings();
    } catch (err) {
      setError(
        err.response?.data?.detail ||
          "Unable to update the candidate decision. Confirm that the decision API exists in the backend."
      );
    } finally {
      setDecisionLoading(null);
    }
  }

  useEffect(() => {
    loadDashboard();
  }, []);

  useEffect(() => {
    if (activeTab === "rankings") {
      loadCandidateRankings();
    }
  }, [activeTab]);

  function handleJobChange(event) {
    const { name, value } = event.target;
    setJobForm((previous) => ({ ...previous, [name]: value }));
  }

  function handleRoomChange(event) {
    const { name, value } = event.target;
    setRoomForm((previous) => ({ ...previous, [name]: value }));
  }

  async function createJob(event) {
    event.preventDefault();
    setError("");
    setSuccess("");

    try {
      await api.post("/jobs", {
        title: jobForm.title.trim(),
        description: jobForm.description.trim(),
        required_skills: jobForm.required_skills.trim(),
        qualifications: jobForm.qualifications.trim(),
      });

      setJobForm({
        title: "",
        description: "",
        required_skills: "",
        qualifications: "",
      });
      setSuccess("Job created successfully!");
      setActiveTab("jobs");
      await loadDashboard();
    } catch (err) {
      console.error("Create job error:", err);
      setError(err.response?.data?.detail || "Unable to create the job.");
    }
  }

  async function createRoom(event) {
    event.preventDefault();
    setError("");
    setSuccess("");

    if (!roomForm.job_id) {
      setError("Please select a job.");
      return;
    }

    try {
      const response = await api.post("/interview-rooms", {
        title: roomForm.title.trim(),
        job_id: Number(roomForm.job_id),
      });

      const roomCode =
        response.data.room_code || response.data.room?.room_code;

      setSuccess(
        roomCode
          ? `Interview room created successfully! Room code: ${roomCode}`
          : "Interview room created successfully!"
      );
      setRoomForm({ title: "", job_id: "" });
      setActiveTab("rooms");
      await loadDashboard();
    } catch (err) {
      console.error("Create room error:", err);
      setError(
        err.response?.data?.detail || "Unable to create the interview room."
      );
    }
  }

  async function copyRoomCode(roomCode) {
    try {
      await navigator.clipboard.writeText(roomCode);
      setSuccess(`Room code ${roomCode} copied successfully!`);
      setError("");
    } catch {
      setError(
        "Unable to copy automatically. Please select and copy the room code."
      );
    }
  }

  const scheduledRooms = rooms.filter(
    (room) => room.status === "scheduled"
  ).length;

  return (
    <div className="hr-dashboard">
      <header className="dashboard-header">
        <div>
          <h1>AI Interview System</h1>
          <p>HR Recruitment Dashboard</p>
        </div>
        <div className="header-user">
          <div>
            <strong>{user?.full_name || "HR User"}</strong>
            <span>HR Administrator</span>
          </div>
          <button className="logout-button" onClick={onLogout}>
            Sign Out
          </button>
        </div>
      </header>

      <nav className="dashboard-nav">
        {[
          ["overview", "Overview"],
          ["jobs", "Manage Jobs"],
          ["create-job", "Create Job"],
          ["rooms", "Interview Rooms"],
          ["create-room", "Create Room"],
          ["rankings", "Candidate Ranking"],
        ].map(([key, label]) => (
          <button
            key={key}
            className={activeTab === key ? "nav-button active" : "nav-button"}
            onClick={() => {
              setActiveTab(key);
              setError("");
              setSuccess("");
            }}
          >
            {label}
          </button>
        ))}
      </nav>

      {error && <div className="dashboard-alert error-alert">{error}</div>}
      {success && (
        <div className="dashboard-alert success-alert">{success}</div>
      )}
      {loading && (
        <p className="loading-message">Loading dashboard data...</p>
      )}

      {activeTab === "overview" && (
        <section>
          <h2>Welcome back, {user?.full_name || "HR"}!</h2>
          <p className="section-description">
            Manage job openings, create interview rooms, and schedule online
            interviews.
          </p>

          <div className="stats-grid">
            <article className="stat-card">
              <p>Total Jobs</p>
              <h3>{jobs.length}</h3>
            </article>
            <article className="stat-card">
              <p>Interview Rooms</p>
              <h3>{rooms.length}</h3>
            </article>
            <article className="stat-card">
              <p>Scheduled Rooms</p>
              <h3>{scheduledRooms}</h3>
            </article>
          </div>

          <div className="quick-actions">
            <h3>Quick Actions</h3>
            <p>
              Create a job opening, associate an interview room with it, and
              invite candidates from the applications list.
            </p>
            <button
              className="primary-button"
              onClick={() => setActiveTab("create-job")}
            >
              + Create Job
            </button>
            <button
              className="secondary-button"
              onClick={() => setActiveTab("jobs")}
            >
              View Jobs
            </button>
            <button
              className="secondary-button"
              onClick={() => setActiveTab("rooms")}
            >
              View Interview Rooms
            </button>
          </div>
        </section>
      )}

      {activeTab === "jobs" && (
        <section>
          <h2>Manage Jobs</h2>
          <p className="section-description">
            View your job openings and manage applications and interview
            invitations. Final interview scores are handled in Candidate
            Ranking.
          </p>

          <button
            className="primary-button"
            onClick={() => setActiveTab("create-job")}
          >
            + Create Job
          </button>

          {jobs.length === 0 ? (
            <div className="empty-state">
              <h3>No jobs found</h3>
              <p>Create your first job opening to get started.</p>
            </div>
          ) : (
            <div className="card-grid">
              {jobs.map((job) => (
                <article className="data-card" key={job.id}>
                  <h3>{job.title}</h3>
                  <p>{job.description}</p>
                  <p>
                    <strong>Required Skills:</strong>{" "}
                    {job.required_skills || "Not specified"}
                  </p>
                  <p>
                    <strong>Qualifications:</strong>{" "}
                    {job.qualifications || "Not specified"}
                  </p>
                  <p>
                    <strong>Job ID:</strong> {job.id}
                  </p>
                  <button
                    className="primary-button"
                    onClick={() => viewApplications(job)}
                  >
                    View Applications
                  </button>
                </article>
              ))}
            </div>
          )}

          {selectedJob && (
            <div className="applications-section">
              <h2>Applications for {selectedJob.title}</h2>

              {applicationsLoading ? (
                <p>Loading applications...</p>
              ) : applications.length === 0 ? (
                <p>No candidates have applied for this job yet.</p>
              ) : (
                <div className="card-grid">
                  {applications.map((application) => {
                    const jobRooms = rooms.filter(
                      (room) =>
                        Number(room.job_id) === Number(selectedJob.id) &&
                        (room.status === "scheduled" ||
                          room.status === "active")
                    );

                    return (
                      <article
                        className="data-card"
                        key={application.application_id}
                      >
                        <h3>{application.candidate_name || "Candidate"}</h3>
                        <p>
                          <strong>Email:</strong>{" "}
                          {application.candidate_email || "Not available"}
                        </p>
                        <p>
                          <strong>Candidate ID:</strong>{" "}
                          {application.candidate_id}
                        </p>
                        <p>
                          <strong>Application ID:</strong>{" "}
                          {application.application_id}
                        </p>

                        <label htmlFor={`room-${application.candidate_id}`}>
                          Select Interview Room
                        </label>
                        <select
                          id={`room-${application.candidate_id}`}
                          value={selectedRooms[application.candidate_id] || ""}
                          onChange={(event) =>
                            setSelectedRooms((previous) => ({
                              ...previous,
                              [application.candidate_id]: event.target.value,
                            }))
                          }
                        >
                          <option value="">Choose an interview room</option>
                          {jobRooms.map((room) => (
                            <option key={room.id} value={room.room_code}>
                              {room.title} ({room.room_code})
                            </option>
                          ))}
                        </select>

                        <button
                          className="primary-button"
                          disabled={!selectedRooms[application.candidate_id]}
                          onClick={() =>
                            inviteCandidate(
                              selectedRooms[application.candidate_id],
                              application.candidate_id
                            )
                          }
                        >
                          Invite to Interview
                        </button>
                      </article>
                    );
                  })}
                </div>
              )}

              <button
                className="secondary-button"
                onClick={() => {
                  setSelectedJob(null);
                  setApplications([]);
                  setError("");
                  setSuccess("");
                }}
              >
                Close Applications
              </button>
            </div>
          )}
        </section>
      )}

      {activeTab === "create-job" && (
        <section>
          <h2>Create Job</h2>
          <p className="section-description">
            Enter the details of the new job opening.
          </p>
          <form className="dashboard-form" onSubmit={createJob}>
            <label htmlFor="job-title">Job Title</label>
            <input
              id="job-title"
              name="title"
              value={jobForm.title}
              onChange={handleJobChange}
              placeholder="e.g. Software Engineer"
              maxLength={200}
              required
            />

            <label htmlFor="job-description">Job Description</label>
            <textarea
              id="job-description"
              name="description"
              value={jobForm.description}
              onChange={handleJobChange}
              placeholder="Describe the responsibilities and role."
              required
              rows={4}
            />

            <label htmlFor="required-skills">Required Skills</label>
            <textarea
              id="required-skills"
              name="required_skills"
              value={jobForm.required_skills}
              onChange={handleJobChange}
              placeholder="Python, React, SQL..."
              required
              rows={3}
            />

            <label htmlFor="qualifications">Qualifications</label>
            <textarea
              id="qualifications"
              name="qualifications"
              value={jobForm.qualifications}
              onChange={handleJobChange}
              placeholder="Required degree or qualifications."
              required
              rows={3}
            />

            <button className="primary-button" type="submit">
              Create Job
            </button>
          </form>
        </section>
      )}

      {activeTab === "rooms" && (
        <section>
          <h2>Interview Rooms</h2>
          <p className="section-description">
            Rooms created by your HR account.
          </p>
          <button
            className="primary-button"
            onClick={() => setActiveTab("create-room")}
          >
            + Create Room
          </button>

          {rooms.length === 0 ? (
            <div className="empty-state">
              <h3>No interview rooms found</h3>
              <p>Create a room for one of your job openings.</p>
            </div>
          ) : (
            <div className="card-grid">
              {rooms.map((room) => {
                const associatedJob = jobs.find(
                  (job) => Number(job.id) === Number(room.job_id)
                );

                return (
                  <article className="data-card" key={room.id}>
                    <h3>{room.title}</h3>
                    <p>
                      <strong>Job:</strong>{" "}
                      {room.job?.title ||
                        associatedJob?.title ||
                        `Job ID ${room.job_id}`}
                    </p>
                    <p>
                      <strong>Status:</strong> {room.status}
                    </p>
                    <label>Room Code</label>
                    <div className="room-code">{room.room_code}</div>

                    <button
                      className="primary-button"
                      onClick={() => copyRoomCode(room.room_code)}
                    >
                      Copy Room Code
                    </button>
                    <button
                      className="primary-button"
                      onClick={() => {
                        setError("");
                        setSuccess("");
                        setActiveRoomCode(room.room_code);
                      }}
                    >
                      Join Interview
                    </button>
                  </article>
                );
              })}
            </div>
          )}
        </section>
      )}

      {activeTab === "create-room" && (
        <section>
          <h2>Create Interview Room</h2>
          <p className="section-description">
            Create a room associated with an existing job opening.
          </p>

          {jobs.length === 0 ? (
            <div className="empty-state">
              <h3>Create a job first</h3>
              <p>You must create a job before creating an interview room.</p>
              <button
                className="primary-button"
                onClick={() => setActiveTab("create-job")}
              >
                Create Job
              </button>
            </div>
          ) : (
            <form className="dashboard-form" onSubmit={createRoom}>
              <label htmlFor="room-title">Room Title</label>
              <input
                id="room-title"
                name="title"
                value={roomForm.title}
                onChange={handleRoomChange}
                placeholder="e.g. Software Engineer Interview"
                maxLength={200}
                required
              />

              <label htmlFor="room-job">Associated Job</label>
              <select
                id="room-job"
                name="job_id"
                value={roomForm.job_id}
                onChange={handleRoomChange}
                required
              >
                <option value="">Select a job</option>
                {jobs.map((job) => (
                  <option key={job.id} value={job.id}>
                    {job.title} (ID: {job.id})
                  </option>
                ))}
              </select>

              <button className="primary-button" type="submit">
                Create Interview Room
              </button>
            </form>
          )}
        </section>
      )}

      {activeTab === "rankings" && (
        <section>
          <h2>Candidate Ranking</h2>
          <p className="section-description">
            Review candidates with saved interview evaluations, compare their
            total scores, and record a selection decision. Scores are intended
            to support HR review and should not be treated as a standalone
            measure of a candidate's suitability.
          </p>

          <button
            className="primary-button"
            onClick={loadCandidateRankings}
            disabled={rankingLoading}
          >
            {rankingLoading ? "Loading Rankings..." : "Refresh Rankings"}
          </button>

          {rankingLoading ? (
            <p>Loading candidate rankings...</p>
          ) : candidateRankings.length === 0 ? (
            <div className="empty-state">
              <h3>No completed evaluations found</h3>
              <p>
                Candidates appear here after their interview evaluation has
                been saved. If you have saved evaluations but this list is
                empty, verify the backend candidate-ranking API.
              </p>
            </div>
          ) : (
            <div className="card-grid">
              {candidateRankings.map((candidate, index) => {
                const decisionKey = `${candidate.candidate_id}-${candidate.job_id}`;
                const isProcessing = decisionLoading === decisionKey;
                const status = (
                  candidate.approval_status || "pending"
                ).toLowerCase();

                return (
                  <article
                    className="data-card"
                    key={`${candidate.candidate_id}-${candidate.job_id}-${candidate.room_id || candidate.room_code || index}`}
                  >
                    <h3>
                      Rank #{index + 1} —{" "}
                      {candidate.candidate_name || "Candidate"}
                    </h3>
                    <p>
                      <strong>Email:</strong>{" "}
                      {candidate.candidate_email || "Not available"}
                    </p>
                    <p>
                      <strong>Job:</strong>{" "}
                      {candidate.job_title || `Job ID ${candidate.job_id}`}
                    </p>
                    <p>
                      <strong>Room:</strong>{" "}
                      {candidate.room_code || "Not available"}
                    </p>

                    <hr />
                    <p>
                      <strong>Resume score:</strong>{" "}
                      <button
                        type="button"
                        className="secondary-button"
                        onClick={() => openResumeAnalysis(candidate)}
                        title="Open resume analysis and uploaded resume"
                      >
                        {candidate.resume_points ??
                          candidate.resume_score ??
                          0}
                        /40 — View Analysis
                      </button>
                    </p>
                    <p>
                      <strong>Eye-gaze score:</strong>{" "}
                      {candidate.eye_gaze_score ?? 0}/10
                    </p>
                    <p>
                      <strong>Head-orientation score:</strong>{" "}
                      {candidate.head_orientation_score ?? 0}/10
                    </p>
                    <p>
                      <strong>Microphone-activity score:</strong>{" "}
                      {candidate.microphone_activity_score ?? 0}/10
                    </p>
                    <p>
                      <strong>Manual interview score:</strong>{" "}
                      {candidate.manual_interview_score ?? 0}/30
                    </p>
                    <p>
                      <strong>Overall score:</strong>{" "}
                      {candidate.overall_score ?? 0}/100
                    </p>
                    <p>
                      <strong>Decision:</strong>{" "}
                      {status.charAt(0).toUpperCase() + status.slice(1)}
                    </p>

                    <div className="ranking-actions">
                      <button
                        className="primary-button"
                        disabled={
                          isProcessing ||
                          status === "selected" ||
                          status === "rejected"
                        }
                        onClick={() =>
                          updateCandidateDecision(
                            candidate.candidate_id,
                            candidate.job_id,
                            "selected"
                          )
                        }
                      >
                        {isProcessing && status !== "selected"
                          ? "Saving..."
                          : "Select Candidate"}
                      </button>
                      <button
                        className="secondary-button"
                        disabled={
                          isProcessing ||
                          status === "selected" ||
                          status === "rejected"
                        }
                        onClick={() =>
                          updateCandidateDecision(
                            candidate.candidate_id,
                            candidate.job_id,
                            "rejected"
                          )
                        }
                      >
                        Reject Candidate
                      </button>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </section>
      )}


      {resumeAnalysisCandidate && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="resume-analysis-title"
          className="resume-analysis-overlay"
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 1000,
            background: "rgba(0, 0, 0, 0.75)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "20px",
            overflowY: "auto",
          }}
        >
          <section
            className="data-card resume-analysis-modal"
            style={{
              width: "min(900px, 100%)",
              maxHeight: "90vh",
              overflowY: "auto",
              background: "var(--card-bg, #111c30)",
              padding: "24px",
            }}
          >
            <h2 id="resume-analysis-title">Resume Analysis</h2>
            <p><strong>Candidate:</strong> {resumeAnalysisCandidate.candidate_name || "Candidate"}</p>
            <p><strong>Candidate ID:</strong> {resumeAnalysisCandidate.candidate_id}</p>
            <p><strong>Application ID:</strong> {resumeAnalysis?.application_id ?? resumeAnalysisCandidate.application_id ?? "Not returned by backend"}</p>
            <p><strong>Job ID:</strong> {resumeAnalysisCandidate.job_id}</p>
            <p><strong>Job Title:</strong> {resumeAnalysis?.job_title || resumeAnalysisCandidate.job_title || "Not available"}</p>
            <p><strong>Interview Room:</strong> {resumeAnalysisCandidate.room_code || "Not assigned"}</p>
            <p><strong>Resume points in ranking:</strong> {resumeAnalysisCandidate.resume_points ?? "Not available"}/40</p>

            <div style={{ display: "flex", gap: "10px", flexWrap: "wrap", margin: "16px 0" }}>
              <button
                className="primary-button"
                type="button"
                onClick={openCandidateResume}
              >
                Open Uploaded Resume (PDF)
              </button>
              <button
                className="secondary-button"
                type="button"
                onClick={() => openResumeAnalysis(resumeAnalysisCandidate)}
                disabled={resumeAnalysisLoading}
              >
                Re-run Resume Analysis
              </button>
            </div>

            {resumeAnalysisLoading && <p>Analyzing resume against the job requirements...</p>}
            {resumeAnalysisError && <div className="dashboard-alert error-alert">{resumeAnalysisError}</div>}

            {resumeAnalysis && (
              <div className="resume-analysis-results">
                <h3>Analysis Output</h3>
                {Object.entries(resumeAnalysis).map(([key, value]) => {
                  if (key === "candidate_id" || key === "candidate_name" || key === "job_id" || key === "job_title" || key === "application_id") {
                    return null;
                  }
                  const label = key
                    .replace(/_/g, " ")
                    .replace(/\b\w/g, (letter) => letter.toUpperCase());
                  const displayValue =
                    value === null || value === undefined
                      ? "Not available"
                      : typeof value === "object"
                        ? JSON.stringify(value, null, 2)
                        : String(value);
                  return (
                    <div key={key} style={{ marginBottom: "12px" }}>
                      <strong>{label}:</strong>
                      {typeof value === "object" && value !== null ? (
                        <pre style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{displayValue}</pre>
                      ) : (
                        <span> {displayValue}</span>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            <button
              className="secondary-button"
              type="button"
              onClick={() => {
                setResumeAnalysisCandidate(null);
                setResumeAnalysis(null);
                setResumeAnalysisError("");
              }}
            >
              Close Analysis
            </button>
          </section>
        </div>
      )}

      {activeRoomCode && (
        <VideoCall
          roomCode={activeRoomCode}
          onLeave={() => setActiveRoomCode("")}
          userRole="hr"
        />
      )}
    </div>
  );
}