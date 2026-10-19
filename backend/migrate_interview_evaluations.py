import sqlite3
from pathlib import Path

# Update this path if your database is stored elsewhere.
DATABASE_PATH = Path(__file__).resolve().parent / "interview_system.db"

def migrate_database():
    if not DATABASE_PATH.exists():
        raise FileNotFoundError(
            f"Database not found: {DATABASE_PATH}\n"
            "Check the database path in database.py."
        )

    connection = sqlite3.connect(DATABASE_PATH)

    try:
        cursor = connection.cursor()

        cursor.execute("PRAGMA table_info(interview_evaluations)")
        columns = {
            row[1]
            for row in cursor.fetchall()
        }

        if not columns:
            raise RuntimeError(
                "The interview_evaluations table does not exist. "
                "Check your database configuration."
            )

        new_columns = {
            "eye_gaze_score": (
                "INTEGER NOT NULL DEFAULT 0"
            ),
            "head_orientation_score": (
                "INTEGER NOT NULL DEFAULT 0"
            ),
            "microphone_activity_score": (
                "INTEGER NOT NULL DEFAULT 0"
            ),
            "manual_interview_score": (
                "INTEGER NOT NULL DEFAULT 0"
            ),
            "approval_status": (
                "VARCHAR(30) NOT NULL DEFAULT 'pending'"
            ),
        }

        for column_name, column_definition in new_columns.items():
            if column_name not in columns:
                cursor.execute(
                    f"ALTER TABLE interview_evaluations "
                    f"ADD COLUMN {column_name} {column_definition}"
                )
                print(f"Added column: {column_name}")
            else:
                print(f"Already exists: {column_name}")

        connection.commit()
        print("Database migration completed successfully.")

    except Exception:
        connection.rollback()
        raise

    finally:
        connection.close()


if __name__ == "__main__":
    migrate_database()