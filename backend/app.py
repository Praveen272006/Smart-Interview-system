from database import Base, engine
import models
from database import SessionLocal
from models import InterviewRoom
from candidate import router as candidate_router
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
import socketio
from jobs import router as jobs_router
from database import Base, engine
import models
from auth import router as auth_router
from auth import JWT_SECRET, JWT_ALGORITHM
import jwt
# =========================================================
# 1. SOCKET.IO SERVER
# =========================================================

ALLOWED_ORIGINS = [
    "https://localhost:5173",
    "https://127.0.0.1:5173",
    "https://10.128.250.174:5173",
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    "http://10.222.117.174:5173",
]

sio = socketio.AsyncServer(
    async_mode="asgi",
    cors_allowed_origins=ALLOWED_ORIGINS,
    logger=True,
    engineio_logger=True,
)


# =========================================================
# 2. FASTAPI APPLICATION
# =========================================================

app = FastAPI(
    title="AI-Powered Smart Online Interview System",
    description="Authentication and WebRTC signaling backend",
    version="1.0.0",
)
from fastapi.middleware.cors import CORSMiddleware

# =========================================================
# 3. CORS CONFIGURATION
# =========================================================

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "https://localhost:5173",
        "https://127.0.0.1:5173",
        "https://10.128.250.174:5173",
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://10.222.117.174:5173",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
# =========================================================
# 3. CORS CONFIGURATION
# =========================================================



# =========================================================
# 4. DATABASE INITIALIZATION
# =========================================================

Base.metadata.create_all(bind=engine)


# =========================================================
# 5. AUTHENTICATION ROUTES
# =========================================================

app.include_router(auth_router)
app.include_router(jobs_router)
app.include_router(candidate_router)

# =========================================================
# 6. HOME / HEALTH CHECK
# =========================================================

@app.get("/")
async def home():
    return {
        "message": "AI-Powered Smart Online Interview System",
        "status": "running",
        "services": [
            "Authentication",
            "Database",
            "WebRTC Signaling",
        ],
    }


@app.get("/health")
async def health():
    return {
        "status": "healthy",
    }


# =========================================================
# 7. SOCKET.IO CONNECTION EVENTS
# =========================================================

@sio.event
async def connect(sid, environ, auth=None):
    token = auth.get("token") if isinstance(auth, dict) else None

    if not token:
        print(f"Rejected connection without token: {sid}")
        return False

    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        user_id = int(payload.get("sub"))
        role = payload.get("role")

        if role not in {"hr", "candidate"}:
            return False

        await sio.save_session(
            sid,
            {"user_id": user_id, "role": role},
        )

        print(f"Authenticated Socket.IO connection: {sid}, role={role}")

    except (jwt.InvalidTokenError, TypeError, ValueError):
        print(f"Rejected Socket.IO connection with invalid token: {sid}")
        return False


@sio.event
async def disconnect(sid, reason=None):
    print(f"Disconnected: {sid}")


