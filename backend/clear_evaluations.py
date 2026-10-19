import sqlite3
from pathlib import Path

# Locate the database in the same folder as this script
db_path = Path(__file__).resolve().parent / "interview_system.db"

# Connect to the database
connection = sqlite3.connect(db_path)

try:
    cursor = connection.cursor()

    # Show the number of existing evaluations
    cursor.execute("SELECT COUNT(*) FROM interview_evaluations")
    before = cursor.fetchone()[0]

    print(f"Existing interview evaluations: {before}")

    # Delete old interview evaluations only
    cursor.execute("DELETE FROM interview_evaluations")

    connection.commit()

    # Verify the deletion
    cursor.execute("SELECT COUNT(*) FROM interview_evaluations")
    after = cursor.fetchone()[0]

    print(f"Remaining interview evaluations: {after}")
    print("Finished successfully.")

except Exception as error:
    connection.rollback()
    print(f"Error: {error}")

finally:
    connection.close()