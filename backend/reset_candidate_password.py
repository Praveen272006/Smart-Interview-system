from getpass import getpass

from database import SessionLocal
from models import User
from pwdlib import PasswordHash

EMAIL = "candidate01@example.com"

password_hash = PasswordHash.recommended()


def main():
    new_password = getpass("Enter the new candidate password: ")
    confirm_password = getpass("Confirm the new password: ")

    if len(new_password) < 8:
        print("Password must contain at least 8 characters.")
        return

    if new_password != confirm_password:
        print("Passwords do not match.")
        return

    db = SessionLocal()

    try:
        user = db.query(User).filter(
            User.email == EMAIL
        ).first()

        if user is None:
            print(f"No account found for {EMAIL}.")
            return

        if user.role != "candidate":
            print("The account is not a candidate account.")
            return

        user.password_hash = password_hash.hash(new_password)
        db.commit()

        print("Candidate password updated successfully.")
        print(f"Email: {EMAIL}")
        print("You can now sign in with the new password.")

    except Exception:
        db.rollback()
        raise

    finally:
        db.close()


if __name__ == "__main__":
    main()