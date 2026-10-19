export default function ProtectedRoute({
  user,
  allowedRole,
  children,
}) {
  if (!user) {
    return <p>Please sign in to continue.</p>;
  }

  if (user.role !== allowedRole) {
    return <p>You do not have permission to access this page.</p>;
  }

  return children;
}