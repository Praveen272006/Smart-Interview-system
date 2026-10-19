import VideoCall from "../components/VideoCall";
import { useEffect, useState } from "react";
import api from "../api";
import "../App.css";

const EMPTY_PROFILE = {
  phone: "",
  qualification: "",
  college: "",
  graduation_year: "",
  skills: "",
};

export default function CandidateDashboard({
  user,
  authData,
  onLogout,
}) {
  const [activeTab, setActiveTab] = useState("overview");
  const [roomCode, setRoomCode] = useState("");
const [activeRoomCode, setActiveRoomCode] = useState("");
  const [profile, setProfile] = useState(EMPTY_PROFILE);
  const [jobs, setJobs] = useState([]);
  const [applications, setApplications] = useState([]);
  const [selectedApplicationId, setSelectedApplicationId] = useState(null);
  const [invitations, setInvitations] = useState([]);
  const [resume, setResume] = useState(null);

  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);

  const [message, setMessage] = useState("");
  const [error, setError] = useState("");


  

  async function loadProfile() {
    const response = await api.get("/candidate/profile");

    setProfile({
      phone: response.data.phone || "",
      qualification: response.data.qualification || "",
      college: response.data.college || "",
      graduation_year:
        response.data.graduation_year ?? "",
      skills: response.data.skills || "",
    });
  }

  async function loadJobs() {
    const response = await api.get("/candidate/jobs");
    setJobs(response.data);
  }

  async function loadApplications() {
    const response = await api.get(
      "/candidate/applications"
    );
    
    setApplications(response.data);
  }
  async function loadInvitations() {
  const response = await api.get(
    "/candidate/interview-invitations"
  );

  setInvitations(response.data);
}
  async function loadDashboard() {
    setLoading(true);
    setError("");

    try {
      await Promise.all([
  loadProfile(),
  loadJobs(),
  loadApplications(),
  loadInvitations(),
]);
    } catch (err) {
      setError(
        err.response?.data?.detail ||
          "Unable to load candidate information. Please check your login."
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadDashboard();

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function handleProfileChange(event) {
    const { name, value } = event.target;

    setProfile((previous) => ({
      ...previous,
      [name]: value,
    }));
  }

  async function saveProfile(event) {
    event.preventDefault();

    setSaving(true);
    setError("");
    setMessage("");

    try {
      const payload = {
        phone: profile.phone,
        qualification: profile.qualification,
        college: profile.college,
        graduation_year:
          profile.graduation_year === ""
            ? null
            : Number(profile.graduation_year),
        skills: profile.skills,
      };

      const response = await api.put(
        "/candidate/profile",
        payload
      );

      setMessage(
        response.data.message ||
          "Profile updated successfully."
      );

      await loadProfile();
    } catch (err) {
      setError(
        err.response?.data?.detail ||
          "Unable to save your profile."
      );
    } finally {
      setSaving(false);
    }
  }

  async function uploadResume(event) {
    event.preventDefault();

    if (!resume) {
      setError("Please select a PDF resume first.");
      return;
    }

    const formData = new FormData();

    formData.append("resume", resume);

    setUploading(true);
    setError("");
    setMessage("");

    try {
      const response = await api.post(
  "/candidate/resume",
  formData,
  {
    headers: {
      "Content-Type": "multipart/form-data",
    },
  }
);

      setMessage(
        response.data.message ||
          "Resume uploaded successfully."
      );

      setResume(null);

      event.target.reset();

      await loadProfile();
    } catch (err) {
      setError(
        err.response?.data?.detail ||
          "Unable to upload the resume."
      );
    } finally {
      setUploading(false);
    }
  }

  async function applyForJob(jobId) {
    setError("");
    setMessage("");

    try {
      const response = await api.post(
        `/candidate/jobs/${jobId}/apply`
      );

      setMessage(
        response.data.message ||
          "Application submitted successfully."
      );

      await loadApplications();
    } catch (err) {
      setError(
        err.response?.data?.detail ||
          "Unable to submit the application."
      );
    }
  }

  function openTab(tab) {
    setActiveTab(tab);
    setMessage("");
    setError("");
  }

  function renderOverview() {
    return (
      <>
        <h2>Welcome back, {user.full_name}!</h2>

        <p className="candidate-description">
          Manage your professional profile, upload your
          resume, apply for jobs, and prepare for interviews.
        </p>

        <div className="candidate-stats">
          <div className="candidate-stat-card">
            <span>Available Jobs</span>
            <strong>{jobs.length}</strong>
          </div>

          <div className="candidate-stat-card">
            <span>My Applications</span>
            <strong>{applications.length}</strong>
          </div>

          <button
            type="button"
            className="candidate-stat-card"
            onClick={() => openTab("applications")}
            style={{ textAlign: "left", cursor: "pointer" }}
          >
            <span>Application Status</span>
            <strong>
              {applications.some((item) => item.application_status === "selected")
                ? "Selected"
                : applications.some((item) => item.application_status === "rejected")
                  ? "Rejected"
                  : "Pending"}
            </strong>
            <span>Click to view results</span>
          </button>
        </div>

        <div className="candidate-panel">
          <h3>Quick Actions</h3>

          <div className="candidate-actions">
            <button
              onClick={() => openTab("profile")}
            >
              Complete Profile
            </button>

            <button
              onClick={() => openTab("resume")}
            >
              Upload Resume
            </button>

            <button
              onClick={() => openTab("jobs")}
            >
              Browse Jobs
            </button>

            <button
              onClick={() => openTab("applications")}
            >
              View Applications
            </button>
          </div>
        </div>
      </>
    );
  }

  function renderProfile() {
    return (
      <div className="candidate-panel">
        <h2>My Profile</h2>

        <p>
          Update your professional and educational
          information.
        </p>

        <form
          className="candidate-form"
          onSubmit={saveProfile}
        >
          <label>Full Name</label>

          <input
            value={user.full_name}
            disabled
          />

          <label>Email Address</label>

          <input
            value={user.email}
            disabled
          />

          <label>Phone Number</label>

          <input
            name="phone"
            value={profile.phone}
            onChange={handleProfileChange}
            maxLength={20}
            placeholder="Enter phone number"
          />

          <label>Qualification</label>

          <input
            name="qualification"
            value={profile.qualification}
            onChange={handleProfileChange}
            maxLength={200}
            placeholder="Enter your qualification"
          />

          <label>College / University</label>

          <input
            name="college"
            value={profile.college}
            onChange={handleProfileChange}
            maxLength={200}
            placeholder="Enter your college"
          />

          <label>Graduation Year</label>

          <input
            name="graduation_year"
            type="number"
            min="1950"
            max="2100"
            value={profile.graduation_year}
            onChange={handleProfileChange}
            placeholder="Enter graduation year"
          />

          <label>Technical Skills</label>

          <textarea
            name="skills"
            value={profile.skills}
            onChange={handleProfileChange}
            maxLength={3000}
            rows={5}
            placeholder="Python, React, FastAPI, SQL..."
          />

          <button
            type="submit"
            disabled={saving}
          >
            {saving
              ? "Saving..."
              : "Save Profile"}
          </button>
        </form>
      </div>
    );
  }

  function renderResume() {
    return (
      <div className="candidate-panel">
        <h2>My Resume</h2>

        <p>
          Upload your resume in PDF format.
          The maximum file size is 5 MB.
        </p>

        <div className="resume-status">
          Current status:{" "}
          <strong>
            {profile.resume_uploaded
              ? "Resume uploaded"
              : "Resume not uploaded"}
          </strong>
        </div>

        <form
          className="candidate-form"
          onSubmit={uploadResume}
        >
          <label>Select Resume (PDF)</label>

          <input
            type="file"
            accept=".pdf,application/pdf"
            onChange={(event) =>
              setResume(event.target.files?.[0] || null)
            }
          />

          {resume && (
            <p>
              Selected file: {resume.name}
            </p>
          )}

          <button
            type="submit"
            disabled={uploading}
          >
            {uploading
              ? "Uploading..."
              : "Upload Resume"}
          </button>
        </form>
      </div>
    );
  }

  function renderJobs() {
    return (
      <div>
        <h2>Available Jobs</h2>

        <p>
          Browse job openings created by HR and submit
          your applications.
        </p>

        {jobs.length === 0 ? (
          <div className="candidate-panel">
            No jobs are available yet. Please check again
            after HR publishes a job opening.
          </div>
        ) : (
          <div className="candidate-job-grid">
            {jobs.map((job) => (
              <article
                className="candidate-panel"
                key={job.id}
              >
                <h3>{job.title}</h3>

                <p>{job.description}</p>

                <p>
                  <strong>Required Skills:</strong>
                  <br />
                  {job.required_skills}
                </p>

                <p>
                  <strong>Qualifications:</strong>
                  <br />
                  {job.qualifications}
                </p>

                <button
                  onClick={() => applyForJob(job.id)}
                >
                  Apply Now
                </button>
              </article>
            ))}
          </div>
        )}
      </div>
    );
  }

  function renderApplications() {
    return (
      <div>
        <h2>My Applications</h2>
        <p>Open an application to view its details and HR's final decision.</p>

        {applications.length === 0 ? (
          <div className="candidate-panel">
            You have not applied for any jobs yet.
          </div>
        ) : (
          <div className="candidate-job-grid">
            {applications.map((application) => {
              const isOpen = selectedApplicationId === application.application_id;
              const result = (application.application_status || "pending").toLowerCase();
              const resultLabel = result === "selected"
                ? "Selected"
                : result === "rejected"
                  ? "Rejected"
                  : "Pending";

              return (
                <article className="candidate-panel" key={application.application_id}>
                  <h3>{application.job_title}</h3>
                  <p><strong>Application Status:</strong> {resultLabel}</p>
                  <p>{application.result_message || "Your application is pending review."}</p>

                  <button
                    type="button"
                    onClick={() => setSelectedApplicationId(isOpen ? null : application.application_id)}
                    aria-expanded={isOpen}
                  >
                    {isOpen ? "Hide Application Details" : "View Application Details"}
                  </button>

                  {isOpen && (
                    <div className="candidate-panel" style={{ marginTop: "16px" }}>
                      <h4>Application Details</h4>
                      <p><strong>Candidate ID:</strong> {application.candidate_id ?? user.id}</p>
                      <p><strong>Application ID:</strong> {application.application_id}</p>
                      <p><strong>Job ID:</strong> {application.job_id}</p>
                      <p><strong>Job Title:</strong> {application.job_title}</p>
                      <p><strong>Room Code:</strong> {application.room_code || "Not Assigned"}</p>
                      <p><strong>Final Result:</strong> {resultLabel}</p>
                      {application.overall_score !== null && application.overall_score !== undefined && (
                        <p><strong>Interview Score:</strong> {application.overall_score}/100</p>
                      )}
                      <p><strong>Application Submitted:</strong> {application.applied_at ? new Date(application.applied_at).toLocaleString() : "Not available"}</p>
                      <p>{application.result_message}</p>
                    </div>
                  )}
                </article>
              );
            })}
          </div>
        )}
      </div>
    );
  }

  function renderInterview() {
  if (activeRoomCode) {
    return (
      <VideoCall
  roomCode={activeRoomCode}
  onLeave={() => setActiveRoomCode("")}
  userRole="candidate"
/>
    );
  }

  return (
    <div className="candidate-panel">
      <h2>Join Interview</h2>

      <p>Enter the interview room code provided by HR.</p>

      <form
        className="candidate-form"
        onSubmit={(event) => {
          event.preventDefault();

          const code = roomCode.trim();

          if (code) {
            setError("");
            setMessage("");
            setActiveRoomCode(code);
          }
        }}
      >
        <label htmlFor="interview-room-code">
          Interview Room Code
        </label>

        <input
          id="interview-room-code"
          type="text"
          value={roomCode}
          onChange={(event) => setRoomCode(event.target.value)}
          placeholder="Enter room code"
          required
        />

        <button type="submit">
          Join Interview
        </button>
      </form>
    </div>
  );
}
function renderInvitations() {
  return (
    <div>
      <h2>Interview Invitations</h2>

      {invitations.length === 0 ? (
        <div className="candidate-panel">
          You have no interview invitations yet.
        </div>
      ) : (
        <div className="candidate-job-grid">
          {invitations.map((invitation) => (
            <article
              className="candidate-panel"
              key={invitation.invitation_id}
            >
              <h3>{invitation.job_title}</h3>

              <p>
                <strong>Interview Room:</strong>{" "}
                {invitation.room_title}
              </p>

              <p>
                <strong>Room Code:</strong>{" "}
                {invitation.room_code}
              </p>

              <p>
                <strong>Room Status:</strong>{" "}
                {invitation.room_status}
              </p>

              <p>
                <strong>Invitation Status:</strong>{" "}
                {invitation.invitation_status}
              </p>

              <button
                onClick={() => {
                  setRoomCode(invitation.room_code);
                  setActiveRoomCode(invitation.room_code);
                  setActiveTab("interview");
                  setError("");
                  setMessage("");
                }}
                disabled={
                  invitation.room_status !== "scheduled" &&
                  invitation.room_status !== "active"
                }
              >
                Join Interview
              </button>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
return (
    <div className="candidate-page">
      <header className="candidate-header">
        <div>
          <h1>AI Interview System</h1>
          <p>Candidate Dashboard</p>
        </div>

        <div className="candidate-user">
          <div>
            <strong>{user.full_name}</strong>
            <span>Candidate</span>
          </div>

          <button
            className="candidate-logout"
            onClick={onLogout}
          >
            Sign Out
          </button>
        </div>
      </header>

      <nav className="candidate-nav">
        {[
  ["overview", "Overview"],
  ["profile", "My Profile"],
  ["resume", "My Resume"],
  ["jobs", "Available Jobs"],
  ["applications", "My Applications"],
  ["invitations", "Interview Invitations"],
  ["interview", "Join Interview"],
].map(([tab, label]) => (
          <button
            key={tab}
            className={
              activeTab === tab ? "active" : ""
            }
            onClick={() => openTab(tab)}
          >
            {label}
          </button>
        ))}
      </nav>

      <main className="candidate-content">
        {message && (
          <div className="candidate-success">
            {message}
          </div>
        )}

        {error && (
          <div className="candidate-error">
            {error}
          </div>
        )}

        {loading ? (
          <div className="candidate-panel">
            Loading your information...
          </div>
        ) : (
          <>
            {activeTab === "overview" &&
              renderOverview()}

            {activeTab === "profile" &&
              renderProfile()}

            {activeTab === "resume" &&
              renderResume()}

            {activeTab === "jobs" &&
              renderJobs()}

            {activeTab === "applications" &&
              renderApplications()}
              {activeTab === "invitations" &&
  renderInvitations()}
              {activeTab === "interview" &&
  renderInterview()}
          </>
        )}
      </main>
    </div>
  );
}