# =========================================================
# 8. JOIN INTERVIEW ROOM
# =========================================================
@sio.event
async def join_room(sid, data):
    if not isinstance(data, dict):
        await sio.emit(
            "room_error",
            {"message": "Invalid room data."},
            to=sid,
        )
        return

    room_code = data.get("room")

    if not isinstance(room_code, str) or not room_code.strip():
        await sio.emit(
            "room_error",
            {"message": "Please provide a valid interview room code."},
            to=sid,
        )
        return

    room_code = room_code.strip().upper()

    # Get the authenticated user's Socket.IO session.
    try:
        session = await sio.get_session(sid)
    except KeyError:
        await sio.emit(
            "room_error",
            {"message": "Please log in again."},
            to=sid,
        )
        return

    user_id = session.get("user_id")
    role = session.get("role")

    db = SessionLocal()

    try:
        interview_room = (
            db.query(InterviewRoom)
            .filter(InterviewRoom.room_code == room_code)
            .first()
        )

        if not interview_room:
            await sio.emit(
                "room_error",
                {"message": "Interview room not found."},
                to=sid,
            )
            return

        # Only the HR who created the room is allowed.
        authorized = (
            role == "hr"
            and interview_room.created_by == user_id
        )

        # Candidates must have an invitation for this room.
        if role == "candidate":
            from models import InterviewInvitation

            invitation = (
                db.query(InterviewInvitation)
                .filter(
                    InterviewInvitation.room_id == interview_room.id,
                    InterviewInvitation.candidate_id == user_id,
                    InterviewInvitation.status == "invited",
                )
                .first()
            )

            authorized = invitation is not None

        if not authorized:
            await sio.emit(
                "room_error",
                {
                    "message": (
                        "You are not authorized to join this interview room."
                    )
                },
                to=sid,
            )
            return

        if interview_room.status.lower() not in {"scheduled", "active"}:
            await sio.emit(
                "room_error",
                {"message": "This interview room is not available."},
                to=sid,
            )
            return

    finally:
        db.close()

    # Prevent duplicate joins.
    existing_members = sio.manager.rooms["/"].get(room_code, set())

    if sid in existing_members:
        await sio.emit(
            "room_joined",
            {
                "room": room_code,
                "participants": len(existing_members),
            },
            to=sid,
        )
        return

    # A room can contain only two participants.
    if len(existing_members) >= 2:
        await sio.emit(
            "room_full",
            {"message": "This interview room is full."},
            to=sid,
        )
        return

    await sio.enter_room(sid, room_code)

    members = list(sio.manager.rooms["/"].get(room_code, set()))

    await sio.emit(
        "room_joined",
        {
            "room": room_code,
            "participants": len(members),
        },
        to=sid,
    )

    if len(members) == 2:
        await sio.emit(
            "ready",
            {
                "room": room_code,
                "participants": members,
            },
            room=room_code,
        )

    print(
    f"[ROOM DEBUG] Room: {room_code} | "
    f"User ID: {user_id} | "
    f"Role: {role} | "
    f"Socket ID: {sid} | "
    f"Participants: {len(members)} | "
    f"Socket IDs: {members}"
)
# =========================================================
# 9. WEBRTC OFFER
# =========================================================

@sio.event
async def offer(sid, data):
    if not isinstance(data, dict):
        return

    room = data.get("room")

    if not room:
        return

    members = sio.manager.rooms["/"].get(room, set())

    if sid not in members:
        return

    await sio.emit(
        "offer",
        data,
        room=room,
        skip_sid=sid,
    )

    print(f"WebRTC offer forwarded for room {room}")


# =========================================================
# 10. WEBRTC ANSWER
# =========================================================

@sio.event
async def answer(sid, data):
    if not isinstance(data, dict):
        return

    room = data.get("room")

    if not room:
        return

    members = sio.manager.rooms["/"].get(room, set())

    if sid not in members:
        return

    await sio.emit(
        "answer",
        data,
        room=room,
        skip_sid=sid,
    )

    print(f"WebRTC answer forwarded for room {room}")


# =========================================================
# 11. WEBRTC ICE CANDIDATES
# =========================================================

@sio.event
async def ice_candidate(sid, data):
    if not isinstance(data, dict):
        return

    room = data.get("room")

    if not room:
        return

    members = sio.manager.rooms["/"].get(room, set())

    if sid not in members:
        return

    await sio.emit(
        "ice_candidate",
        data,
        room=room,
        skip_sid=sid,
    )
# =========================================================
# 12. CANDIDATE BEHAVIORAL METRICS
# =========================================================

@sio.event
async def behavior_metrics(sid, data):
    if not isinstance(data, dict):
        return

    room = data.get("room")
    metrics = data.get("metrics")

    if not isinstance(room, str) or not isinstance(metrics, dict):
        return

    try:
        session = await sio.get_session(sid)
    except KeyError:
        return

    # Only candidates may submit behavioral metrics.
    if session.get("role") != "candidate":
        return

    # The sender must already be a member of this room.
    members = sio.manager.rooms["/"].get(room, set())

    if sid not in members:
        return

    # Forward only to the other participant, not the candidate.
    await sio.emit(
        "behavior_metrics",
        {
            "room": room,
            "metrics": metrics,
        },
        room=room,
        skip_sid=sid,
    )
# =========================================================
# 12. SOCKET.IO ASGI APPLICATION
# =========================================================

socket_app = socketio.ASGIApp(
    sio,
    other_asgi_app=app,
)
